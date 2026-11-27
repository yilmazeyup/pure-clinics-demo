"""Builds classification ZIPs for EVREN (one folder per class) from graded public photos, and keeps a test set apart.

    python train/make_cls_zip.py --out data/evren

Only public data goes into the ZIPs (sources scin and pad-ufes): Pure's client photos never go to EVREN. Clients are
split by person; about 10% of the people are kept out of the ZIPs as a local test set, so a model trained on EVREN
and huidscan-v1 can be compared on the same photos.

Writes:
  data/evren/huidscan-roodheid.zip   roodheid-0 ... roodheid-3 / *.jpg
  data/evren/huidscan-pigment.zip    pigment-0 ... pigment-3 / *.jpg
  data/evren/test/                   test patches + test.csv (crop, image, person, monk, source, redness, pigmentation)
Patches are skin squares cut as in import_voor_na.py (eyes, brows, lips, badges masked out), --size pixels, JPEG
without metadata.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import io
import random
import shutil
import sys
import zipfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import FaceFinder, load_rgb  # noqa: E402
from import_voor_na import halves, patches  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
PUBLIC = {"scin", "pad-ufes"}


def is_test(person: str, share: float) -> bool:
    return int(hashlib.sha1(person.encode()).hexdigest()[:8], 16) / 0xFFFFFFFF < share


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--grades", type=Path, nargs="+",
                    default=[ROOT / "label/alle-grades.csv", ROOT / "label/genis-grades.csv"])
    ap.add_argument("--src", type=Path, default=ROOT / "data")
    ap.add_argument("--out", type=Path, default=ROOT / "data/evren")
    ap.add_argument("--size", type=int, default=224)
    ap.add_argument("--per-image", type=int, default=3)
    ap.add_argument("--test-share", type=float, default=0.10)
    ap.add_argument("--min-skin", type=float, default=0.75)
    args = ap.parse_args()

    import cv2

    rows = [r for g in args.grades for r in csv.DictReader(open(g, newline="", encoding="utf-8-sig"))
            if r.get("source") in PUBLIC]
    if args.out.exists():
        shutil.rmtree(args.out)
    (args.out / "test").mkdir(parents=True)
    zips = {h: zipfile.ZipFile(args.out / f"huidscan-{name}.zip", "w", zipfile.ZIP_STORED)
            for h, name in (("redness", "roodheid"), ("pigmentation", "pigment"))}
    folder = {"redness": "roodheid", "pigmentation": "pigment"}
    finder = FaceFinder()
    tests, counts = [], {h: [0, 0, 0, 0] for h in zips}
    n_img = n_patch = 0
    for r in rows:
        rgb = load_rgb(args.src / r["file"])
        part, band, badge = halves(rgb, r["half"])
        ps = patches(part, band, badge, finder, args.per_image, random.Random(r["file"]), args.min_skin)
        if not ps:
            continue
        n_img += 1
        image_id = hashlib.sha1(f"{r['file']}|{r['half']}".encode()).hexdigest()[:10]
        test = is_test(r["person"], args.test_share)
        for i, p in enumerate(ps):
            small = cv2.resize(p, (args.size, args.size), interpolation=cv2.INTER_AREA)
            ok, buf = cv2.imencode(".jpg", cv2.cvtColor(small, cv2.COLOR_RGB2BGR), [cv2.IMWRITE_JPEG_QUALITY, 92])
            name = f"{image_id}_{i}.jpg"
            n_patch += 1
            if test:
                (args.out / "test" / name).write_bytes(buf.tobytes())
                tests.append({"crop": name, "image": image_id, "person": r["person"], "monk": r["monk"],
                              "source": r["source"], "redness": r["redness"], "pigmentation": r["pigmentation"]})
                continue
            for h, z in zips.items():
                g = int(r[h])
                if 0 <= g <= 3:
                    z.writestr(f"{folder[h]}-{g}/{name}", buf.tobytes())
                    counts[h][g] += 1
    for z in zips.values():
        z.close()
    with open(args.out / "test" / "test.csv", "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=["crop", "image", "person", "monk", "source", "redness", "pigmentation"])
        w.writeheader()
        w.writerows(tests)
    print(f"{n_img} photos, {n_patch} patches; test {len(tests)} patches from "
          f"{len({t['person'] for t in tests})} people; per class {counts}")
    for p in sorted(args.out.glob("*.zip")):
        print(p.name, round(p.stat().st_size / 1e6, 1), "MB")


if __name__ == "__main__":
    main()
