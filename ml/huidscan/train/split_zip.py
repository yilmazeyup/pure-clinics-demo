"""Splits a class-folder ZIP into parts below a size limit (the browser upload tool takes 10 MB per file).

    python train/split_zip.py data/evren/huidscan-roodheid.zip --max-mb 9.5

Writes huidscan-roodheid.part01.zip, .part02.zip ... next to it; every part keeps the class folders, and every class
is spread evenly over the parts, so each part holds every class (a part with one class imports unlabelled on EVREN).
"""

from __future__ import annotations

import argparse
import zipfile
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
    limit = int(args.max_mb * 1e6)
    need = lambda info: info.file_size + 120 + len(info.filename) * 2  # noqa: E731
    total = sum(need(i) for g in by_class.values() for i in g)
    # Every class spread evenly over the parts, so no part holds one class only (EVREN imports such a part unlabelled).
    n = max(1, -(-total // int(limit * 0.97)))
    while True:
        buckets: list[list[zipfile.ZipInfo]] = [[] for _ in range(n)]
        for group in by_class.values():
            for k, info in enumerate(group):
                buckets[k % n].append(info)
        if all(sum(need(i) for i in b) + 22 <= limit for b in buckets):
            break
        n += 1
    parts = []
    for k, bucket in enumerate(buckets, 1):
        path = args.zip.with_name(f"{args.zip.stem}.part{k:02d}.zip")
        parts.append(path)
        with zipfile.ZipFile(path, "w", zipfile.ZIP_STORED) as out:
            for info in bucket:
                out.writestr(info.filename, src.read(info))
    for p in parts:
        print(p.name, round(p.stat().st_size / 1e6, 2), "MB")


if __name__ == "__main__":
    main()
