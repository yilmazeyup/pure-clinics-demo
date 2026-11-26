"""Pilot data: a small subset of Google's SCIN dataset, turned into the same label files the labelling tool exports.

SCIN (Skin Condition Image Network, https://github.com/google-research-datasets/scin) is released under the SCIN Data
Use License: use, adaptation and sharing are allowed, including commercially, provided the attribution is kept and no
one tries to re-identify or re-link the people in it. It has one dermatologist label set per *case*, not per zone and
no boxes, so the labels written here are weak:

  visible redness = 1   the case's weighted condition labels are mostly conditions that show as red skin
  visible redness = 0   the contributor marked the skin as looking healthy and no condition was labelled, or the
                        labelled condition is a non-red one (pigment, scar, dry skin ...)
  everything else       left out

The condition names stay inside this script; they never reach the app (EU MDR: the app names no conditions).
This pilot only proves the pipeline. Its model is not one to ship.

    python train/pilot_scin.py --positives 220 --workers 8
"""

from __future__ import annotations

import argparse
import ast
import csv
import hashlib
import random
import sys
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import DATA  # noqa: E402

BUCKET = "https://storage.googleapis.com/dx-scin-public-data/"
OUT = DATA / "scin"

# Conditions that show as visibly red skin. Matched against SCIN's weighted condition labels; internal only.
RED = {
    "Urticaria", "Eczema", "Allergic Contact Dermatitis", "Acne", "Folliculitis", "Psoriasis", "Rosacea",
    "Insect Bite", "Impetigo", "Drug Rash", "Perioral Dermatitis", "Seborrheic Dermatitis",
    "CD - Contact dermatitis", "Irritant Contact Dermatitis", "Herpes Zoster", "Pityriasis rosea",
    "Photodermatitis", "Herpes Simplex", "Acute dermatitis, NOS", "Hypersensitivity", "Viral Exanthem",
    "Cellulitis", "Erythema multiforme", "Acute and chronic dermatitis", "Contact dermatitis, NOS",
    "Acute dermatitis", "Cutaneous lupus", "Miliaria", "Pyoderma", "Abscess", "Intertrigo",
    "Allergic contact dermatitis caused by allergenic hapten derived from plant",
    "Photocontact dermatitis [berloque dermatitis]",
}
NOT_RED = {
    "Post-Inflammatory hyperpigmentation", "Melasma", "Tinea Versicolor", "Acanthosis nigricans", "Scar Condition",
    "Verruca vulgaris", "Erythema dyschromicum perstans", "Epidermal nevus", "Xerosis", "Ichthyosis",
    "Keratosis pilaris", "Lichen nitidus", "Acne keloidalis",
}
ZONE_ROWS = ["forehead", "cheekL", "cheekR", "nose", "chin", "patch"]

ATTRIBUTION = """# SCIN attribution

Images and labels in this folder come from the SCIN (Skin Condition Image Network) dataset by Google Research,
https://github.com/google-research-datasets/scin , released under the SCIN Data Use License
(https://github.com/google-research-datasets/scin/blob/main/LICENSE). The licence comes with a disclaimer of
warranties (Section 5 of the licence).

Citation: Ward A, Li J, Wang J, et al. Creating an Empirical Dermatology Dataset Through Crowdsourcing With Web Search
Advertisements. JAMA Netw Open. 2024;7(11):e2446615. doi:10.1001/jamanetworkopen.2024.46615

Modifications by Pure Clinics: a subset of head/neck cases was selected; images were cropped and resized; per-case
dermatologist labels were mapped to a weak "visible redness yes/no" label (train/pilot_scin.py). No attempt is or may
be made to re-identify or re-link anyone in the dataset (Section 3(b) of the licence).

Use here: a pipeline test only. Nothing from this folder is shipped in the app.
"""


def fetch(url: str, dest: Path) -> bool:
    if dest.exists() and dest.stat().st_size > 0:
        return True
    try:
        tmp = dest.with_suffix(".part")
        with urllib.request.urlopen(url, timeout=60) as r, open(tmp, "wb") as f:
            f.write(r.read())
        tmp.rename(dest)
        return True
    except Exception as e:  # noqa: BLE001
        print(f"  could not fetch {url}: {e}")
        return False


