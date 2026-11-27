"""Merges the graders' text files (`idx:R,P` per photo) into label/genis-grades.csv, in the same columns as
label/alle-grades.csv, and reports anything missing or out of range.

    python label/merge_grades.py --grading data/grading
"""

from __future__ import annotations

import argparse
import csv
import re
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--grading", type=Path, default=ROOT / "data/grading")
    ap.add_argument("--out", type=Path, default=ROOT / "label/genis-grades.csv")
    args = ap.parse_args()

    rows = list(csv.DictReader(open(args.grading / "list.csv")))
    grades: dict[int, tuple[int, int]] = {}
    clash = 0
    for f in sorted((args.grading / "grades").glob("part_*.txt")):
        for m in re.finditer(r"(\d+)\s*:\s*([0-3])\s*,\s*([0-3])", f.read_text()):
            i, r, p = int(m[1]), int(m[2]), int(m[3])
            if i in grades and grades[i] != (r, p):
                clash += 1
            grades[i] = (r, p)
    missing = [int(r["idx"]) for r in rows if int(r["idx"]) not in grades]
    with open(args.out, "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=["file", "half", "person", "monk", "redness", "pigmentation", "source", "note"])
        w.writeheader()
        for r in rows:
            g = grades.get(int(r["idx"]))
            if g is None:
                continue
            w.writerow({"file": r["file"], "half": "whole", "person": r["person"], "monk": r["monk"],
                        "redness": g[0], "pigmentation": g[1], "source": r["source"], "note": "graded by helper"})
    print(f"{len(grades)} graded of {len(rows)}; missing {len(missing)} (first: {missing[:10]}); "
          f"conflicting repeats {clash}")
    print("redness", sorted(Counter(g[0] for g in grades.values()).items()),
          "pigmentation", sorted(Counter(g[1] for g in grades.values()).items()))


if __name__ == "__main__":
    main()
