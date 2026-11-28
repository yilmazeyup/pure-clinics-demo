"""Exports a trained zone classifier to ONNX for the app (onnxruntime-web, WASM), plus an int8 copy.

    python train/export_onnx.py --run runs/pure-v1-zones
    python train/export_onnx.py --run runs/pure-v1-zones --install     # copies into apps/mobile/public/models

Writes runs/<name>/export/:
  huidscan.onnx        fp32; input "pixels" [n, 3, size, size], RGB 0-1 (the model normalises itself);
                       one output per head with probabilities [n, classes]
  huidscan.int8.onnx   int8 weights (fp32 arithmetic) by default; --int8 static for full int8 QDQ
  huidscan.json        what the app needs: labels, input size, version, zones and how to cut them, blend weight
  reference/           a few test crops and a face with Python's outputs, for browser_check.mjs

--install refuses pilot runs and runs trained on public data only: those prove the pipeline, they are not the model
Pure ships. A real model goes into the app only after the owner has seen its evaluation (README, step 7).
"""

from __future__ import annotations

import argparse
import csv
import datetime as dt
import json
import shutil
import sys
from pathlib import Path

import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import CONCERN_NL, EYE_L, EYE_R, FaceFinder, load_rgb, zone_crops, cut  # noqa: E402
from train_zones import ZoneNet  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
APP_MODELS = ROOT.parents[1] / "apps" / "mobile" / "public" / "models"
SAMPLE_FACE = ROOT.parents[1] / "apps" / "mobile" / "assets" / "photos" / "pc-eyes.jpg"


class Exported(nn.Module):
    def __init__(self, net: ZoneNet, mean, std, heads: list[str]):
        super().__init__()
        self.net = net
        self.heads = heads
        self.register_buffer("mean", torch.tensor(mean, dtype=torch.float32).view(1, 3, 1, 1))
        self.register_buffer("std", torch.tensor(std, dtype=torch.float32).view(1, 3, 1, 1))

    def forward(self, pixels: torch.Tensor):
        out = self.net((pixels - self.mean) / self.std)
        return tuple(F.softmax(out[k], dim=1) for k in self.heads)


def weight_only_int8(src: Path, dst: Path, min_size: int = 512, skip_ends: bool = False) -> None:
    """int8 weights (per output channel) with a DequantizeLinear in front of each Conv/Gemm; activations stay fp32.

    The download shrinks about 3.5x while the arithmetic stays fp32, so the outputs barely move. Full int8
    (quantize_static/quantize_dynamic) disturbs MobileNetV3 badly (hard-swish, squeeze-excite): on the pilot it changed
    the top class for about 30% of crops. The model is small enough that fp32 arithmetic is quick in WASM.
    skip_ends keeps the first and the last Conv/Gemm in fp32: EVREN's YOLO classifiers need it (with every layer in
    int8 the top class changed for 40% of test patches, with the two ends kept for 1-3%).
    """
    import onnx
    from onnx import helper, numpy_helper

    m = onnx.load(str(src))
    g = m.graph
    inits = {i.name: i for i in g.initializer}
    deq = []
    weighted = [n for n in g.node if n.op_type in ("Conv", "Gemm") and len(n.input) >= 2 and n.input[1] in inits]
    for k, n in enumerate(weighted):
        if skip_ends and k in (0, len(weighted) - 1):
            continue
        w = numpy_helper.to_array(inits[n.input[1]])
        if w.size < min_size:
            continue
        axis = 0
        if n.op_type == "Gemm":
            trans_b = [a.i for a in n.attribute if a.name == "transB"]
            axis = 0 if (trans_b and trans_b[0]) else 1
        reduce = tuple(i for i in range(w.ndim) if i != axis)
        scale = np.abs(w).max(axis=reduce) / 127.0
        scale[scale == 0] = 1e-8
        shape = [1] * w.ndim
        shape[axis] = -1
        q = np.clip(np.round(w / scale.reshape(shape)), -127, 127).astype(np.int8)
        name = n.input[1]
        g.initializer.remove(inits[name])
        g.initializer.extend([
            numpy_helper.from_array(q, name + "_q"),
            numpy_helper.from_array(scale.astype(np.float32), name + "_scale"),
            numpy_helper.from_array(np.zeros_like(scale, dtype=np.int8), name + "_zero"),
        ])
        deq.append(helper.make_node("DequantizeLinear", [name + "_q", name + "_scale", name + "_zero"], [name], axis=axis))
    nodes = list(g.node)
    del g.node[:]
    g.node.extend(deq + nodes)
    onnx.checker.check_model(m)
    onnx.save(m, str(dst))