def weak_label(case: dict, label: dict) -> int | None:
    w = label.get("weighted_skin_condition_label") or ""
    d = ast.literal_eval(w) if w else {}
    if d:
        red = sum(v for k, v in d.items() if k in RED)
        top = max(d, key=d.get)
        if red >= 0.5:
            return 1
        if top in NOT_RED and red < 0.2:
            return 0
        return None
    return 0 if case.get("related_category") == "LOOKS_HEALTHY" else None


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--positives", type=int, default=220, help="images with visible redness to keep (all negatives are kept)")
    ap.add_argument("--workers", type=int, default=8)
    ap.add_argument("--seed", type=int, default=0)
    args = ap.parse_args()

    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "images").mkdir(exist_ok=True)
    (OUT / "labels").mkdir(exist_ok=True)
    for name in ("scin_cases.csv", "scin_labels.csv"):
        if not fetch(BUCKET + "dataset/" + name, OUT / name):
            sys.exit(f"could not download {name}")
    (OUT / "ATTRIBUTION.md").write_text(ATTRIBUTION)

    cases = {r["case_id"]: r for r in csv.DictReader(open(OUT / "scin_cases.csv"))}
    labels = {r["case_id"]: r for r in csv.DictReader(open(OUT / "scin_labels.csv"))}

    rows = []  # (image path in bucket, case_id, y, monk, shot type)
    for cid, case in cases.items():
        if case.get("body_parts_head_or_neck") != "YES":
            continue
        lab = labels.get(cid, {})
        y = weak_label(case, lab)
        if y is None:
            continue
        monk = lab.get("monk_skin_tone_label_us") or lab.get("monk_skin_tone_label_india") or ""
        for i in (1, 2, 3):
            p = case.get(f"image_{i}_path")
            if p:
                rows.append((p, cid, y, monk, case.get(f"image_{i}_shot_type", "")))

    rng = random.Random(args.seed)
    neg = [r for r in rows if r[2] == 0]
    pos = [r for r in rows if r[2] == 1]
    # Keep whole cases together, and take positives case by case until the target is reached.
    pos_cases: dict[str, list] = {}
    for r in pos:
        pos_cases.setdefault(r[1], []).append(r)
    order = list(pos_cases)
    rng.shuffle(order)
    keep_pos: list = []
    for cid in order:
        if len(keep_pos) >= args.positives:
            break
        keep_pos += pos_cases[cid]
    chosen = neg + keep_pos
    print(f"head/neck images with a weak label: {len(rows)} ({len(pos)} red, {len(neg)} not red); keeping {len(chosen)}")

    def get(r):
        dest = OUT / "images" / Path(r[0]).name
        return r, fetch(BUCKET + r[0], dest)

    ok = []
    with ThreadPoolExecutor(args.workers) as pool:
        for r, good in pool.map(get, chosen):
            if good:
                ok.append(r)
    print(f"downloaded {len(ok)} of {len(chosen)} images to {OUT / 'images'}")

    # Labeller-format zone grades: one row per zone, the case's weak label in every zone (grade 2 = clearly visible,
    # 0 = not visible). "patch" is used when no face is found in the photo (most SCIN photos are close-ups).
    out = OUT / "labels" / "zones_SCIN-weak.csv"
    with open(out, "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["image", "person", "view", "labeller", "monk", "quality", "quality_reason", "zone",
                    "redness", "pigmentation", "fine_lines", "under_eye_dark"])
        for path, cid, y, monk, shot in ok:
            person = "S" + hashlib.sha1(cid.encode()).hexdigest()[:10]
            for zone in ZONE_ROWS:
                w.writerow([Path(path).name, person, shot.lower() or "onbekend", "SCIN-weak", monk, "ok", "", zone,
                            2 if y else 0, "", "", ""])
    print(f"weak labels: {out}")


if __name__ == "__main__":
    main()
