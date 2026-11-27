"""Scores classification models on the patches kept apart from EVREN (data/evren/test) and on Pure's own photo halves.

    python train/eval_cls_onnx.py --yolo redness=runs/evren/roodheid.onnx pigmentation=runs/evren/pigment.onnx \
        --huidscan apps/mobile/public/models/huidscan.onnx

--yolo takes ONNX exports of EVREN's YOLO classification models (input 1x3xSxS RGB 0-1, output class probabilities;
class names are read from the ONNX metadata, e.g. "roodheid-2", so the grade is the number after the dash).
--huidscan takes the app's model (input "pixels" 128 px, one output per concern).
Only test patches of photos graded in label/genis-grades.csv count; huidscan-v2 was trained with the same people
held out (import_voor_na.py --test-people), so every model is compared on photos it has not seen. With both --yolo
and --huidscan, "together" scores the mean of the two expected grades, as the app combines them. Reports AUROC for "visible" (>= 1) and "clear" (>= 2) per photo, quadratic
weighted kappa and within-one agreement, overall and per Monk group; and, for the YOLO models, the same on Pure's
own before/after halves (which never went to EVREN).
"""

from __future__ import annotations

import argparse
import ast
import csv
import json
import random
import sys
from collections import defaultdict
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import FaceFinder, load_rgb, monk_group  # noqa: E402
from evaluate import auroc, qwk  # noqa: E402
from import_voor_na import halves, patches  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]


class Yolo:
    def __init__(self, path: Path):
        import onnxruntime as ort

        self.s = ort.InferenceSession(str(path), providers=["CPUExecutionProvider"])
        self.inp = self.s.get_inputs()[0]
        self.size = int(self.inp.shape[2]) if isinstance(self.inp.shape[2], int) else 224
        meta = self.s.get_modelmeta().custom_metadata_map
        names = ast.literal_eval(meta.get("names", "{}")) if meta.get("names") else {}
        self.grade = [int(str(names.get(i, i)).split("-")[-1]) for i in range(len(names))] if names else [0, 1, 2, 3]

    def expected(self, rgb_patches: list[np.ndarray]) -> np.ndarray:
        import cv2

        out = []
        for p in rgb_patches:
            x = cv2.resize(p, (self.size, self.size), interpolation=cv2.INTER_AREA).astype(np.float32) / 255.0
            prob = self.s.run(None, {self.inp.name: x.transpose(2, 0, 1)[None]})[0][0]
            prob = np.exp(prob - prob.max()) / np.exp(prob - prob.max()).sum() if prob.min() < 0 or prob.sum() > 1.01 else prob
            out.append(float(sum(prob[i] * self.grade[i] for i in range(len(prob)))))
        return np.array(out)


class Huidscan:
    def __init__(self, path: Path):
        import onnxruntime as ort

        self.s = ort.InferenceSession(str(path), providers=["CPUExecutionProvider"])
        self.size = 128
        self.heads = [o.name for o in self.s.get_outputs()]

    def expected(self, rgb_patches: list[np.ndarray], head: str) -> np.ndarray:
        import cv2

        x = np.stack([cv2.resize(p, (self.size, self.size), interpolation=cv2.INTER_AREA) for p in rgb_patches])
        x = x.astype(np.float32).transpose(0, 3, 1, 2) / 255.0
        out = self.s.run([head], {"pixels": x})[0]
        return (out * np.arange(out.shape[1])).sum(1)


def report(y: np.ndarray, e: np.ndarray, groups: np.ndarray) -> dict:
    res = {}
    for g in ["alle", "1-3", "4-6", "7-10"]:
        m = np.ones(len(y), bool) if g == "alle" else groups == g
        if m.sum() < 5:
            continue
        yy, ee = y[m], e[m]
        pred = np.clip(np.rint(ee), 0, 3).astype(int)
        res[g] = {"photos": int(m.sum()),
                  "auroc_visible": round(auroc((yy >= 1).astype(int), ee), 3) if 0 < (yy >= 1).sum() < len(yy) else None,
                  "auroc_clear": round(auroc((yy >= 2).astype(int), ee), 3) if 0 < (yy >= 2).sum() < len(yy) else None,
                  "qwk": round(qwk(yy, pred, 4), 3), "within_one": round(float((abs(pred - yy) <= 1).mean()), 3)}
    return res


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--test", type=Path, default=ROOT / "data/evren/test")
    ap.add_argument("--yolo", nargs="*", default=[], help="head=path.onnx")
    ap.add_argument("--huidscan", type=Path)
    ap.add_argument("--out", type=Path, default=ROOT / "runs/evren-compare.json")
    args = ap.parse_args()

    import cv2

    new_files = {r["file"] for r in csv.DictReader(open(ROOT / "label/genis-grades.csv"))}
    import hashlib

    new_ids = {hashlib.sha1(f"{f}|whole".encode()).hexdigest()[:10] for f in new_files}
    rows = [r for r in csv.DictReader(open(args.test / "test.csv")) if r["image"] in new_ids]
    by_image: dict[str, list[dict]] = defaultdict(list)
    for r in rows:
        by_image[r["image"]].append(r)
    imgs = list(by_image)
    pats = {i: [cv2.cvtColor(cv2.imread(str(args.test / r["crop"])), cv2.COLOR_BGR2RGB) for r in by_image[i]] for i in imgs}
    groups = np.array([monk_group(by_image[i][0]["monk"]) for i in imgs])
    yolo = {h: Yolo(Path(p)) for h, p in (a.split("=", 1) for a in args.yolo)}
    hs = Huidscan(args.huidscan) if args.huidscan else None
    out = {"test_photos": len(imgs), "test_people": len({by_image[i][0]["person"] for i in imgs})}
    for head in ("redness", "pigmentation"):
        y = np.array([int(by_image[i][0][head]) for i in imgs])
        if head in yolo:
            e = np.array([yolo[head].expected(pats[i]).mean() for i in imgs])
            out[f"evren_yolo_{head}"] = report(y, e, groups)
        if hs is not None:
            eh = np.array([hs.expected(pats[i], head).mean() for i in imgs])
            out[f"huidscan_{head}"] = report(y, eh, groups)
            if head in yolo:
                # Both models together, as the app runs them: the mean of their expected grades.
                out[f"together_{head}"] = report(y, (e + eh) / 2, groups)

    # Pure's own before/after halves: never uploaded to EVREN.
    if yolo:
        finder = FaceFinder()
        pure = [r for r in csv.DictReader(open(ROOT / "label/alle-grades.csv")) if r["source"].startswith("pure")]
        ys, es, gs = defaultdict(list), defaultdict(list), []
        for r in pure:
            rgb = load_rgb(ROOT / "data" / r["file"])
            part, band, badge = halves(rgb, r["half"])
            ps = patches(part, band, badge, finder, 6, random.Random(r["file"] + r["half"]), 0.75)
            if not ps:
                continue
            gs.append(monk_group(r["monk"]))
            for head, m in yolo.items():
                ys[head].append(int(r[head]))
                es[head].append(m.expected(ps).mean())
        for head in yolo:
            out[f"evren_yolo_{head}_pure"] = report(np.array(ys[head]), np.array(es[head]), np.array(gs))
    args.out.parent.mkdir(parents=True, exist_ok=True)
    json.dump(out, open(args.out, "w"), indent=2)
    print(json.dumps(out, indent=2))


if __name__ == "__main__":
    main()