def crops_from(cfg: dict, split: str, limit: int) -> tuple[np.ndarray, list[dict]]:
    import cv2

    data = Path(cfg["data"])
    rows = [r for r in csv.DictReader(open(data / "zones.csv")) if r["split"] == split][:limit]
    xs = [cv2.cvtColor(cv2.imread(str(data / "crops" / r["crop"])), cv2.COLOR_BGR2RGB) for r in rows]
    return np.stack(xs).astype(np.float32).transpose(0, 3, 1, 2) / 255.0, rows


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--run", type=Path, required=True)
    ap.add_argument("--opset", type=int, default=17)
    ap.add_argument("--blend", type=float, default=0.5, help="weight of the model against the colour measures in the app")
    ap.add_argument("--blend-only", nargs="+", metavar="HEAD",
                    help="blend only these heads (the others get weight 0), e.g. --blend-only pigmentation")
    ap.add_argument("--face", type=Path, default=SAMPLE_FACE, help="a face photo for the app-path check (stays local)")
    ap.add_argument("--int8", choices=["weights", "static"], default="weights",
                    help="weights: int8 weights, fp32 arithmetic (default, safe for MobileNetV3); "
                         "static: full int8 QDQ calibrated on training crops (try with efficientnet_lite0)")
    ap.add_argument("--install", action="store_true", help="copy into apps/mobile/public/models (never for pilots)")
    ap.add_argument("--app-name", default="huidscan",
                    help="file names in the app: huidscan (the zone model) or huidscan-face (the face model)")
    args = ap.parse_args()

    ck = torch.load(args.run / "best.pt", map_location="cpu", weights_only=False)
    cfg = ck["config"]
    heads = list(cfg["heads"])
    size = cfg["size"]
    net = ZoneNet(cfg["backbone"], cfg["heads"], pretrained=False)
    net.load_state_dict(ck["state_dict"])
    model = Exported(net, cfg["mean"], cfg["std"], heads).eval()

    out = args.run / "export"
    if out.exists():
        shutil.rmtree(out)
    (out / "reference").mkdir(parents=True)
    fp32 = out / "huidscan.onnx"
    dummy = torch.rand(2, 3, size, size)
    dyn = {"pixels": {0: "n"}, **{h: {0: "n"} for h in heads}}
    torch.onnx.export(model, (dummy,), str(fp32), input_names=["pixels"], output_names=heads, dynamic_axes=dyn,
                      opset_version=args.opset, dynamo=False)

    import onnx
    import onnxruntime as ort

    onnx.checker.check_model(onnx.load(str(fp32)))
    test_x, test_rows = crops_from(cfg, "test", 256)
    with torch.no_grad():
        ref = [t.numpy() for t in model(torch.from_numpy(test_x))]
    s32 = ort.InferenceSession(str(fp32), providers=["CPUExecutionProvider"])
    got = s32.run(None, {"pixels": test_x})
    diff32 = max(float(np.abs(a - b).max()) for a, b in zip(ref, got))
    print(f"fp32 ONNX vs PyTorch: max difference {diff32:.2e}")

    from onnxruntime.quantization.shape_inference import quant_pre_process

    pre = out / "pre.onnx"
    quant_pre_process(str(fp32), str(pre))
    int8 = out / "huidscan.int8.onnx"
    if args.int8 == "weights":
        weight_only_int8(pre, int8)
    else:
        from onnxruntime.quantization import CalibrationDataReader, QuantFormat, QuantType, quantize_static

        cal_x, _ = crops_from(cfg, "train", 200)

        class Reader(CalibrationDataReader):
            def __init__(self):
                self.it = iter([{"pixels": cal_x[i:i + 16]} for i in range(0, len(cal_x), 16)])

            def get_next(self):
                return next(self.it, None)

        quantize_static(str(pre), str(int8), Reader(), quant_format=QuantFormat.QDQ, per_channel=True,
                        weight_type=QuantType.QInt8, activation_type=QuantType.QUInt8)
    pre.unlink()
    s8 = ort.InferenceSession(str(int8), providers=["CPUExecutionProvider"])
    got8 = s8.run(None, {"pixels": test_x})
    diff8 = max(float(np.abs(a - b).max()) for a, b in zip(got, got8))
    mean8 = float(np.mean([np.abs(a - b).mean() for a, b in zip(got, got8)]))
    agree = float(np.mean([(a.argmax(1) == b.argmax(1)).mean() for a, b in zip(got, got8)]))
    print(f"int8 ({args.int8}) vs fp32 on {len(test_x)} test crops: same top class {agree:.1%}, "
          f"mean |diff| {mean8:.3f}, max {diff8:.3f}")
    use_int8 = mean8 < 0.03

    # Reference crops for the browser check.
    import cv2

    refs = []
    for i in range(min(8, len(test_x))):
        name = f"crop{i}.png"
        cv2.imwrite(str(out / "reference" / name), cv2.cvtColor((test_x[i].transpose(1, 2, 0) * 255).round().astype(np.uint8), cv2.COLOR_RGB2BGR))
        refs.append({"file": name, "fp32": {h: got[k][i].tolist() for k, h in enumerate(heads)},
                     "int8": {h: got8[k][i].tolist() for k, h in enumerate(heads)}})
    face = None
    if args.face and args.face.exists():
        rgb = load_rgb(args.face)
        lm = FaceFinder().landmarks(rgb)
        if lm is not None:
            lm = lm.round(3)
            cv2.imwrite(str(out / "reference" / "face.jpg"), cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR), [cv2.IMWRITE_JPEG_QUALITY, 95])
            # The check decodes face.jpg again, so take the reference from the decoded file, as the browser will.
            rgb2 = load_rgb(out / "reference" / "face.jpg")
            crops = zone_crops(lm, size, zones=cfg["zones"], zone_points=cfg["zone_points"], shrink=cfg["shrink"],
                               face_width=cfg["face_width"], pad=cfg["crop_pad"])
            px2 = np.stack([cut(rgb2, c, size) for c in crops]).astype(np.float32).transpose(0, 3, 1, 2) / 255.0
            per = {"fp32": s32.run(None, {"pixels": px2}), "int8": s8.run(None, {"pixels": px2})}
            face = {"file": "face.jpg", "landmarks": lm.tolist(),
                    "zones": {p: {c.zone: {h: o[k][i].tolist() for k, h in enumerate(heads)} for i, c in enumerate(crops)}
                              for p, o in per.items()}}
            cv2.imwrite(str(out / "reference" / "face_crops_python.png"),
                        cv2.cvtColor((np.concatenate(list(px2.transpose(0, 2, 3, 1)), axis=1) * 255).astype(np.uint8), cv2.COLOR_RGB2BGR))
    json.dump({"crops": refs, "face": face, "heads": heads}, open(out / "reference" / "reference.json", "w"))

    evals = {}
    if (args.run / "eval.json").exists():
        ev = json.load(open(args.run / "eval.json"))
        for h, res in ev["heads"].items():
            evals[h] = {g: {k: v for k, v in e.items() if k in ("crops", "people", "auroc", "qwk", "too_small")}
                        for g, e in res.items() if isinstance(e, dict)}
    pilot = bool(cfg.get("pilot")) or bool(cfg.get("public_licence"))
    info = {
        "format": 1,
        "version": f"{cfg['name']}-{dt.date.today().isoformat()}",
        "file": (int8 if use_int8 else fp32).name,
        "files": {"fp32": fp32.name, "int8": int8.name},
        "pilot": pilot,
        "input": {"name": "pixels", "size": size, "layout": "NCHW", "range": "RGB 0-1"},
        "heads": [{"name": h, "classes": int(cfg["heads"][h])} for h in heads],
        "zones": [z for z in cfg["zones"]],
        "zonePoints": cfg["zone_points"],
        "shrink": cfg["shrink"],
        "crop": {"faceWidth": cfg["face_width"], "pad": cfg["crop_pad"], "eyeL": EYE_L, "eyeR": EYE_R, "widthPoints": [234, 454]},
        "applies": cfg["applies"],
        "blend": ({h: (args.blend if h in args.blend_only else 0.0) for h in heads} if args.blend_only else args.blend),
        "wording": {h: CONCERN_NL.get(h, h) for h in heads},
        "disclaimer": "Geen medische diagnose. Voor persoonlijk advies: de gratis intake.",
        "trainedOn": cfg["source"],
        "backbone": cfg["backbone"],
        "metrics": evals,
        "checks": {"fp32_vs_torch_max": diff32, "int8_top_class_agreement": agree, "int8_mean_abs_diff": mean8},
    }
    if cfg.get("public_licence") == "SCIN Data Use License" or "SCIN" in str(cfg.get("source", "")):
        info["attribution"] = ("Trained in part on the SCIN dataset (Google Research), SCIN Data Use License, "
                               "https://github.com/google-research-datasets/scin")
    if "FairFace" in str(cfg.get("source", "")):
        info["attribution"] = (str(info.get("attribution", "")).rstrip(". ") + ". Trained in part on FairFace "
                               "(Kärkkäinen & Joo, 2021), CC BY 4.0, https://github.com/joojs/fairface").lstrip(". ")
    json.dump(info, open(out / "huidscan.json", "w"), indent=2)
    print(f"wrote {out} (app file: {info['file']}, {fp32.stat().st_size / 1e6:.1f} MB fp32, {int8.stat().st_size / 1e6:.1f} MB int8)")

    if args.install:
        if pilot:
            sys.exit("Not installed: this is a pilot or public-data-only run. It proves the pipeline; it is not Pure's model.")
        APP_MODELS.mkdir(parents=True, exist_ok=True)
        shutil.copy(out / info["file"], APP_MODELS / f"{args.app_name}.onnx")
        shipped = {**info, "file": f"{args.app_name}.onnx", "files": {}}
        json.dump(shipped, open(APP_MODELS / f"{args.app_name}.json", "w"), indent=2)
        print(f"installed into {APP_MODELS}")


if __name__ == "__main__":
    main()
