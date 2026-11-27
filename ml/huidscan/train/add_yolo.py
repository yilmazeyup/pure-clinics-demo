"""Adds EVREN's YOLO classification models to the app's model, next to huidscan.onnx.

    python train/add_yolo.py --export runs/huidscan-v2/export \
        --model pigmentation=runs/evren/pigment.onnx redness=runs/evren/roodheid.onnx --install

For each model (an ONNX export from EVREN: input 1x3x224x224 RGB 0-1, softmax over classes named "<folder>-<grade>"):
  - an int8-weights copy as in export_onnx.py (first and last layer kept fp32), kept when it stays within 0.03 of fp32 on the EVREN test patches;
  - Python's readings on the reference face's zones (reference/also.json), for browser_check.mjs;
  - an entry in huidscan.json "also": {file, head, input, output, grades, licence, trainedOn}.
The app averages, per zone, the reading of huidscan.onnx and of each "also" model for the same head, and downloads an
"also" model only when that head's blend is above 0. --install copies the files and huidscan.json into the app.

The exports say AGPL-3.0 (Ultralytics) in their metadata; huidscan.json carries that in "licence".
"""

from __future__ import annotations

import argparse
import ast
import csv
import json
import shutil
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import cut, load_rgb, zone_crops  # noqa: E402
from export_onnx import APP_MODELS, weight_only_int8  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
FOLDER = {"redness": "roodheid", "pigmentation": "pigment"}


def softmax_out(sess, x: np.ndarray) -> np.ndarray:
    name = sess.get_inputs()[0].name
    return np.concatenate([sess.run(None, {name: x[i:i + 1]})[0] for i in range(len(x))])


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--export", type=Path, required=True, help="the main model's export folder (has huidscan.json)")
    ap.add_argument("--model", nargs="+", required=True, help="head=path.onnx")
    ap.add_argument("--test", type=Path, default=ROOT / "data/evren/test")
    ap.add_argument("--install", action="store_true")
    args = ap.parse_args()

    import cv2
    import onnxruntime as ort

    info_path = args.export / "huidscan.json"
    info = json.load(open(info_path))
    ref_path = args.export / "reference" / "reference.json"
    ref = json.load(open(ref_path)) if ref_path.exists() else {}
    face = ref.get("face")
    test_rows = list(csv.DictReader(open(args.test / "test.csv")))[:240]
    also, also_ref = [], {}
    for spec in args.model:
        head, src = spec.split("=", 1)
        src = Path(src)
        s32 = ort.InferenceSession(str(src), providers=["CPUExecutionProvider"])
        inp = s32.get_inputs()[0]
        meta = s32.get_modelmeta().custom_metadata_map
        names = ast.literal_eval(meta["names"])
        grades = [int(str(names[i]).split("-")[-1]) for i in range(len(names))]
        size = int(ast.literal_eval(meta.get("imgsz", "[224, 224]"))[0])
        base = f"huidscan-{FOLDER.get(head, head)}-evren"
        fp32 = args.export / f"{base}.fp32.onnx"
        shutil.copy(src, fp32)
        int8 = args.export / f"{base}.int8.onnx"
        weight_only_int8(fp32, int8, skip_ends=True)
        s8 = ort.InferenceSession(str(int8), providers=["CPUExecutionProvider"])

        x = np.stack([cv2.resize(cv2.cvtColor(cv2.imread(str(args.test / r["crop"])), cv2.COLOR_BGR2RGB), (size, size),
                                 interpolation=cv2.INTER_AREA) for r in test_rows]).astype(np.float32).transpose(0, 3, 1, 2) / 255.0
        p32, p8 = softmax_out(s32, x), softmax_out(s8, x)
        agree = float((p32.argmax(1) == p8.argmax(1)).mean())
        mean8 = float(np.abs(p32 - p8).mean())
        use = int8 if mean8 < 0.03 else fp32
        app_file = f"{base}.onnx"
        shutil.copy(use, args.export / app_file)
        print(f"{head}: int8 vs fp32 on {len(x)} test patches: same top class {agree:.1%}, mean |diff| {mean8:.4f}; "
              f"app file {app_file} = {use.name} ({use.stat().st_size / 1e6:.1f} MB, fp32 {fp32.stat().st_size / 1e6:.1f} MB)")

        if face:
            lm = np.array(face["landmarks"], dtype=np.float64)
            rgb = load_rgb(args.export / "reference" / face["file"])
            crops = zone_crops(lm, size)
            px = np.stack([cut(rgb, c, size) for c in crops]).astype(np.float32).transpose(0, 3, 1, 2) / 255.0
            s_app = ort.InferenceSession(str(args.export / app_file), providers=["CPUExecutionProvider"])
            probs = softmax_out(s_app, px)
            also_ref[app_file] = {c.zone: probs[i].tolist() for i, c in enumerate(crops)}

        also.append({
            "file": app_file,
            "head": head,
            "input": {"name": inp.name, "size": size, "layout": "NCHW", "range": "RGB 0-1"},
            "output": s32.get_outputs()[0].name,
            "grades": grades,
            "licence": meta.get("license", "AGPL-3.0") + "; " + meta.get("description", "").split(" trained on")[0],
            "trainedOn": "SCIN and PAD-UFES-20 (public data only), graded by Claude; trained on EVREN (evren.ssyz.org.tr)",
            "checks": {"int8_top_class_agreement": agree, "int8_mean_abs_diff": mean8},
        })

    info["also"] = also
    if "PAD-UFES" not in str(info.get("attribution", "")):
        info["attribution"] = (str(info.get("attribution", "")).rstrip(". ") + ". The EVREN models also: PAD-UFES-20 "
                               "(Pacheco et al., 2020), CC BY 4.0, https://data.mendeley.com/datasets/zr7vgbcyr2/1").lstrip(". ")
    json.dump(info, open(info_path, "w"), indent=2)
    if also_ref:
        json.dump({"files": also_ref}, open(args.export / "reference" / "also.json", "w"))
    print(f"wrote {info_path} with {len(also)} also-models; blend {info.get('blend')}")

    if args.install:
        shipped = json.load(open(APP_MODELS / "huidscan.json"))
        if shipped.get("version") != info.get("version"):
            sys.exit(f"Not installed: the app has {shipped.get('version')}, this export is {info.get('version')}.")
        for a in also:
            shutil.copy(args.export / a["file"], APP_MODELS / a["file"])
        shipped["also"] = also
        shipped["attribution"] = info["attribution"]
        json.dump(shipped, open(APP_MODELS / "huidscan.json", "w"), indent=2)
        print(f"installed into {APP_MODELS}")


if __name__ == "__main__":
    main()
