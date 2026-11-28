"""Class-folder ZIPs of the graded faces for EVREN's YOLO classification, one per concern.

    python train/make_face_zip.py --data data/prepared/face-v2 --out data/evren-face

Only FairFace faces (CC BY 4.0) go into the ZIPs, and only the training and validation people of the prepared set:
Pure's photos never go to EVREN, and the test people stay here so every model is scored on the same faces.
Grades with too few faces are merged into the one below (eyes 3 -> 2, redness and pigmentation 3 -> 2), so a class
always has enough examples. Writes <out>/face-<concern>.zip with folders <concern>-<grade>/<crop>.jpg (JPEG 92) and
<out>/test.csv (the test faces and their grades, for scoring EVREN's exports with train/eval_face_cls.py).
Split the ZIPs below the browser's upload limit with train/split_zip.py.
"""

from __future__ import annotations

import argparse
import csv
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CONCERNS = {"lines": 3, "eyes": 2, "redness": 2, "pigmentation": 2}


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--data", type=Path, required=True)
    ap.add_argument("--out", type=Path, required=True)
    args = ap.parse_args()

    import cv2

    rows = list(csv.DictReader(open(args.data / "zones.csv")))
    args.out.mkdir(parents=True, exist_ok=True)
    for concern, top in CONCERNS.items():
        counts = [0] * (top + 1)
        with zipfile.ZipFile(args.out / f"face-{concern}.zip", "w", zipfile.ZIP_STORED) as z:
            for r in rows:
                g = int(r[concern])
                if r["source"] != "fairface" or r["split"] == "test" or g < 0:
                    continue
                g = min(g, top)
                img = cv2.imread(str(args.data / "crops" / r["crop"]))
                ok, buf = cv2.imencode(".jpg", img, [cv2.IMWRITE_JPEG_QUALITY, 92])
                z.writestr(f"{concern}-{g}/{Path(r['crop']).stem}.jpg", buf.tobytes())
                counts[g] += 1
        size = (args.out / f"face-{concern}.zip").stat().st_size / 1e6
        print(f"{concern}: {sum(counts)} faces, per grade {counts}, {size:.1f} MB")
    test = [r for r in rows if r["split"] == "test"]
    with open(args.out / "test.csv", "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=list(test[0].keys()))
        w.writeheader()
        w.writerows(test)
    print(f"test: {len(test)} faces kept here")


if __name__ == "__main__":
    main()
