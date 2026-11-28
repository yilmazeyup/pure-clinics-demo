"""Grading sheets for whole faces (FairFace, CC BY 4.0) and for a second pass over close-ups (SCIN, Pure's halves).

    python label/make_face_sheets.py faces --out data/grading-face       # FairFace faces, 16 per sheet
    python label/make_face_sheets.py closeups --out data/grading-closeup  # SCIN + Pure halves, acne and texture
    python label/make_face_sheets.py calibration --out data/grading-face  # my own grades as the graders' scale

faces: a sample of FairFace's training split (dlib-aligned 224 px face chips from YFCC-100M Flickr photos), balanced
over age group (10-19 ... 70+), race and gender, kept only when MediaPipe finds the face. Graders give six numbers per
face: redness, pigmentation, acne (blemishes), lines (fine lines and wrinkles), eyes (dark circles and bags under the
eyes), each 0-3, and the Monk tone 1-10. The images are saved as data/fairface/images/ff_<row>.jpg.

closeups: the photos graded before for redness and pigmentation (label/alle-grades.csv, label/genis-grades.csv): SCIN
cases of the head or neck and Pure's halves (PAD-UFES-20 shows single lesions, the rest of SCIN arms and legs), graded
again for acne, texture (pores, scars, rough surface), lines and the eye zone where visible.
Pure's halves are cut as in import_voor_na.py and saved under data/grading-closeup/halves/.

Writes <out>/list.csv (idx, file relative to data/, half, person, monk, source, plus age/race/gender for faces) and
<out>/sheets/sNNN.jpg, numbered as in make_sheets.py. Grades come back as `idx:a,b,c...` lines in <out>/grades/ and
are merged with label/merge_grades.py --fields.
"""

from __future__ import annotations

import argparse
import csv
import io
import random
import sys
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
sys.path.insert(0, str(ROOT / "train"))
sys.path.insert(0, str(ROOT / "label"))

AGES = ["0-2", "3-9", "10-19", "20-29", "30-39", "40-49", "50-59", "60-69", "70+"]
RACES = ["East Asian", "Indian", "Black", "White", "Middle Eastern", "Latino_Hispanic", "Southeast Asian"]


def faces(out: Path, per_age: int, seed: int, exclude: set[str] | None = None) -> list[dict]:
    import pyarrow.parquet as pq
    from PIL import Image

    from common import FaceFinder

    rng = random.Random(seed)
    shards = sorted((DATA / "fairface/parquet").glob("train-*.parquet"))
    cells: dict[tuple, list[tuple]] = defaultdict(list)
    offset = 0
    for s in shards:
        t = pq.read_table(s, columns=["age", "gender", "race"])
        for i, (a, g, r) in enumerate(zip(t.column("age").to_pylist(), t.column("gender").to_pylist(),
                                          t.column("race").to_pylist())):
            if a >= 2 and f"fairface/images/ff_{offset + i:06d}.jpg" not in (exclude or set()):  # 10 and older, new
                cells[(a, r, g)].append((s, i, offset + i))
        offset += t.num_rows
    # Per age group the same number of faces, spread evenly over race x gender; small cells give way to larger ones.
    want: list[tuple] = []
    for a in range(2, 9):
        keys = [(a, r, g) for r in range(7) for g in range(2)]
        pools = {k: rng.sample(cells[k], len(cells[k])) for k in keys}
        take, k = [], 0
        while len(take) < per_age * 1.15 and any(pools.values()):
            key = keys[k % len(keys)]
            if pools[key]:
                take.append((key, pools[key].pop()))
            k += 1
        want += take
    by_shard: dict[Path, list] = defaultdict(list)
    for key, (s, i, row) in want:
        by_shard[s].append((i, row, key))
    finder = FaceFinder()
    (DATA / "fairface/images").mkdir(parents=True, exist_ok=True)
    kept: dict[int, list[dict]] = defaultdict(list)
    for s, items in by_shard.items():
        t = pq.read_table(s, columns=["image"])
        for i, row, (a, r, g) in items:
            if len(kept[a]) >= per_age:
                continue
            raw = t.column("image")[i].as_py()["bytes"]
            img = Image.open(io.BytesIO(raw)).convert("RGB")
            import numpy as np

            if finder.landmarks(np.asarray(img)) is None:
                continue
            name = f"fairface/images/ff_{row:06d}.jpg"
            img.save(DATA / name, quality=95)
            kept[a].append({"file": name, "half": "whole", "person": f"F{row:06d}", "monk": "", "source": "fairface",
                            "age": AGES[a], "race": RACES[r], "gender": "male" if g == 0 else "female"})
    rows = [x for a in sorted(kept) for x in kept[a]]
    rng.shuffle(rows)
    return rows


