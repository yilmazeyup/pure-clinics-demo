"""How good the face model is, on faces it never saw, and next to how much two graders agree.

    python train/eval_face.py --onnx runs/face-v1/export/huidscan.int8.onnx --data data/prepared/face-v1

Per head (redness, pigmentation, acne, lines, eyes): AUROC for "visible" (grade >= 1) and "clear" (>= 2) on the
expected grade, quadratic weighted kappa and within-one agreement of the rounded grade; overall, per Monk group and
per source. Then, on the faces a second grader graded blind (data/grading-face2), three agreements side by side:
model vs grader 1 (whose grades it was trained on), grader 2 vs grader 1, model vs grader 2. A model that agrees with
a grader about as well as two graders agree with each other is as good as the labels allow.
Writes <run>/eval_face.json next to the ONNX file's run folder.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import re
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
from evaluate import auroc, qwk  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
HEADS = ["redness", "pigmentation", "acne", "lines", "eyes"]


def scores(y: np.ndarray, e: np.ndarray) -> dict:
    m = y >= 0
    y, e = y[m], e[m]
    if len(y) < 10:
        return {"n": int(len(y))}
    pred = np.clip(np.rint(e), 0, 3).astype(int)
    out = {"n": int(len(y)), "qwk": round(qwk(y, pred, 4), 3), "within_one": round(float((abs(pred - y) <= 1).mean()), 3)}
    for name, k in (("auroc_visible", 1), ("auroc_clear", 2)):
        pos = int((y >= k).sum())
        out[name] = round(auroc((y >= k).astype(int), e), 3) if 5 <= pos <= len(y) - 5 else None
    return out


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--onnx", type=Path, required=True)
    ap.add_argument("--data", type=Path, required=True)
    ap.add_argument("--second", type=Path, default=ROOT / "data/grading-face2")
    args = ap.parse_args()

    import cv2
    import onnxruntime as ort

    s = ort.InferenceSession(str(args.onnx), providers=["CPUExecutionProvider"])
    heads = [o.name for o in s.get_outputs()]
    rows = [r for r in csv.DictReader(open(args.data / "zones.csv")) if r["split"] == "test"]
    x = np.stack([cv2.cvtColor(cv2.imread(str(args.data / "crops" / r["crop"])), cv2.COLOR_BGR2RGB) for r in rows])
    x = x.astype(np.float32).transpose(0, 3, 1, 2) / 255.0
    outs = [s.run(None, {"pixels": x[i:i + 64]}) for i in range(0, len(x), 64)]
    exp = {h: np.concatenate([o[k] for o in outs]) @ np.arange(4) for k, h in enumerate(heads)}
    groups = np.array([r["monk_group"] for r in rows])
    sources = np.array(["fairface" if r["source"] == "fairface" else "pure/scin" for r in rows])
    res: dict = {"test_faces": len(rows), "test_people": len({r["person"] for r in rows}), "heads": {}}
    for h in heads:
        y = np.array([int(r[h]) for r in rows])
        per = {"all": scores(y, exp[h])}
        for g in ("1-3", "4-6", "7-10"):
            per[f"monk {g}"] = scores(np.where(groups == g, y, -1), exp[h])
        per["pure/scin"] = scores(np.where(sources == "pure/scin", y, -1), exp[h])
        res["heads"][h] = per

    # Second grader, blind, on a sample of the same test faces.
    if (args.second / "list.csv").exists():
        idx_file = {r["idx"]: r["file"] for r in csv.DictReader(open(args.second / "list.csv"))}
        g2: dict[str, list[int]] = {}
        for f in (args.second / "grades").glob("part_*.txt"):
            for i, vals in re.findall(r"(\d+)\s*:\s*([0-9xX]+(?:\s*,\s*[0-9xX]+)*)", f.read_text()):
                v = [-1 if t.strip().lower() == "x" else int(t) for t in vals.split(",")]
                if len(v) == 6 and i in idx_file:
                    g2[idx_file[i]] = v
        by_image = {r["image"]: n for n, r in enumerate(rows)}
        agree = {}
        for k, h in enumerate(["redness", "pigmentation", "acne", "lines", "eyes"]):
            a1, a2, m = [], [], []
            for file, v in g2.items():
                n = by_image.get(hashlib.sha1(f"{file}|whole".encode()).hexdigest()[:10])
                if n is None:
                    continue
                y1 = int(rows[n][h])
                if y1 < 0 or v[k] < 0:
                    continue
                a1.append(y1)
                a2.append(v[k])
                m.append(int(np.clip(np.rint(exp[h][n]), 0, 3)))
            a1, a2, m = np.array(a1), np.array(a2), np.array(m)
            if len(a1) < 10:
                continue

            def pair(p, q):
                return {"qwk": round(qwk(p, q, 4), 3), "within_one": round(float((abs(p - q) <= 1).mean()), 3),
                        "exact": round(float((p == q).mean()), 3)}

            agree[h] = {"faces": int(len(a1)), "model_vs_grader1": pair(a1, m), "grader2_vs_grader1": pair(a1, a2),
                        "model_vs_grader2": pair(a2, m)}
        res["second_grader"] = agree
    out = args.onnx.parents[1] / "eval_face.json" if args.onnx.parent.name == "export" else args.onnx.with_suffix(".eval.json")
    json.dump(res, open(out, "w"), indent=2)
    print(json.dumps(res, indent=2))


if __name__ == "__main__":
    main()
