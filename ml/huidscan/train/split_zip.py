"""Splits a class-folder ZIP into parts below a size limit (the browser upload tool takes 10 MB per file).

    python train/split_zip.py data/evren/huidscan-roodheid.zip --max-mb 9.5

Writes huidscan-roodheid.part01.zip, .part02.zip ... next to it; every part keeps the class folders, and the classes
are interleaved so each part holds every class.
"""

from __future__ import annotations

import argparse
import zipfile
from itertools import zip_longest
from pathlib import Path


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("zip", type=Path)
    ap.add_argument("--max-mb", type=float, default=9.5)
    args = ap.parse_args()

    src = zipfile.ZipFile(args.zip)
    by_class: dict[str, list[zipfile.ZipInfo]] = {}
    seen: set[str] = set()
    for info in src.infolist():
        if not info.is_dir() and info.filename not in seen:
            seen.add(info.filename)
            by_class.setdefault(info.filename.split("/")[0], []).append(info)
    order = [i for group in zip_longest(*by_class.values()) for i in group if i is not None]
    limit = int(args.max_mb * 1e6)
    part, size, out = 0, 0, None
    parts = []
    for info in order:
        need = info.file_size + 120 + len(info.filename) * 2
        if out is None or size + need > limit:
            if out:
                out.close()
            part += 1
            path = args.zip.with_name(f"{args.zip.stem}.part{part:02d}.zip")
            parts.append(path)
            out = zipfile.ZipFile(path, "w", zipfile.ZIP_STORED)
            size = 22
        out.writestr(info.filename, src.read(info))
        size += need
    if out:
        out.close()
    for p in parts:
        print(p.name, round(p.stat().st_size / 1e6, 2), "MB")


if __name__ == "__main__":
    main()
