"""Cuts the whole face out of every graded photo, for the face model (one zone, "face": MediaPipe's face oval).

    python train/import_faces.py --out data/prepared/face-v1 --size 192

Sources (grades 0-3 per photo; -1 = not judgeable or not graded):
  --faces CSV...            FairFace faces (CC BY 4.0): redness, pigmentation, acne, lines, eyes; default
                            label/face-grades.csv. A face in two of the files (a second grader, label/face-grades-r2.csv)
                            gets the consensus: the same grade, or one of the two at random when they are one apart
                            (unbiased), and it is left out of that head when they are two or more apart
  label/closeup-grades.csv  Pure's halves and SCIN head/neck photos: acne, lines, eyes (texture stays with patches)
  label/alle-grades.csv     redness and pigmentation of those same halves
Only photos where MediaPipe finds a face are used. The face is cut as the app will cut it (scan/model.ts, zone
"face"): eyes levelled, a square around the face oval with a little margin.

People are split by a hash of their id: about 12% test, 6% validation, the rest training; --test-people takes the
test people from an earlier run instead. Writes <out>/crops/*.png, zones.csv and prepare.json as import_voor_na.py.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import APPLIES, EYE_L, EYE_R, FACE_OVAL, FACE_WIDTH, FaceFinder, cut, load_rgb, monk_group, zone_crops  # noqa: E402,F401

ROOT = Path(__file__).resolve().parents[1]
HEADS = ["redness", "pigmentation", "acne", "lines", "eyes"]
PAD = 1.08


def share(person: str) -> float:
    return int(hashlib.sha1(person.encode()).hexdigest()[:8], 16) / 0xFFFFFFFF


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--src", type=Path, default=ROOT / "data")
    ap.add_argument("--out", type=Path, required=True)
    ap.add_argument("--size", type=int, default=192)
    ap.add_argument("--test-share", type=float, default=0.12)
    ap.add_argument("--val-share", type=float, default=0.06)
    ap.add_argument("--test-people", type=Path, help="zones.csv of an earlier run: its test people stay the test set")
    ap.add_argument("--faces", type=Path, nargs="+", default=[ROOT / "label/face-grades.csv"])
    ap.add_argument("--seed", type=int, default=0)
    args = ap.parse_args()

    import cv2

    rp = {(r["file"], r["half"]): r for r in csv.DictReader(open(ROOT / "label/alle-grades.csv"))}
    import random

    rng = random.Random(args.seed)
    by_file: dict[str, list[dict]] = {}
    for f in args.faces:
        for r in csv.DictReader(open(f)):
            by_file.setdefault(r["file"], []).append(r)
    rows: list[dict] = []
    graders = {"one": 0, "two": 0, "dropped": 0}
    for file, rs in by_file.items():
        r = dict(rs[0])
        if len(rs) > 1:
            graders["two"] += 1
            for h in HEADS:
                g = [int(x[h]) for x in rs if int(x[h]) >= 0]
                if len(g) < 2:
                    r[h] = g[0] if g else -1
                elif max(g) - min(g) >= 2:
                    r[h] = -1
                    graders["dropped"] += 1
                else:
                    r[h] = rng.choice(g) if g[0] != g[1] else g[0]
            r["monk"] = next((x["monk"] for x in rs if x.get("monk")), "")
        else:
            graders["one"] += 1
        rows.append({**r, "img": file})
    for r in csv.DictReader(open(ROOT / "label/closeup-grades.csv")):
        if all(int(r[h]) < 0 for h in ("acne", "lines", "eyes")):
            continue
        g = rp.get((r["orig"], r["half"]), {})
        rows.append({**r, "img": r["file"], "redness": g.get("redness", -1), "pigmentation": g.get("pigmentation", -1)})
    fixed = None
    if args.test_people:
        fixed = {x["person"] for x in csv.DictReader(open(args.test_people)) if x["split"] == "test"}

    (args.out / "crops").mkdir(parents=True, exist_ok=True)
    finder = FaceFinder()
    out, skipped = [], 0
    zp = {"face": FACE_OVAL}
    for r in rows:
        grades = {h: int(r.get(h, -1) if r.get(h, "") != "" else -1) for h in HEADS}
        if all(v < 0 for v in grades.values()):
            skipped += 1
            continue
        rgb = load_rgb(args.src / r["img"])
        lm = finder.landmarks(rgb)
        if lm is None:
            skipped += 1
            continue
        crop = zone_crops(lm, args.size, zones=["face"], zone_points=zp, shrink={"face": 1.0}, pad=PAD)[0]
        img = cut(rgb, crop, args.size)
        image_id = hashlib.sha1(f"{r['img']}|{r.get('half', 'whole')}".encode()).hexdigest()[:10]
        name = f"{image_id}_face.png"
        cv2.imwrite(str(args.out / "crops" / name), cv2.cvtColor(img, cv2.COLOR_RGB2BGR))
        p = r["person"]
        if fixed is not None:
            split = "test" if p in fixed else ("val" if share(p) > 1 - args.val_share else "train")
        else:
            u = share(p)
            split = "test" if u < args.test_share else ("val" if u > 1 - args.val_share else "train")
        out.append({"crop": name, "image": image_id, "person": p, "view": "F", "monk": r.get("monk", ""),
                    "monk_group": monk_group(r.get("monk", "")), "zone": "face", "visible": 1.0, "split": split,
                    **grades, "source": r["source"]})
    with open(args.out / "zones.csv", "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=list(out[0].keys()))
        w.writeheader()
        w.writerows(out)
    people = {s: len({x["person"] for x in out if x["split"] == s}) for s in ("train", "val", "test")}
    meta = {
        "source": "FairFace faces (CC BY 4.0), Pure Clinics' own before/after photos and SCIN, graded by Claude",
        "public_licence": None, "size": args.size, "face_width": FACE_WIDTH, "crop_pad": PAD, "zones": ["face"],
        "zone_points": zp, "shrink": {"face": 1.0}, "applies": {h: ["face"] for h in HEADS},
        "report": {"faces": len(out), "skipped": skipped, "graders": graders,
                   "per_source": {s: sum(x["source"] == s for x in out) for s in sorted({x["source"] for x in out})}},
        "people_per_split": people,
    }
    json.dump(meta, open(args.out / "prepare.json", "w"), indent=2)
    print(json.dumps({k: meta[k] for k in ("report", "people_per_split")}, indent=2))
    for h in HEADS:
        vals = [x[h] for x in out if x["split"] == "train" and x[h] >= 0]
        print(h, "train grades", [vals.count(g) for g in range(4)])


if __name__ == "__main__":
    main()
