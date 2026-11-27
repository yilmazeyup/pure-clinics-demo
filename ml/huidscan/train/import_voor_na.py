"""Pure's published before/after photos (VOOR | NA side by side, Pure Clinics band) -> training patches.

    python train/import_voor_na.py --src data/voor-na/src --grades label/voor-na-grades.csv --out data/prepared/voor-na \
        --folds 5 --fold 0

The photos on pureclinics.nl and Instagram are mostly close-ups (a cheek, a nose, half a face), so there is often no
whole face to cut zones from. Instead this cuts square skin patches, the same kind of picture the app's zone crops are,
and gives each patch the grade of its half (VOOR or NA) from the grades file:

    file,half,person,monk,redness,pigmentation,note
    ipl-pure-clinics-voor-na_03.jpg,voor,ipl03,2,3,0,
    ipl-pure-clinics-voor-na_03.jpg,na,ipl03,2,1,0,
    pigment-before.jpg,whole,pig-single,7,0,3,

`half` is voor (left), na (right) or whole (a single photo). `person` groups the photos of one client, so a client is
never in two splits. Grades 0-3 as in the labelling tool; -1 or empty means not graded.

Per half it removes the white Pure Clinics band and the round VOOR/NA badge, keeps skin only (colour test, and eyes,
brows and lips masked out when MediaPipe finds the face), and cuts up to --per-half patches on a grid. Patches are
saved without metadata. --folds/--fold pick the test clients for cross-validation (every client is tested once over
all folds); a few other clients go to validation.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import random
import shutil
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import (  # noqa: E402
    APPLIES, CONCERNS, CROP_PAD, FACE_WIDTH, SHRINK, ZONE_POINTS, ZONES, FaceFinder, load_rgb, monk_group,
)

# MediaPipe outlines to keep out of skin patches.
LIPS = [61, 146, 91, 181, 84, 17, 314, 405, 321, 375, 291, 409, 270, 269, 267, 0, 37, 39, 40, 185]
EYE_A = [33, 7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158, 159, 160, 161, 246]
EYE_B = [263, 249, 390, 373, 374, 380, 381, 382, 362, 398, 384, 385, 386, 387, 388, 466]
BROW_A = [70, 63, 105, 66, 107, 55, 65, 52, 53, 46]
BROW_B = [300, 293, 334, 296, 336, 285, 295, 282, 283, 276]
NOSTRILS = [98, 97, 2, 326, 327, 294, 278, 344, 440, 275, 4, 45, 220, 115, 48, 64]


def band_rows(rgb: np.ndarray) -> np.ndarray:
    """True for rows of the white Pure Clinics band (nearly all pixels white across the whole width)."""
    white = (rgb.min(axis=2) > 232).mean(axis=1)
    rows = white > 0.85
    # Fill the logo line inside the band: short gaps between band rows.
    idx = np.where(rows)[0]
    if len(idx):
        for a, b in zip(idx[:-1], idx[1:]):
            if 1 < b - a < rgb.shape[0] * 0.12:
                rows[a:b] = True
    return rows


def skin_mask(rgb: np.ndarray) -> np.ndarray:
    import cv2

    ycc = cv2.cvtColor(rgb, cv2.COLOR_RGB2YCrCb)
    y, cr, cb = ycc[..., 0], ycc[..., 1], ycc[..., 2]
    return (y > 45) & (cr >= 133) & (cr <= 182) & (cb >= 75) & (cb <= 135)


def mask_features(mask: np.ndarray, lm: np.ndarray) -> None:
    import cv2

    width = lm[:, 0].max() - lm[:, 0].min()
    grow = max(3, int(width * 0.05))
    m = np.zeros(mask.shape, np.uint8)
    for ids in (LIPS, EYE_A, EYE_B, BROW_A, BROW_B, NOSTRILS):
        cv2.fillConvexPoly(m, cv2.convexHull(lm[ids].astype(np.int32)), 1)
    m = cv2.dilate(m, np.ones((grow, grow), np.uint8))
    mask[m > 0] = False


def halves(rgb: np.ndarray, half: str) -> np.ndarray:
    """The part of the image that belongs to `half`, the rows of the white band, and the corner of the badge."""
    h, w = rgb.shape[:2]
    if half == "whole":
        return rgb, np.zeros(h, bool), None
    seam = int(w * 0.02)
    mid = w // 2
    part = rgb[:, : mid - seam] if half == "voor" else rgb[:, mid + seam:]
    return part, band_rows(rgb), "left" if half == "voor" else "right"


def patches(rgb: np.ndarray, band: np.ndarray, badge: str | None, finder: FaceFinder, per_half: int,
            rng: random.Random, min_skin: float) -> list[np.ndarray]:
    h, w = rgb.shape[:2]
    mask = skin_mask(rgb)
    mask[band] = False
    if badge:  # the round VOOR / NA label in the bottom corner
        bh, bw = int(h * 0.3), int(w * 0.3)
        if badge == "left":
            mask[h - bh:, :bw] = False
        else:
            mask[h - bh:, w - bw:] = False
    lm = finder.landmarks(rgb)
    if lm is not None:
        mask_features(mask, lm)
    # Patch size: a share of the photo part that is not band, like a zone crop is a share of a face.
    free_rows = int((~band).sum())
    side = max(48, int(0.36 * min(w, free_rows)))
    step = max(8, side // 3)
    cands = []
    for y in range(0, h - side + 1, step):
        if band[y: y + side].any():
            continue
        for x in range(0, w - side + 1, step):
            share = mask[y: y + side, x: x + side].mean()
            if share >= min_skin:
                cands.append((share, x, y))
    rng.shuffle(cands)
    chosen: list[tuple[int, int]] = []
    for _, x, y in sorted(cands, key=lambda c: -c[0]):
        if all(abs(x - cx) >= side * 0.6 or abs(y - cy) >= side * 0.6 for cx, cy in chosen):
            chosen.append((x, y))
        if len(chosen) >= per_half:
            break
    return [rgb[y: y + side, x: x + side] for x, y in chosen]


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--src", type=Path, required=True)
    ap.add_argument("--grades", type=Path, required=True)
    ap.add_argument("--out", type=Path, required=True)
    ap.add_argument("--size", type=int, default=128)
    ap.add_argument("--per-half", type=int, default=12)
    ap.add_argument("--min-skin", type=float, default=0.75)
    ap.add_argument("--folds", type=int, default=5)
    ap.add_argument("--fold", type=int, default=0)
    ap.add_argument("--val-people", type=int, default=3)
    ap.add_argument("--seed", type=int, default=0)
    args = ap.parse_args()

    import cv2

    rows = [r for r in csv.DictReader(open(args.grades, newline="", encoding="utf-8-sig"))]
    people = sorted({r["person"] for r in rows})
    rng = random.Random(args.seed)
    order = people[:]
    rng.shuffle(order)
    test = set(order[args.fold:: args.folds])
    rest = [p for p in order if p not in test]
    val = set(rest[: args.val_people])
    split = {p: "test" if p in test else "val" if p in val else "train" for p in people}

    if args.out.exists():
        shutil.rmtree(args.out)
    (args.out / "crops").mkdir(parents=True)
    finder = FaceFinder()
    out_rows, report = [], {"halves": 0, "halves_without_patches": 0, "patches": 0}
    for r in rows:
        rgb = load_rgb(args.src / r["file"])
        part, band, badge = halves(rgb, r["half"])
        report["halves"] += 1
        ps = patches(part, band, badge, finder, args.per_half, random.Random(f"{args.seed}{r['file']}{r['half']}"),
                     args.min_skin)
        if not ps:
            report["halves_without_patches"] += 1
            continue
        image_id = hashlib.sha1(f"{r['file']}|{r['half']}".encode()).hexdigest()[:10]
        for i, p in enumerate(ps):
            name = f"{r['person']}_{image_id}_{i}.png"
            small = cv2.resize(p, (args.size, args.size), interpolation=cv2.INTER_AREA)
            cv2.imwrite(str(args.out / "crops" / name), cv2.cvtColor(small, cv2.COLOR_RGB2BGR))
            grade = lambda c: int(r[c]) if (r.get(c) or "").strip() not in {"", "-1"} else -1  # noqa: E731
            out_rows.append({
                "crop": name, "image": image_id, "person": r["person"], "view": r["half"], "monk": r["monk"],
                "monk_group": monk_group(r["monk"]), "zone": "patch", "visible": 1.0, "split": split[r["person"]],
                "redness": grade("redness"), "pigmentation": grade("pigmentation"), "fine_lines": -1,
                "under_eye_dark": -1,
            })
            report["patches"] += 1
    cols = ["crop", "image", "person", "view", "monk", "monk_group", "zone", "visible", "split"] + CONCERNS
    with open(args.out / "zones.csv", "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=cols)
        w.writeheader()
        w.writerows(out_rows)
    meta = {
        "source": "Pure Clinics' own published before/after photos (pureclinics.nl), graded per half",
        "public_licence": None,
        "size": args.size, "face_width": FACE_WIDTH, "crop_pad": CROP_PAD,
        "zones": ZONES, "zone_points": ZONE_POINTS, "shrink": SHRINK, "applies": APPLIES,
        "report": report, "fold": args.fold, "folds": args.folds,
        "people_per_split": {s: sum(1 for p in people if split[p] == s) for s in ("train", "val", "test")},
        "test_people": sorted(test),
    }
    json.dump(meta, open(args.out / "prepare.json", "w"), indent=2)
    print(json.dumps({k: meta[k] for k in ("report", "people_per_split", "test_people")}, indent=2))


if __name__ == "__main__":
    main()