def closeups(out: Path) -> list[dict]:
    import cv2

    from common import load_rgb
    from import_voor_na import halves

    # SCIN only where the case says head or neck: the rest is mostly arms and legs, not facial acne or pores.
    head_neck = {Path(p).name for c in csv.DictReader(open(DATA / "scin/scin_cases.csv"))
                 if c.get("body_parts_head_or_neck") == "YES"
                 for p in (c["image_1_path"], c["image_2_path"], c["image_3_path"]) if p}
    rows, seen = [], set()
    for g in (ROOT / "label/alle-grades.csv", ROOT / "label/genis-grades.csv"):
        for r in csv.DictReader(open(g, newline="", encoding="utf-8-sig")):
            if r["source"] == "pad-ufes" or (r["file"], r["half"]) in seen:
                continue
            if r["source"] == "scin" and Path(r["file"]).name not in head_neck:
                continue
            seen.add((r["file"], r["half"]))
            file = r["file"]
            if r["half"] != "whole":
                part, _, _ = halves(load_rgb(DATA / r["file"]), r["half"])
                rel = Path("grading-closeup/halves") / f"{Path(r['file']).stem}_{r['half']}.jpg"
                (DATA / rel).parent.mkdir(parents=True, exist_ok=True)
                cv2.imwrite(str(DATA / rel), cv2.cvtColor(part, cv2.COLOR_RGB2BGR), [cv2.IMWRITE_JPEG_QUALITY, 92])
                file = str(rel)
            rows.append({"file": file, "orig": r["file"], "half": r["half"], "person": r["person"], "monk": r["monk"],
                         "source": r["source"]})
    return rows


def main() -> None:
    from make_sheets import sheet

    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("what", choices=["faces", "closeups", "calibration"])
    ap.add_argument("--out", type=Path, required=True)
    ap.add_argument("--per-age", type=int, default=700)
    ap.add_argument("--per-sheet", type=int, default=16)
    ap.add_argument("--seed", type=int, default=7)
    ap.add_argument("--exclude", type=Path, nargs="*", default=[], help="list.csv files whose faces are left out")
    args = ap.parse_args()

    if args.what == "calibration":
        # <out>/calibration.jpg: the photos I graded myself (label/calibration-<face|closeup>.csv), with their grades.
        kind = "face" if "face" in args.out.name else "closeup"
        listing = {r["idx"]: r for r in csv.DictReader(open(args.out / "list.csv"))}
        mine = list(csv.DictReader(open(ROOT / f"label/calibration-{kind}.csv")))
        keys = [k for k in mine[0] if k not in ("idx", "why")]
        sheet([(int(r["idx"]), DATA / listing[r["idx"]]["file"], " ".join(f"{k}{r[k]}" for k in keys)) for r in mine],
              args.out / "calibration.jpg", tile=300)
        print("wrote", args.out / "calibration.jpg")
        return
    exclude = {r["file"] for f in args.exclude for r in csv.DictReader(open(f))}
    rows = faces(args.out, args.per_age, args.seed, exclude) if args.what == "faces" else closeups(args.out)
    (args.out / "sheets").mkdir(parents=True, exist_ok=True)
    (args.out / "grades").mkdir(parents=True, exist_ok=True)
    fields = ["idx"] + list(rows[0].keys())
    with open(args.out / "list.csv", "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=fields)
        w.writeheader()
        for i, r in enumerate(rows):
            w.writerow({"idx": i, **r})
    for k in range(0, len(rows), args.per_sheet):
        part = [(k + j, DATA / r["file"], "") for j, r in enumerate(rows[k: k + args.per_sheet])]
        sheet(part, args.out / "sheets" / f"s{k // args.per_sheet:03d}.jpg")
    print(len(rows), "photos,", (len(rows) + args.per_sheet - 1) // args.per_sheet, "sheets")


if __name__ == "__main__":
    main()
