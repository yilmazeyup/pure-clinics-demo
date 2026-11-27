"""From photos plus the labelling tool's exports to training data: aligned zone crops, detection tiles and a split.

    python train/prepare.py --photos ~/Huidscan/fotos \
        --zones label-exports/zones_NV_20261201.csv label-exports/zones_ES_20261201.csv \
        --boxes label-exports/boxes_NV_20261201.json --out data/prepared/pure-v1

What it does, per photo:
  1. skips photos the therapists marked as bad quality, and the clients in --leave-out;
  2. finds the face with MediaPipe Face Landmarker, levels the eyes and scales the face to a fixed width;
  3. cuts the seven zones as squares (common.zone_crops), scales them to --size and saves them as PNG without any
     metadata, named only by the pseudonym and a hash: no names, dates or EXIF reach data/prepared;
  4. for photos whose boxes are marked done, cuts the aligned face into overlapping tiles for the detector and moves
     the boxes along (COCO files per split).
Then it splits by person (never one person in two splits), with a test set that has the same number of people from
each Monk group (1-3, 4-6, 7-10) as far as the data allows.

Pure's photos are already covered by Pure's consent for training; clients are not asked again. --leave-out takes a
text file with one client code per line for anyone who later asks to be left out. Public datasets with a licence that
allows training (SCIN) pass --public-licence.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import math
import random
import shutil
import sys
from collections import Counter, defaultdict
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import (  # noqa: E402
    APPLIES, BOX_CLASSES, CONCERNS, CROP_PAD, FACE_WIDTH, MONK_GROUPS, SHRINK, ZONE_POINTS, ZONES, FaceFinder, apply,
    align_matrix, cut, load_rgb, monk_group, zone_crops, zone_visible,
)

GRADE_COLS = CONCERNS


def read_leave_out(path: Path | None) -> set[str]:
    """Client codes to leave out, one per line (a CSV with a first column of codes works too)."""
    if path is None:
        return set()
    out = set()
    for line in open(path, encoding="utf-8-sig"):
        code = line.split(",")[0].strip()
        if code and code.lower() not in {"person", "code"}:
            out.add(code)
    return out


def read_zone_labels(paths: list[Path]) -> dict:
    """{image: {"person", "view", "monk": [..], "quality": [..], "labellers": set, "zones": {zone: {concern: [grades]}}}}"""
    images: dict = {}
    for p in paths:
        for r in csv.DictReader(open(p, newline="", encoding="utf-8-sig")):
            im = images.setdefault(r["image"], {
                "person": r["person"], "view": r.get("view", ""), "monk": [], "quality": [], "labellers": set(),
                "zones": defaultdict(lambda: defaultdict(list)),
            })
            lab = r.get("labeller", "")
            if lab not in im["labellers"]:
                im["labellers"].add(lab)
                if r.get("monk"):
                    im["monk"].append(int(float(r["monk"])))
                im["quality"].append((r.get("quality") or "ok").strip().lower())
            for c in GRADE_COLS:
                v = (r.get(c) or "").strip()
                if v != "":
                    im["zones"][r["zone"]][c].append(int(float(v)))
    return images


def merge_grade(values: list[int]) -> int:
    """Two or more therapists: the mean, rounded half up. One: that grade. None: -1 (not graded)."""
    if not values:
        return -1
    return int(math.floor(sum(values) / len(values) + 0.5))


def read_boxes(paths: list[Path], mode: str) -> dict[str, list[dict]]:
    """{file_name: [{"category_id", "bbox"}]} for images whose boxes were marked done by every given labeller."""
    per_file: dict[str, list[list[dict]]] = defaultdict(list)
    for p in paths:
        coco = json.load(open(p))
        by_id = {im["id"]: im for im in coco["images"] if im.get("boxes_done", True)}
        anns = defaultdict(list)
        for a in coco["annotations"]:
            if a["image_id"] in by_id:
                anns[a["image_id"]].append({"category_id": a["category_id"], "bbox": a["bbox"]})
        for iid, im in by_id.items():
            per_file[im["file_name"]].append(anns[iid])
    out = {}
    n_files = len(paths)
    for name, sets in per_file.items():
        if len(sets) < n_files:
            continue  # not finished by every labeller
        out[name] = sets[0] if len(sets) == 1 else fuse(sets, mode)
    return out


def iou(a, b) -> float:
    ax0, ay0, aw, ah = a
    bx0, by0, bw, bh = b
    ix = max(0.0, min(ax0 + aw, bx0 + bw) - max(ax0, bx0))
    iy = max(0.0, min(ay0 + ah, by0 + bh) - max(ay0, by0))
    inter = ix * iy
    union = aw * ah + bw * bh - inter
    return inter / union if union > 0 else 0.0


def fuse(sets: list[list[dict]], mode: str, thr: float = 0.4) -> list[dict]:
    """Boxes from several therapists: group boxes of the same class that overlap, average them. `union` keeps every
    group, `agree` only groups that every therapist drew."""
    groups: list[dict] = []
    for k, boxes in enumerate(sets):
        for b in boxes:
            best, best_iou = None, thr
            for g in groups:
                if g["category_id"] == b["category_id"] and k not in g["by"]:
                    v = iou(g["bbox"], b["bbox"])
                    if v >= best_iou:
                        best, best_iou = g, v
            if best is None:
                groups.append({"category_id": b["category_id"], "bbox": list(b["bbox"]), "all": [b["bbox"]], "by": {k}})
            else:
                best["all"].append(b["bbox"])
                best["by"].add(k)
                best["bbox"] = list(np.mean(best["all"], axis=0))
    need = len(sets) if mode == "agree" else 1
    return [{"category_id": g["category_id"], "bbox": g["bbox"]} for g in groups if len(g["by"]) >= need]


def split_people(people: dict[str, str], test_frac: float, val_frac: float, seed: int) -> tuple[dict[str, str], dict]:
    """people: {person: monk group}. Test gets the same number of people from each Monk group."""
    rng = random.Random(seed)
    by_group: dict[str, list[str]] = defaultdict(list)
    for p, g in sorted(people.items()):
        by_group[g].append(p)
    for g in by_group:
        rng.shuffle(by_group[g])
    known = [g for g in MONK_GROUPS if by_group.get(g)]
    target = round(test_frac * len(people) / max(1, len(known)))
    # The same number from each group; a group with fewer people gives at most half of them, so it still has some
    # left to train on. Such a group is reported as short.
    per_group = {g: min(target, len(by_group[g]) // 2) for g in known}
    split: dict[str, str] = {}
    note = {"test_people_target_per_monk_group": target, "test_people_per_monk_group": per_group,
            "monk_groups_short": [g for g in known if per_group[g] < target],
            "monk_groups_missing": [g for g in MONK_GROUPS if g not in known]}
    for g in known:
        for p in by_group[g][: per_group[g]]:
            split[p] = "test"
    rest = [p for p in people if p not in split]
    rest_by_group: dict[str, list[str]] = defaultdict(list)
    for p in rest:
        rest_by_group[people[p]].append(p)
    for g, ps in rest_by_group.items():
        rng.shuffle(ps)
        n_val = round(val_frac * len(ps))
        for i, p in enumerate(ps):
            split[p] = "val" if i < n_val else "train"
    return split, note


def tiles_for(image: np.ndarray, lm: np.ndarray, boxes: list[dict], face_width: int, tile: int, overlap: float):
    """Aligned face at `face_width`, cut into tile x tile pieces; boxes moved into each piece."""
    import cv2

    a = align_matrix(lm, face_width)
    al = apply(a, lm)
    x0, y0 = al.min(axis=0) - 0.08 * face_width
    x1, y1 = al.max(axis=0) + 0.08 * face_width
    w, h = int(math.ceil(x1 - x0)), int(math.ceil(y1 - y0))
    m = np.vstack([a, [0, 0, 1]])
    m = (np.array([[1, 0, -x0], [0, 1, -y0], [0, 0, 1]]) @ m)[:2]
    scale = float(np.sqrt(abs(np.linalg.det(m[:, :2]))))
    src = image
    mm = m
    if scale < 0.5:
        f = min(1.0, 2.0 * scale)
        src = cv2.resize(image, None, fx=f, fy=f, interpolation=cv2.INTER_AREA)
        mm = m @ np.array([[1 / f, 0, 0], [0, 1 / f, 0], [0, 0, 1]])
    face = cv2.warpAffine(src, mm, (w, h), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_CONSTANT, borderValue=(0, 0, 0))
    moved = []
    for b in boxes:
        bx, by, bw, bh = b["bbox"]
        corners = apply(m, np.array([[bx, by], [bx + bw, by], [bx, by + bh], [bx + bw, by + bh]], dtype=np.float64))
        (cx0, cy0), (cx1, cy1) = corners.min(axis=0), corners.max(axis=0)
        moved.append((b["category_id"], cx0, cy0, cx1, cy1))
    step = max(1, int(tile * (1 - overlap)))
    xs = list(range(0, max(1, w - tile + 1), step)) or [0]
    ys = list(range(0, max(1, h - tile + 1), step)) or [0]
    if xs[-1] + tile < w:
        xs.append(max(0, w - tile))
    if ys[-1] + tile < h:
        ys.append(max(0, h - tile))
    for ty in ys:
        for tx in xs:
            piece = np.zeros((tile, tile, 3), dtype=np.uint8)
            crop = face[ty:ty + tile, tx:tx + tile]
            piece[: crop.shape[0], : crop.shape[1]] = crop
            anns = []
            for cid, bx0, by0, bx1, by1 in moved:
                ix0, iy0 = max(bx0, tx), max(by0, ty)
                ix1, iy1 = min(bx1, tx + tile), min(by1, ty + tile)
                if ix1 <= ix0 or iy1 <= iy0:
                    continue
                inside = (ix1 - ix0) * (iy1 - iy0) / max(1e-6, (bx1 - bx0) * (by1 - by0))
                if inside < 0.6:
                    continue
                anns.append((cid, ix0 - tx, iy0 - ty, ix1 - ix0, iy1 - iy0))
            yield (tx, ty), piece, anns


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--photos", type=Path, required=True, help="folder with the original photos")
    ap.add_argument("--zones", type=Path, nargs="+", required=True, help="zone-grade CSVs from the labelling tool")
    ap.add_argument("--boxes", type=Path, nargs="*", default=[], help="COCO JSONs from the labelling tool")
    ap.add_argument("--box-merge", choices=["union", "agree"], default="union")
    ap.add_argument("--leave-out", type=Path, help="client codes to leave out, one per line")
    ap.add_argument("--public-licence", help="name of the licence that allows training, for public datasets only")
    ap.add_argument("--out", type=Path, required=True)
    ap.add_argument("--size", type=int, default=128, help="zone crop size in pixels")
    ap.add_argument("--min-visible", type=float, default=0.4,
                    help="skip a zone when its area is below this share of the same zone seen from the front")
    ap.add_argument("--patch-fallback", action="store_true",
                    help="no face found: keep one centre crop as zone 'patch' (for close-ups in public datasets)")
    ap.add_argument("--tile", type=int, default=640)
    ap.add_argument("--tile-overlap", type=float, default=0.2)
    ap.add_argument("--tile-face-width", type=int, default=1280)
    ap.add_argument("--test-frac", type=float, default=0.2)
    ap.add_argument("--val-frac", type=float, default=0.15)
    ap.add_argument("--keep-bad", action="store_true", help="keep photos marked as bad quality")
    ap.add_argument("--eval-only", action="store_true",
                    help="put every person in the test split (for evaluation-only data such as MST-E)")
    ap.add_argument("--seed", type=int, default=0)
    args = ap.parse_args()

    import cv2

    # Research-only datasets never go into weights Pure ships.
    where = f"{args.photos} {args.public_licence or ''}".lower()
    for name in ("acne04", "acnescu", "ffhq"):
        if name in where:
            sys.exit(f"{name}: research-only licence, not allowed for a model Pure uses. See README, 'Rules'.")
    # MST-E (Monk skin tone examples) may be used to evaluate, never to train: everything goes to the test split.
    if "mst-e" in where or "mste" in where:
        args.eval_only = True
    leave_out = read_leave_out(args.leave_out)
    labels = read_zone_labels(args.zones)
    boxes = read_boxes(args.boxes, args.box_merge) if args.boxes else {}

    if args.out.exists():
        shutil.rmtree(args.out)
    (args.out / "crops").mkdir(parents=True)
    (args.out / "tiles").mkdir()

    # Typical zone areas on a frontal face, to judge what a side view still shows.
    FRONT_AREA = {"forehead": 0.098, "cheekL": 0.040, "cheekR": 0.042, "nose": 0.020, "chin": 0.015,
                  "underEyeL": 0.034, "underEyeR": 0.036}

    finder = FaceFinder()
    report = Counter()
    rows = []
    tile_rows = []
    people_monk: dict[str, list[int]] = defaultdict(list)
    for name, im in sorted(labels.items()):
        person = im["person"]
        report["photos_labelled"] += 1
        if person in leave_out:
            report["skipped_left_out"] += 1
            continue
        bad = any(q in {"slecht", "bad"} for q in im["quality"])
        if bad and not args.keep_bad:
            report["skipped_bad_quality"] += 1
            continue
        path = args.photos / name
        if not path.exists():
            report["skipped_photo_missing"] += 1
            continue
        rgb = load_rgb(path)
        lm = finder.landmarks(rgb)
        monk = int(np.median(im["monk"])) if im["monk"] else None
        if monk:
            people_monk[person].append(monk)
        tag = hashlib.sha1(name.encode()).hexdigest()[:10]
        grades_for = lambda zone: {c: merge_grade(im["zones"].get(zone, {}).get(c, [])) for c in CONCERNS}  # noqa: E731

        if lm is None:
            report["no_face_found"] += 1
            if not args.patch_fallback or "patch" not in im["zones"]:
                continue
            h, w = rgb.shape[:2]
            side = int(min(h, w) * 0.7)
            y0, x0 = (h - side) // 2, (w - side) // 2
            crop = cv2.resize(rgb[y0:y0 + side, x0:x0 + side], (args.size, args.size), interpolation=cv2.INTER_AREA)
            fname = f"{person}_{tag}_patch.png"
            cv2.imwrite(str(args.out / "crops" / fname), cv2.cvtColor(crop, cv2.COLOR_RGB2BGR))
            rows.append({"crop": fname, "image": tag, "person": person, "view": im["view"], "monk": monk or "",
                         "zone": "patch", "visible": 1.0, **grades_for("patch")})
            report["patch_crops"] += 1
            continue

        report["faces_found"] += 1
        for crop in zone_crops(lm, args.size):
            g = grades_for(crop.zone)
            if all(v < 0 for v in g.values()):
                continue
            vis = zone_visible(lm, crop.zone) / FRONT_AREA[crop.zone]
            if vis < args.min_visible:
                report["zones_hidden"] += 1
                continue
            pix = cut(rgb, crop, args.size)
            fname = f"{person}_{tag}_{crop.zone}.png"
            cv2.imwrite(str(args.out / "crops" / fname), cv2.cvtColor(pix, cv2.COLOR_RGB2BGR))
            rows.append({"crop": fname, "image": tag, "person": person, "view": im["view"], "monk": monk or "",
                         "zone": crop.zone, "visible": round(min(vis, 9.99), 3), **g})
            report["zone_crops"] += 1

        if name in boxes:
            for (tx, ty), piece, anns in tiles_for(rgb, lm, boxes[name], args.tile_face_width, args.tile, args.tile_overlap):
                fname = f"{person}_{tag}_{tx}_{ty}.jpg"
                cv2.imwrite(str(args.out / "tiles" / fname), cv2.cvtColor(piece, cv2.COLOR_RGB2BGR),
                            [cv2.IMWRITE_JPEG_QUALITY, 95])
                tile_rows.append({"file_name": fname, "person": person, "monk": monk or "", "anns": anns})
                report["tiles"] += 1
                report["tile_boxes"] += len(anns)

    people = {p: monk_group(int(np.median(people_monk[p])) if people_monk.get(p) else None)
              for p in {r["person"] for r in rows} | {t["person"] for t in tile_rows}}
    if args.eval_only:
        split, note = {p: "test" for p in people}, {"eval_only": True}
    else:
        split, note = split_people(people, args.test_frac, args.val_frac, args.seed)

    with open(args.out / "zones.csv", "w", newline="") as f:
        cols = ["crop", "image", "person", "view", "monk", "monk_group", "zone", "visible", "split"] + CONCERNS
        w = csv.DictWriter(f, fieldnames=cols)
        w.writeheader()
        for r in rows:
            w.writerow({**r, "monk_group": monk_group(r["monk"]), "split": split[r["person"]]})
    with open(args.out / "splits.csv", "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["person", "monk_group", "split"])
        for p in sorted(people):
            w.writerow([p, people[p], split[p]])

    for part in ("train", "val", "test"):
        coco = {"images": [], "annotations": [], "categories": [{"id": c["id"], "name": c["name"]} for c in BOX_CLASSES]}
        for t in tile_rows:
            if split[t["person"]] != part:
                continue
            iid = len(coco["images"]) + 1
            coco["images"].append({"id": iid, "file_name": t["file_name"], "width": args.tile, "height": args.tile,
                                   "monk_group": monk_group(t["monk"])})
            for cid, x, y, w_, h_ in t["anns"]:
                coco["annotations"].append({"id": len(coco["annotations"]) + 1, "image_id": iid, "category_id": cid,
                                            "bbox": [round(x, 1), round(y, 1), round(w_, 1), round(h_, 1)],
                                            "area": round(w_ * h_, 1), "iscrowd": 0})
        json.dump(coco, open(args.out / f"tiles_{part}.json", "w"))

    counts = Counter((split[r["person"]], monk_group(r["monk"])) for r in rows)
    meta = {
        "source": str(args.public_licence or "Pure Clinics' own photos"),
        "public_licence": args.public_licence,
        "size": args.size, "face_width": FACE_WIDTH, "crop_pad": CROP_PAD,
        "zones": ZONES, "zone_points": ZONE_POINTS, "shrink": SHRINK, "applies": APPLIES,
        "report": dict(report), "split_note": note,
        "crops_per_split_and_monk_group": {f"{s}/{g}": n for (s, g), n in sorted(counts.items())},
        "people_per_split": dict(Counter(split.values())),
    }
    json.dump(meta, open(args.out / "prepare.json", "w"), indent=2)
    print(json.dumps({k: meta[k] for k in ("report", "split_note", "people_per_split", "crops_per_split_and_monk_group")},
                     indent=2))


if __name__ == "__main__":
    main()
