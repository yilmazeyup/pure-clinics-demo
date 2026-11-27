"""Grading sheets for large public sets: SCIN (one image per case) and PAD-UFES-20, 16 photos per sheet.

    python label/make_sheets.py --out data/grading

Writes data/grading/list.csv (idx, file relative to data/, person, monk, source), sheets/sNNN.jpg (4 x 4, numbered),
and calibration.jpg: 16 photos already graded (label/alle-grades.csv) with their grades, so every grader uses the same
scale. Grades come back as text, `idx:R,P` per photo (redness, pigmentation, 0-3), and are merged with
label/merge_grades.py.

Photos already in label/alle-grades.csv are left out. SCIN: Monk tone from the dermatologists' US label when given.
PAD-UFES-20 (CC BY 4.0): Fitzpatrick type mapped to a rough Monk tone, for the report per skin tone only.
"""

from __future__ import annotations

import argparse
import csv
import random
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
FITZ_TO_MONK = {"1": 2, "2": 3, "3": 4, "4": 6, "5": 8, "6": 9}


def scin_rows(done: set[str]) -> list[dict]:
    labels = {r["case_id"]: r for r in csv.DictReader(open(DATA / "scin/scin_labels.csv"))}
    out = []
    for r in csv.DictReader(open(DATA / "scin/scin_cases.csv")):
        p = r["image_1_path"] or r["image_2_path"] or r["image_3_path"]
        if not p:
            continue
        name = Path(p).name
        f = DATA / "scin-full/images" / name
        if not f.exists() or name in done:
            continue
        lab = labels.get(r["case_id"], {})
        monk = (lab.get("monk_skin_tone_label_us") or lab.get("monk_skin_tone_label_india") or "").split(".")[0]
        if not monk:
            fst = (lab.get("dermatologist_fitzpatrick_skin_type_label_1") or "").replace("FST", "")
            monk = str(FITZ_TO_MONK.get(fst, ""))
        out.append({"file": f"scin-full/images/{name}", "person": "S" + r["case_id"].lstrip("-")[-10:],
                    "monk": monk, "source": "scin"})
    return out


def pad_rows() -> list[dict]:
    meta = {r["img_id"]: r for r in csv.DictReader(open(DATA / "pad-ufes/metadata.csv"))}
    out = []
    for f in sorted((DATA / "pad-ufes/images").rglob("*.png")):
        m = meta.get(f.name, {})
        fst = (m.get("fitspatrick") or "").split(".")[0]
        out.append({"file": str(f.relative_to(DATA)), "person": "P" + (m.get("patient_id") or f.stem),
                    "monk": str(FITZ_TO_MONK.get(fst, "")), "source": "pad-ufes"})
    return out


def sheet(files: list[tuple[int, Path, str]], path: Path, tile: int = 280) -> None:
    from PIL import Image, ImageDraw, ImageFont

    font = ImageFont.load_default(size=20)
    cols, rows = 4, (len(files) + 3) // 4
    s = Image.new("RGB", (cols * tile, rows * (tile + 22)), "white")
    d = ImageDraw.Draw(s)
    for j, (idx, f, label) in enumerate(files):
        im = Image.open(f).convert("RGB")
        im.thumbnail((tile, tile))
        x, y = j % cols * tile, j // cols * (tile + 22)
        s.paste(im, (x, y + 22))
        d.text((x + 3, y + 1), f"#{idx} {label}", fill="black", font=font)
    s.save(path, quality=85)


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--out", type=Path, default=DATA / "grading")
    ap.add_argument("--per-sheet", type=int, default=16)
    args = ap.parse_args()

    graded = list(csv.DictReader(open(ROOT / "label/alle-grades.csv")))
    done = {Path(r["file"]).name for r in graded}
    rows = scin_rows(done) + pad_rows()
    (args.out / "sheets").mkdir(parents=True, exist_ok=True)
    with open(args.out / "list.csv", "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=["idx", "file", "person", "monk", "source"])
        w.writeheader()
        for i, r in enumerate(rows):
            w.writerow({"idx": i, **r})
    for k in range(0, len(rows), args.per_sheet):
        part = [(k + j, DATA / r["file"], "") for j, r in enumerate(rows[k: k + args.per_sheet])]
        sheet(part, args.out / "sheets" / f"s{k // args.per_sheet:03d}.jpg")
    # Calibration: graded whole photos covering every grade of both concerns.
    rng = random.Random(1)
    whole = [r for r in graded if r["half"] == "whole"]
    pick = []
    for key in [("redness", g) for g in "0123"] + [("pigmentation", g) for g in "0123"]:
        pool = [r for r in whole if r[key[0]] == key[1] and r not in pick]
        pick += rng.sample(pool, min(2, len(pool)))
    sheet([(i, DATA / r["file"], f"R{r['redness']} P{r['pigmentation']}") for i, r in enumerate(pick[:16])],
          args.out / "calibration.jpg")
    print(len(rows), "photos,", (len(rows) + args.per_sheet - 1) // args.per_sheet, "sheets;",
          sum(r["source"] == "scin" for r in rows), "SCIN,", sum(r["source"] == "pad-ufes" for r in rows), "PAD-UFES")


if __name__ == "__main__":
    main()
