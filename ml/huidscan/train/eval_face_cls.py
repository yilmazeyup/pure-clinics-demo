"""Scores face models on the faces kept here (data/evren-face/test.csv, never uploaded), all on the same scale.

    python train/eval_face_cls.py --yolo lines=runs/evren-face/face-lines-yolo26x.onnx eyes=... \
        --face apps/mobile/public/models/huidscan-face.onnx --out runs/evren-face/compare.json

--yolo: EVREN's YOLO classification exports (class names "<concern>-<grade>" in the ONNX metadata), one concern each.
--face: a face model of this pipeline (input "pixels", one output per head), e.g. the one in the app.
Per concern: AUROC for "visible" (grade >= 1) and "clear" (>= 2) on the expected grade, quadratic weighted kappa and
within-one agreement, overall and per Monk group. The test labels are the two graders' consensus where a face was
graded twice (label/face-grades.csv + label/face-grades-r2.csv), else the one grade; YOLO classes that were merged
for EVREN (eyes 3 -> 2, redness and pigmentation 3 -> 2) are merged in the labels too, for every model alike.
"""

from __future__ import annotations

import argparse
import csv
import json
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
from eval_cls_onnx import Yolo  # noqa: E402
from evaluate import auroc, qwk  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
TOP = {"lines": 3, "eyes": 2, "redness": 2, "pigmentation": 2}


def scores(y: np.ndarray, e: np.ndarray, groups: np.ndarray, top: int) -> dict:
    out = {}
    for g in ("all", "1-3", "4-6", "7-10"):
        m = (y >= 0) & ((groups == g) if g != "all" else True)
        yy, ee = y[m], e[m]
        if len(yy) < 20:
            continue
        pred = np.clip(np.rint(ee), 0, top).astype(int)
        r = {"faces": int(len(yy)), "qwk": round(qwk(yy, pred, top + 1), 3),
             "within_one": round(float((abs(pred - yy) <= 1).mean()), 3)}
        for name, k in (("auroc_visible", 1), ("auroc_clear", 2)):
            pos = int((yy >= k).sum())
            r[name] = round(auroc((yy >= k).astype(int), ee), 3) if 5 <= pos <= len(yy) - 5 else None
        out[g] = r
    return out


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--test", type=Path, default=ROOT / "data/evren-face/test.csv")
    ap.add_argument("--crops", type=Path, default=ROOT / "data/prepared/face-v2/crops")
    ap.add_argument("--yolo", nargs="*", default=[], help="concern=path.onnx (several per concern allowed: they are averaged)")
    ap.add_argument("--face", type=Path, nargs="*", default=[])
    ap.add_argument("--out", type=Path, default=ROOT / "runs/evren-face/compare.json")
    args = ap.parse_args()

    import cv2
    import onnxruntime as ort

    rows = [r for r in csv.DictReader(open(args.test)) if r["source"] == "fairface"]
    imgs = [cv2.cvtColor(cv2.imread(str(args.crops / r["crop"])), cv2.COLOR_BGR2RGB) for r in rows]
    groups = np.array([r["monk_group"] for r in rows])
    res: dict = {"test_faces": len(rows)}
    labels = {c: np.array([min(int(r[c]), t) if int(r[c]) >= 0 else -1 for r in rows]) for c, t in TOP.items()}

    by_concern: dict[str, list[str]] = {}
    for spec in args.yolo:
        c, p = spec.split("=", 1)
        by_concern.setdefault(c, []).append(p)
    for c, paths in by_concern.items():
        es = []
        for p in paths:
            y = Yolo(Path(p))
            es.append(y.expected(imgs))
            res[f"yolo:{Path(p).stem}"] = {c: scores(labels[c], es[-1], groups, TOP[c])}
        if len(es) > 1:
            res[f"yolo-mean:{c}:{len(es)}"] = {c: scores(labels[c], np.mean(es, axis=0), groups, TOP[c])}

    for f in args.face:
        s = ort.InferenceSession(str(f), providers=["CPUExecutionProvider"])
        size = int(s.get_inputs()[0].shape[2]) if isinstance(s.get_inputs()[0].shape[2], int) else 192
        x = np.stack([cv2.resize(i, (size, size), interpolation=cv2.INTER_AREA) for i in imgs]).astype(np.float32)
        x = x.transpose(0, 3, 1, 2) / 255.0
        heads = [o.name for o in s.get_outputs()]
        outs = [s.run(None, {"pixels": x[i:i + 64]}) for i in range(0, len(x), 64)]
        part = {}
        for k, h in enumerate(heads):
            if h in TOP:
                probs = np.concatenate([o[k] for o in outs])
                e = np.clip(probs @ np.arange(probs.shape[1]), 0, TOP[h])
                part[h] = scores(labels[h], e, groups, TOP[h])
        res[f"face:{f.stem}"] = part
    args.out.parent.mkdir(parents=True, exist_ok=True)
    json.dump(res, open(args.out, "w"), indent=2)
    for model, per in res.items():
        if isinstance(per, dict):
            for c, sc in per.items():
                a = sc.get("all", {})
                print(f"{model:45s} {c:13s} visible {a.get('auroc_visible')}  clear {a.get('auroc_clear')}  qwk {a.get('qwk')}  n {a.get('faces')}")


if __name__ == "__main__":
    main()
