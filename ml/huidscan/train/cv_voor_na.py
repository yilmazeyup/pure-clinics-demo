"""Cross-validation on Pure's before/after photos: every client is test data once, never seen in training.

    python train/cv_voor_na.py --name voor-na --folds 5 --minutes 3

Per fold: import_voor_na.py builds the patches, train_zones.py trains redness + pigmentation, and the fold's test
patches are scored. Pooled over all folds it reports, per concern, for all halves, per source (Pure's own photos,
SCIN) and per Monk group:
  - per photo half (patches averaged): AUROC for "visible" (grade >= 1) and "clear" (grade >= 2), quadratic weighted
    kappa of the rounded grade, exact and within-one agreement;
  - before/after: in how many VOOR/NA pairs the model's reading drops where the grades drop (the treatment result).
Writes runs/<name>-cv/cv.json.
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
from collections import defaultdict
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from common import RUNS  # noqa: E402
from evaluate import Crops, auroc, probs_torch, qwk  # noqa: E402

ROOT = HERE.parent
PY = sys.executable


def run(cmd: list[str]) -> None:
    res = subprocess.run(cmd, cwd=ROOT, capture_output=True, text=True)
    if res.returncode:
        sys.exit(res.stdout[-2000:] + res.stderr[-2000:])


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--name", default="voor-na")
    ap.add_argument("--src", type=Path, default=ROOT / "data")
    ap.add_argument("--grades", type=Path, default=ROOT / "label/alle-grades.csv")
    ap.add_argument("--folds", type=int, default=5)
    ap.add_argument("--minutes", type=float, default=3)
    ap.add_argument("--backbone", default="mobilenetv3_small_100")
    ap.add_argument("--extra", nargs="*", default=[], help="more arguments for import_voor_na.py")
    args = ap.parse_args()

    import csv

    heads = ["redness", "pigmentation"]
    halves = defaultdict(lambda: {"p": defaultdict(list)})  # (image) -> person, view, grades, expected grades
    for k in range(args.folds):
        data = ROOT / f"data/prepared/{args.name}-f{k}"
        name = f"{args.name}-f{k}"
        run([PY, "train/import_voor_na.py", "--src", str(args.src), "--grades", str(args.grades), "--out", str(data),
             "--folds", str(args.folds), "--fold", str(k), *args.extra])
        run([PY, "train/train_zones.py", "--data", str(data), "--name", name, "--concerns", *heads,
             "--minutes", str(args.minutes), "--backbone", args.backbone])
        rows = [r for r in csv.DictReader(open(data / "zones.csv")) if r["split"] == "test"]
        hd = {h: 4 for h in heads}
        probs = probs_torch(RUNS / name, Crops(data, rows, hd, None, False, 128))
        for i, r in enumerate(rows):
            h = halves[(k, r["image"])]
            h.update(person=r["person"], view=r["view"], fold=k, grades={c: int(r[c]) for c in heads},
                     source=r.get("source", ""), monk=r["monk"], monk_group=r["monk_group"])
            for c in heads:
                h["p"][c].append(probs[c][i])
        print(f"fold {k}: {len(rows)} test patches", flush=True)

    def metrics(sel, c):
        y, pm = [], []
        for h in sel:
            g = h["grades"][c]
            if g >= 0:
                y.append(g)
                pm.append(np.mean(h["p"][c], axis=0))
        if not y:
            return None
        y, pm = np.array(y), np.array(pm)
        e = (pm * np.arange(4)).sum(1)
        pred = np.clip(np.rint(e), 0, 3).astype(int)
        ok = lambda t: 0 < (y >= t).sum() < len(y)  # noqa: E731
        return {
            "halves": int(len(y)), "people": len({h["person"] for h in sel}),
            "grade_counts": np.bincount(y, minlength=4).tolist(),
            "auroc_visible": round(auroc((y >= 1).astype(int), pm[:, 1:].sum(1)), 3) if ok(1) else None,
            "auroc_clear": round(auroc((y >= 2).astype(int), pm[:, 2:].sum(1)), 3) if ok(2) else None,
            "qwk": round(qwk(y, pred, 4), 3), "within_one": round(float((abs(pred - y) <= 1).mean()), 3),
            "mean_reading_when_graded_0": round(float(e[y == 0].mean()), 3) if (y == 0).any() else None,
        }

    hs = list(halves.values())
    src = lambda h: "pure" if h["source"].startswith("pure") else h["source"] or "pure"  # noqa: E731
    report = {"folds": args.folds, "halves": len(hs), "people": len({h["person"] for h in hs})}
    for c in heads:
        report[c] = {"all": metrics(hs, c)}
        for s_ in sorted({src(h) for h in hs}):
            report[c][s_] = metrics([h for h in hs if src(h) == s_], c)
        for g in ("1-3", "4-6", "7-10"):
            report[c]["monk " + g] = metrics([h for h in hs if h["monk_group"] == g], c)
        # Before/after: VOOR and NA of the same client (Pure photos), where the grade drops.
        by_person = defaultdict(lambda: defaultdict(list))
        for h in hs:
            if h["view"] in ("voor", "boven"):
                by_person[(h["person"], h["fold"])]["voor"].append(h)
            elif h["view"] in ("na", "onder"):
                by_person[(h["person"], h["fold"])]["na"].append(h)
        hit = tot = 0
        for views in by_person.values():
            for v in views["voor"]:
                for n in views["na"]:
                    if v["grades"][c] > n["grades"][c]:
                        ev = float((np.mean(v["p"][c], 0) * np.arange(4)).sum())
                        en = float((np.mean(n["p"][c], 0) * np.arange(4)).sum())
                        tot += 1
                        hit += ev > en
        report[c]["pairs_better"] = f"{hit}/{tot}"
    readings = [{"person": h["person"], "view": h["view"], "source": h["source"], "monk": h["monk"],
                 **{c: h["grades"][c] for c in heads},
                 **{c + "_reading": round(float((np.mean(h["p"][c], 0) * np.arange(4)).sum()), 3) for c in heads}}
                for h in hs]
    out = RUNS / f"{args.name}-cv"
    out.mkdir(parents=True, exist_ok=True)
    json.dump(report, open(out / "cv.json", "w"), indent=2)
    json.dump(readings, open(out / "readings.json", "w"))
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
