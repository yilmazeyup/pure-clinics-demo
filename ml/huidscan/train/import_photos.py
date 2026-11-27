"""Pure's existing photo archive -> the photo folder the labelling tool and prepare.py read.

    python train/import_photos.py --src "/Volumes/Pure/Foto's" --out ~/Huidscan/fotos --key ~/Huidscan/sleutel.csv

Pure's photos are already covered by Pure's consent for training, so nobody is asked again. The archive can come as
it is: one folder per client (the default, `--by folder`), or every photo in one folder with the client in the start of
the file name (`--by name`, for example "Jansen Eva 2025-03-12.jpg" or "1234_voor.jpg").

Per photo it:
  1. reads it the way a phone shows it (orientation applied) and finds the face; photos without a face (legs,
     tattoos, close-ups of a spot) are skipped;
  2. works out the view from the face itself: front (F), left cheek to the camera (L) or right cheek (R);
  3. takes the date from the photo (EXIF), else from the file;
  4. saves it as <code>_<yyyymmdd>_<F|L|R>.jpg (a second photo of the same day and view gets -2, -3 ...), as a clean
     JPEG without EXIF, GPS or names.
The client's name only ever sits in the key file (--key): client -> code, so the next import gives the same client
the same code and a client who wants to be left out can be found. Keep the key on the clinic's Mac, never in git.
Running it again on the same archive skips photos it already imported (by content hash, also in the key folder).
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import re
import sys
from datetime import datetime
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import FaceFinder, load_rgb  # noqa: E402

PHOTO = {".jpg", ".jpeg", ".png", ".heic", ".heif", ".webp", ".tif", ".tiff", ".bmp"}
# MediaPipe: 1 nose tip, 33 outer corner of the eye on the image's left, 263 on the image's right.
NOSE, EYE_A, EYE_B = 1, 33, 263


def view_of(lm: np.ndarray) -> str:
    """F, L or R. The nose sits halfway between the outer eye corners when the face looks straight at the camera; it
    moves towards the image's left when the client turns to their right (left cheek to the camera)."""
    a, b, n = lm[EYE_A, 0], lm[EYE_B, 0], lm[NOSE, 0]
    if abs(b - a) < 1:
        return "F"
    r = (n - a) / (b - a)
    return "L" if r < 0.36 else "R" if r > 0.64 else "F"


def photo_date(path: Path) -> str:
    try:
        from PIL import Image

        with Image.open(path) as im:
            ex = im.getexif()
            raw = ex.get_ifd(0x8769).get(36867) or ex.get(306)  # DateTimeOriginal, else DateTime
        if raw:
            return datetime.strptime(str(raw)[:10], "%Y:%m:%d").strftime("%Y%m%d")
    except Exception:
        pass
    m = re.search(r"(20\d\d)[-_.]?([01]\d)[-_.]?([0-3]\d)", path.stem)
    if m:
        return "".join(m.groups())
    return datetime.fromtimestamp(path.stat().st_mtime).strftime("%Y%m%d")


def client_of(path: Path, src: Path, by: str) -> str:
    if by == "folder":
        rel = path.relative_to(src)
        return rel.parts[0] if len(rel.parts) > 1 else path.stem
    stem = re.sub(r"(20\d\d[-_.]?[01]\d[-_.]?[0-3]\d.*)$", "", path.stem)  # drop a date and what follows
    stem = re.sub(r"[\s_-]*(voor|na|before|after|links|rechts|front|left|right|\d{1,2})$", "", stem.strip(), flags=re.I)
    return stem.strip(" _-") or path.stem


def read_key(path: Path) -> dict[str, str]:
    if not path.exists():
        return {}
    return {r["client"]: r["code"] for r in csv.DictReader(open(path, newline="", encoding="utf-8-sig"))}


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--src", type=Path, required=True, help="Pure's photo archive, as it is")
    ap.add_argument("--out", type=Path, required=True, help="photo folder for labelling (e.g. ~/Huidscan/fotos)")
    ap.add_argument("--key", type=Path, required=True, help="private key file client -> code (outside git)")
    ap.add_argument("--by", choices=["folder", "name"], default="folder", help="how a photo's client is known")
    ap.add_argument("--prefix", default="PC", help="code prefix (PC = Pure Clinics)")
    ap.add_argument("--min-face", type=float, default=0.25,
                    help="skip photos where the face is narrower than this share of the photo's width")
    args = ap.parse_args()

    from PIL import Image

    try:
        import pillow_heif  # optional, for iPhone HEIC photos

        pillow_heif.register_heif_opener()
    except ImportError:
        pass

    args.out.mkdir(parents=True, exist_ok=True)
    args.key.parent.mkdir(parents=True, exist_ok=True)
    key = read_key(args.key)
    seen_path = args.key.with_name(args.key.stem + "-gezien.json")
    seen: dict[str, str] = json.loads(seen_path.read_text()) if seen_path.exists() else {}
    next_no = 1 + max((int(re.sub(r"\D", "", c) or 0) for c in key.values()), default=0)

    finder = FaceFinder()
    report = {"photos": 0, "imported": 0, "already_imported": 0, "no_face": 0, "no_whole_face": 0, "face_too_small": 0, "unreadable": 0}
    views = {"F": 0, "L": 0, "R": 0}
    files = sorted(p for p in args.src.rglob("*") if p.is_file() and p.suffix.lower() in PHOTO
                   and not any(part.startswith(".") for part in p.relative_to(args.src).parts))
    for path in files:
        report["photos"] += 1
        digest = hashlib.sha256(path.read_bytes()).hexdigest()
        if digest in seen:
            report["already_imported"] += 1
            continue
        try:
            rgb = load_rgb(path)
        except Exception:
            report["unreadable"] += 1
            continue
        lm = finder.landmarks(rgb)
        if lm is None:
            report["no_face"] += 1
            continue
        h, w = rgb.shape[:2]
        inside = ((lm[:, 0] >= 0) & (lm[:, 0] < w) & (lm[:, 1] >= 0) & (lm[:, 1] < h)).mean()
        if inside < 0.97:  # a close-up of a nose or a cheek: MediaPipe guesses a face far bigger than the photo
            report["no_whole_face"] += 1
            continue
        if (lm[:, 0].max() - lm[:, 0].min()) < args.min_face * w:
            report["face_too_small"] += 1
            continue
        client = client_of(path, args.src, args.by)
        if client not in key:
            key[client] = f"{args.prefix}{next_no:04d}"
            next_no += 1
        code, day, view = key[client], photo_date(path), view_of(lm)
        name, n = f"{code}_{day}_{view}.jpg", 1
        while (args.out / name).exists():
            n += 1
            name = f"{code}_{day}_{view}-{n}.jpg"
        Image.fromarray(rgb).save(args.out / name, "JPEG", quality=95)  # a fresh file: no EXIF, GPS or names
        seen[digest] = name
        views[view] += 1
        report["imported"] += 1

    with open(args.key, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["client", "code"])
        for client, code in sorted(key.items(), key=lambda kv: kv[1]):
            w.writerow([client, code])
    seen_path.write_text(json.dumps(seen))
    print(json.dumps({**report, "views": views, "clients_in_key": len(key)}, indent=2))


if __name__ == "__main__":
    main()
