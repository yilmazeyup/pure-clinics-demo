"""Merges the graders' text files (`idx:a,b,...` per photo) into one CSV, and reports anything missing or out of range.

    python label/merge_grades.py --grading data/grading                       # SCIN/PAD: redness, pigmentation
    python label/merge_grades.py --grading data/grading-face --out label/face-grades.csv \
        --fields redness pigmentation acne lines eyes monk
    python label/merge_grades.py --grading data/grading-closeup --out label/closeup-grades.csv \
        --fields acne texture lines eyes

Grades are 0-3 (monk 1-10); "x" means not judgeable and is written as -1. Columns: file, half, person, monk, source,
the fields, then any other columns of the sheet list (age, race, gender, orig). A graded monk tone fills an empty one.
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
    ap.add_argument("--fields", nargs="+", default=["redness", "pigmentation"])
    args = ap.parse_args()

    rows = list(csv.DictReader(open(args.grading / "list.csv")))
    n = len(args.fields)
    top = {f: (10 if f == "monk" else 3) for f in args.fields}
    grades: dict[int, list[int]] = {}
    clash = bad = 0
    for f in sorted((args.grading / "grades").glob("part_*.txt")):
        for tok in re.findall(r"(\d+)\s*:\s*([0-9xX]+(?:\s*,\s*[0-9xX]+)*)", f.read_text()):
            i, vals = int(tok[0]), [v.strip().lower() for v in tok[1].split(",")]
            if len(vals) != n:
                bad += 1
                continue
            g = []
            for field, v in zip(args.fields, vals):
                x = -1 if v == "x" else int(v)
                if x != -1 and not (0 if field != "monk" else 1) <= x <= top[field]:
                    x = -1
                g.append(x)
            if i in grades and grades[i] != g:
                clash += 1
            grades[i] = g
    missing = [int(r["idx"]) for r in rows if int(r["idx"]) not in grades]
    extra = [k for k in rows[0] if k not in ("idx", "file", "half", "person", "monk", "source")]
    fields = ["file", "half", "person", "monk", "source"] + [f for f in args.fields if f != "monk"] + extra + ["note"]
    with open(args.out, "w", newline="") as fh:
        w = csv.DictWriter(fh, fieldnames=fields)
        w.writeheader()
        for r in rows:
            g = grades.get(int(r["idx"]))
            if g is None:
                continue
            out = {"file": r["file"], "half": r.get("half") or "whole", "person": r["person"], "monk": r.get("monk", ""),
                   "source": r["source"], "note": "graded by helper"}
            for field, x in zip(args.fields, g):
                if field == "monk":
                    if not out["monk"] and x > 0:
                        out["monk"] = x
                else:
                    out[field] = x
            for k in extra:
                out[k] = r[k]
            w.writerow(out)
    print(f"{len(grades)} graded of {len(rows)}; missing {len(missing)} (first: {missing[:10]}); "
          f"conflicting repeats {clash}; wrong length {bad}")
    for k, field in enumerate(args.fields):
        print(field, sorted(Counter(g[k] for g in grades.values()).items()))


if __name__ == "__main__":
    main()
