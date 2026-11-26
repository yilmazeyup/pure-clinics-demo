"""Hoe goed komen twee (of meer) therapeuten overeen? Inter-rater agreement for the labelling tool's exports.

    python3 label/kappa.py huidscan_zones_NV_20261201.csv huidscan_zones_ES_20261201.csv
    python3 label/kappa.py zones_NV.csv zones_ES.csv --boxes boxes_NV.json boxes_ES.json

Only Python's standard library; runs on any Mac. Per pair of therapists:
  zone grades 0-3   quadratic weighted kappa (the main number), exact agreement, within-one agreement
  Monk tone 1-10    quadratic weighted kappa and within-one agreement
  quality           Cohen's kappa on good/bad
  boxes             per class, boxes found by both (IoU >= 0.3) as F1, on photos both marked "vlekjes klaar"
Reading kappa (Landis & Koch): < 0.40 zwak, 0.40-0.60 matig, 0.60-0.80 goed, > 0.80 zeer goed. Below 0.60, sit
together, go through the photos you disagree on, sharpen the grading guide, then label on.
"""

from __future__ import annotations

import argparse
import csv
import itertools
import json
from collections import defaultdict
from pathlib import Path

CONCERNS = ["redness", "pigmentation", "fine_lines", "under_eye_dark"]
NL = {"redness": "roodheid", "pigmentation": "pigment/teint", "fine_lines": "fijne lijntjes",
      "under_eye_dark": "donkere oogzone", "monk": "Monk-tint", "quality": "kwaliteit"}
BOX_NL = {1: "ontstoken onzuiverheid", 2: "mee-eter", 3: "pigmentvlek"}


def kappa(a: list[int], b: list[int], k: int, weights: str = "quadratic") -> float:
    n = len(a)
    if n == 0:
        return float("nan")
    o = [[0.0] * k for _ in range(k)]
    for x, y in zip(a, b):
        o[x][y] += 1
    ra = [sum(r) for r in o]
    cb = [sum(o[i][j] for i in range(k)) for j in range(k)]

    def w(i, j):
        if weights == "quadratic":
            return (i - j) ** 2 / (k - 1) ** 2
        if weights == "linear":
            return abs(i - j) / (k - 1)
        return 0.0 if i == j else 1.0

    num = sum(w(i, j) * o[i][j] for i in range(k) for j in range(k))
    den = sum(w(i, j) * ra[i] * cb[j] / n for i in range(k) for j in range(k))
    return 1.0 - num / den if den > 0 else float("nan")


def word(kv: float) -> str:
    if kv != kv:
        return "te weinig gegevens"
    return "zwak" if kv < 0.4 else "matig" if kv < 0.6 else "goed" if kv < 0.8 else "zeer goed"


def read_zones(path: Path) -> tuple[str, dict, dict, dict]:
    grades, monk, quality = {}, {}, {}
    who = None
    for r in csv.DictReader(open(path, newline="", encoding="utf-8-sig")):
        who = who or r.get("labeller") or path.stem
        if r.get("monk"):
            monk[r["image"]] = int(float(r["monk"]))
        quality[r["image"]] = (r.get("quality") or "ok").strip().lower()
        if not r.get("zone"):
            continue
        for c in CONCERNS:
            v = (r.get(c) or "").strip()
            if v != "":
                grades[(r["image"], r["zone"], c)] = int(float(v))
    return who or path.stem, grades, monk, quality


def iou(a, b) -> float:
    ix = max(0.0, min(a[0] + a[2], b[0] + b[2]) - max(a[0], b[0]))
    iy = max(0.0, min(a[1] + a[3], b[1] + b[3]) - max(a[1], b[1]))
    inter = ix * iy
    u = a[2] * a[3] + b[2] * b[3] - inter
    return inter / u if u > 0 else 0.0


def read_boxes(path: Path) -> dict[str, dict[int, list]]:
    coco = json.load(open(path))
    done = {im["id"]: im["file_name"] for im in coco["images"] if im.get("boxes_done")}
    out: dict[str, dict[int, list]] = {name: defaultdict(list) for name in done.values()}
    for a in coco["annotations"]:
        if a["image_id"] in done:
            out[done[a["image_id"]]][a["category_id"]].append(a["bbox"])
    return out


