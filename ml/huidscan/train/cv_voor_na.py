"""Cross-validation on Pure's before/after photos: every client is test data once, never seen in training.

    python train/cv_voor_na.py --name voor-na --folds 5 --minutes 3

Per fold: import_voor_na.py builds the patches, train_zones.py trains redness + pigmentation, and the fold's test
patches are scored. Pooled over all folds it reports, per concern:
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
    ap.add_argument("--src", type=Path, default=ROOT / "data/voor-na/src")
    ap.add_argument("--grades", type=Path, default=ROOT / "label/voor-na-grades.csv")
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
            h.update(person=r["person"], view=r["view"], fold=k, grades={c: int(r[c]) for c in heads})
            for c in heads:
                h["p"][c].append(probs[c][i])
        print(f"fold {k}: {len(rows)} test patches", flush=True)

    report = {"folds": args.folds, "halves": len(halves), "people": len({h["person"] for h in halves.values()})}
    for c in heads:
        y, e, pm = [], [], []
        for h in halves.values():
            g = h["grades"][c]
            if g < 0:
                continue
            p = np.mean(h["p"][c], axis=0)
            y.append(g)
            e.append(float((p * np.arange(4)).sum()))
            pm.append(p)
        y, e, pm = np.array(y), np.array(e), np.array(pm)
        pred = np.clip(np.rint(e), 0, 3).astype(int)
        report[c] = {
            "halves": int(len(y)), "grade_counts": np.bincount(y, minlength=4).tolist(),
            "auroc_visible": auroc((y >= 1).astype(int), pm[:, 1:].sum(1)) if 0 < (y >= 1).sum() < len(y) else None,
            "auroc_clear": auroc((y >= 2).astype(int), pm[:, 2:].sum(1)) if 0 < (y >= 2).sum() < len(y) else None,
            "qwk": qwk(y, pred, 4), "exact": float((pred == y).mean()), "within_one": float((abs(pred - y) <= 1).mean()),
        }
        # Before/after pairs: same photo file, VOOR and NA halves.
        by_file = defaultdict(dict)
        for (k, img), h in halves.items():
            by_file[(h["person"], k)].setdefault(h["view"], []).append(h)
        hit = tot = 0
        for (person, k), views in by_file.items():
            for v in views.get("voor", []):
                for n in views.get("na", []):
                    if v["grades"][c] > n["grades"][c]:
                        ev = float((np.mean(v["p"][c], 0) * np.arange(4)).sum())
                        en = float((np.mean(n["p"][c], 0) * np.arange(4)).sum())
                        tot += 1
                        hit += ev > en
        report[c]["pairs_better"] = f"{hit}/{tot}"
    out = RUNS / f"{args.name}-cv"
    out.mkdir(parents=True, exist_ok=True)
    json.dump(report, open(out / "cv.json", "w"), indent=2)
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