def box_agreement(a: dict, b: dict, thr: float = 0.3) -> dict[int, tuple[float, int, int, int]]:
    res = {}
    images = set(a) & set(b)
    for cls in BOX_NL:
        matched = na = nb = 0
        for im in images:
            pa, pb = list(a[im].get(cls, [])), list(b[im].get(cls, []))
            na += len(pa)
            nb += len(pb)
            pairs = sorted(((iou(x, y), i, j) for i, x in enumerate(pa) for j, y in enumerate(pb)), reverse=True)
            used_a, used_b = set(), set()
            for v, i, j in pairs:
                if v < thr:
                    break
                if i not in used_a and j not in used_b:
                    used_a.add(i)
                    used_b.add(j)
                    matched += 1
        f1 = 2 * matched / (na + nb) if na + nb else float("nan")
        res[cls] = (f1, matched, na, nb)
    return res


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("zones", type=Path, nargs="+", help="zone CSVs, one per therapist")
    ap.add_argument("--boxes", type=Path, nargs="*", default=[], help="COCO JSONs, one per therapist, same order")
    args = ap.parse_args()
    if len(args.zones) < 2:
        raise SystemExit("Geef minstens twee bestanden, van twee therapeuten.")
    sets = [read_zones(p) for p in args.zones]
    boxes = [read_boxes(p) for p in args.boxes] if len(args.boxes) == len(args.zones) else None

    low = False
    for (i, (wa, ga, ma, qa)), (j, (wb, gb, mb, qb)) in itertools.combinations(enumerate(sets), 2):
        print(f"\n{wa} en {wb}")
        print(f"  {'onderwerp':18s} {'n':>5s} {'kappa':>7s}  {'gelijk':>7s} {'±1':>6s}  oordeel")
        for c in CONCERNS:
            keys = sorted(k for k in ga if k[2] == c and k in gb)
            x, y = [ga[k] for k in keys], [gb[k] for k in keys]
            kv = kappa(x, y, 4)
            same = sum(p == q for p, q in zip(x, y)) / len(keys) if keys else float("nan")
            near = sum(abs(p - q) <= 1 for p, q in zip(x, y)) / len(keys) if keys else float("nan")
            print(f"  {NL[c]:18s} {len(keys):5d} {kv:7.2f}  {same:7.0%} {near:6.0%}  {word(kv)}")
            low |= kv == kv and kv < 0.6
        keys = sorted(set(ma) & set(mb))
        kv = kappa([ma[k] - 1 for k in keys], [mb[k] - 1 for k in keys], 10)
        near = sum(abs(ma[k] - mb[k]) <= 1 for k in keys) / len(keys) if keys else float("nan")
        print(f"  {NL['monk']:18s} {len(keys):5d} {kv:7.2f}  {'':7s} {near:6.0%}  {word(kv)}")
        keys = sorted(set(qa) & set(qb))
        kv = kappa([int(qa[k] == "slecht") for k in keys], [int(qb[k] == "slecht") for k in keys], 2, "none")
        print(f"  {NL['quality']:18s} {len(keys):5d} {kv:7.2f}  {'':7s} {'':6s}  {word(kv)}")
        if boxes:
            ba = box_agreement(boxes[i], boxes[j])
            print(f"  vlekjes (IoU >= 0.3, op foto's die beiden klaar hebben)")
            for cls, (f1, m, na, nb) in ba.items():
                f1s = "  –  " if f1 != f1 else f"{f1:.2f}"
                print(f"    {BOX_NL[cls]:22s} samen gevonden {m:4d}  {wa} {na:4d}  {wb} {nb:4d}  F1 {f1s}")
    if low:
        print("\nEen of meer onderwerpen onder 0.60: bespreek samen de foto's waarop jullie verschillen en scherp de"
              " uitleg van 0-3 aan voordat jullie verder labelen.")


if __name__ == "__main__":
    main()
