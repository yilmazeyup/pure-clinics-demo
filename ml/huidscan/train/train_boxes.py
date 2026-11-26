"""Box detector for inflamed blemishes, comedones and dark spots: a thin wrapper around D-FINE-N (Apache-2.0).

    python train/train_boxes.py --setup                               # clone D-FINE, install its requirements
    python train/train_boxes.py --data data/prepared/pure-v1 --name pure-v1-boxes --epochs 72
    python train/train_boxes.py --data data/prepared/pure-v1 --name pure-v1-boxes --predict   # test tiles -> COCO results
    python train/evaluate.py --boxes-gt data/prepared/pure-v1/tiles_test.json --boxes-pred runs/pure-v1-boxes/test_pred.json
    python train/train_boxes.py --smoke                               # synthetic dots, proves the wiring on this Mac

D-FINE lives in ml/huidscan/third_party/D-FINE (git-ignored, its LICENSE file kept as cloned). This script writes a
D-FINE config next to the run, pointing at prepare.py's tiles (aligned faces cut into 640 px pieces), and starts
D-FINE's own train.py. Changes against D-FINE's defaults:
  - no RandomPhotometricDistort: it shifts hue and saturation, which would wipe out exactly the redness and pigment
    the classes are about. Geometric augmentation (zoom out, IoU crop, horizontal flip) stays; a flip needs no class
    swap, the box classes have no left or right;
  - class ids 0-2 (inflamed_blemish, comedone, dark_spot), num_workers 0 (macOS), MPS when available.
Starting weights: by default the HGNetV2-B0 backbone pretrained by D-FINE's authors (downloaded by D-FINE). --tune-from
can start from D-FINE-N trained on COCO. Never start from *_obj365 / *_obj2coco checkpoints: D-FINE's README says
those may be bound by the Objects365 terms and are not cleared for commercial use.
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import BOX_CLASSES, DATA, ROOT, RUNS  # noqa: E402

DFINE = ROOT / "third_party" / "D-FINE"
DFINE_REPO = "https://github.com/Peterande/D-FINE.git"
REQS = Path(__file__).resolve().parent / "requirements-boxes.txt"


def setup() -> None:
    if not DFINE.exists():
        DFINE.parent.mkdir(parents=True, exist_ok=True)
        subprocess.check_call(["git", "clone", "--depth", "1", DFINE_REPO, str(DFINE)])
    if not (DFINE / "LICENSE").exists():
        sys.exit("D-FINE's LICENSE file is missing; keep it with the code (Apache-2.0, section 4).")
    subprocess.check_call([sys.executable, "-m", "pip", "install", "-r", str(REQS)])
    print(f"D-FINE ready in {DFINE}")


def dfine_coco(src: Path, dst: Path) -> int:
    """prepare.py's tiles JSON with class ids 1-3 turned into D-FINE's 0-2."""
    coco = json.load(open(src))
    for a in coco["annotations"]:
        a["category_id"] -= 1
    coco["categories"] = [{"id": c["id"] - 1, "name": c["name"]} for c in BOX_CLASSES]
    json.dump(coco, open(dst, "w"))
    return len(coco["images"])


def write_config(data: Path, out: Path, epochs: int, batch: int) -> Path:
    out.mkdir(parents=True, exist_ok=True)
    n = {}
    for part in ("train", "val"):
        n[part] = dfine_coco(data / f"tiles_{part}.json", out / f"dfine_{part}.json")
    if n["train"] == 0:
        sys.exit(f"No training tiles in {data}: label boxes (and mark them done) before training the detector.")
    inc = DFINE / "configs"
    no_hue_ops = [
        {"type": "RandomZoomOut", "fill": 0},
        {"type": "RandomIoUCrop", "p": 0.8},
        {"type": "SanitizeBoundingBoxes", "min_size": 1},
        {"type": "RandomHorizontalFlip"},
        {"type": "Resize", "size": [640, 640]},
        {"type": "SanitizeBoundingBoxes", "min_size": 1},
        {"type": "ConvertPILImage", "dtype": "float32", "scale": True},
        {"type": "ConvertBoxes", "fmt": "cxcywh", "normalize": True},
    ]
    stop = max(1, int(epochs * 0.9))
    cfg = {
        "__include__": [
            str(inc / "dataset" / "custom_detection.yml"),
            str(inc / "runtime.yml"),
            str(inc / "dfine" / "include" / "dataloader.yml"),
            str(inc / "dfine" / "include" / "optimizer.yml"),
            str(inc / "dfine" / "include" / "dfine_hgnetv2.yml"),
            str(inc / "dfine" / "custom" / "dfine_hgnetv2_n_custom.yml"),
        ],
        "output_dir": str(out / "dfine"),
        "num_classes": len(BOX_CLASSES),
        "remap_mscoco_category": False,
        "epochs": epochs,
        "train_dataloader": {
            "total_batch_size": batch, "num_workers": 0,
            "dataset": {"img_folder": str(data / "tiles"), "ann_file": str(out / "dfine_train.json"),
                        "transforms": {"ops": no_hue_ops,
                                       "policy": {"name": "stop_epoch", "epoch": stop,
                                                  "ops": ["RandomZoomOut", "RandomIoUCrop"]}}},
            "collate_fn": {"stop_epoch": stop, "ema_restart_decay": 0.9999, "base_size_repeat": None},
        },
        "val_dataloader": {
            "total_batch_size": batch, "num_workers": 0,
            "dataset": {"img_folder": str(data / "tiles"), "ann_file": str(out / "dfine_val.json")},
        },
    }
    import yaml

    path = out / "dfine_n_huidscan.yml"
    path.write_text(yaml.safe_dump(cfg, sort_keys=False))
    print(f"config {path} ({n['train']} train tiles, {n['val']} val tiles)")
    return path


def device() -> str:
    import torch

    return "mps" if torch.backends.mps.is_available() else ("cuda" if torch.cuda.is_available() else "cpu")


def train(cfg: Path, dev: str, tune_from: Path | None, seed: int) -> None:
    cmd = [sys.executable, "train.py", "-c", str(cfg), "--device", dev, "--seed", str(seed)]
    if tune_from:
        cmd += ["-t", str(tune_from)]
    env = {**os.environ, "PYTORCH_ENABLE_MPS_FALLBACK": "1"}  # the odd op MPS lacks runs on the CPU instead
    print("running:", " ".join(cmd))
    subprocess.check_call(cmd, cwd=DFINE, env=env)


def predict(cfg: Path, out: Path, data: Path, dev: str, score: float = 0.05) -> Path:
    """Runs the trained detector on the test tiles and writes COCO results with prepare.py's image ids and classes."""
    import torch
    import torchvision.transforms as T
    from PIL import Image

    sys.path.insert(0, str(DFINE))
    from src.core import YAMLConfig  # noqa: E402

    ckpts = sorted((out / "dfine").glob("best_stg*.pth")) or [out / "dfine" / "last.pth"]
    ck = torch.load(ckpts[-1], map_location="cpu", weights_only=False)
    yc = YAMLConfig(str(cfg))
    yc.model.load_state_dict(ck["ema"]["module"] if "ema" in ck else ck["model"])
    model, post = yc.model.deploy().to(dev).eval(), yc.postprocessor.deploy()
    gt = json.load(open(data / "tiles_test.json"))
    tf = T.Compose([T.Resize((640, 640)), T.ToTensor()])
    res = []
    with torch.no_grad():
        for im in gt["images"]:
            pil = Image.open(data / "tiles" / im["file_name"]).convert("RGB")
            x = tf(pil).unsqueeze(0).to(dev)
            size = torch.tensor([[pil.width, pil.height]], device=dev)
            labels, boxes, scores = post(model(x), size)
            for lab, b, s in zip(labels[0].tolist(), boxes[0].tolist(), scores[0].tolist()):
                if s >= score:
                    res.append({"image_id": im["id"], "category_id": int(lab) + 1, "score": float(s),
                                "bbox": [b[0], b[1], b[2] - b[0], b[3] - b[1]]})
    path = out / "test_pred.json"
    json.dump(res, open(path, "w"))
    print(f"{len(res)} boxes on {len(gt['images'])} test tiles -> {path}")
    return path


def smoke_data() -> Path:
    """A synthetic set: skin-coloured noise with small dots of three kinds. No photos, no people; it only proves that
    data, config, D-FINE and the Mac's GPU work together."""
    import numpy as np
    from PIL import Image, ImageDraw, ImageFilter

    out = DATA / "prepared" / "_smoke-boxes"
    (out / "tiles").mkdir(parents=True, exist_ok=True)
    rng = np.random.default_rng(0)
    colours = {1: (190, 70, 70), 2: (70, 55, 45), 3: (140, 95, 60)}
    for part, n in (("train", 24), ("val", 6), ("test", 6)):
        coco = {"images": [], "annotations": [], "categories": [{"id": c["id"], "name": c["name"]} for c in BOX_CLASSES]}
        for i in range(n):
            base = np.array([224, 180, 150]) + rng.normal(0, 6, (640, 640, 3))
            img = Image.fromarray(np.clip(base, 0, 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(1.5))
            d = ImageDraw.Draw(img)
            iid = len(coco["images"]) + 1
            name = f"{part}_{i}.jpg"
            for _ in range(rng.integers(2, 7)):
                cid = int(rng.integers(1, 4))
                r = int(rng.integers(6, 18))
                x, y = int(rng.integers(30, 610)), int(rng.integers(30, 610))
                d.ellipse([x - r, y - r, x + r, y + r], fill=colours[cid])
                coco["annotations"].append({"id": len(coco["annotations"]) + 1, "image_id": iid, "category_id": cid,
                                            "bbox": [x - r, y - r, 2 * r, 2 * r], "area": 4 * r * r, "iscrowd": 0})
            img.save(out / "tiles" / name, quality=95)
            coco["images"].append({"id": iid, "file_name": name, "width": 640, "height": 640, "monk_group": "1-3"})
        json.dump(coco, open(out / f"tiles_{part}.json", "w"))
    return out


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--setup", action="store_true")
    ap.add_argument("--smoke", action="store_true", help="2 epochs on synthetic dots, to check the wiring")
    ap.add_argument("--data", type=Path)
    ap.add_argument("--name")
    ap.add_argument("--epochs", type=int, default=72)
    ap.add_argument("--batch", type=int, default=8)
    ap.add_argument("--device", default=None)
    ap.add_argument("--tune-from", type=Path, help="a D-FINE-N COCO checkpoint (never an Objects365 one)")
    ap.add_argument("--predict", action="store_true", help="only write test predictions for evaluate.py")
    ap.add_argument("--seed", type=int, default=0)
    args = ap.parse_args()

    if args.setup:
        return setup()
    if not DFINE.exists():
        sys.exit("D-FINE is not there yet: python train/train_boxes.py --setup")
    if args.tune_from and ("obj365" in args.tune_from.name or "obj2coco" in args.tune_from.name):
        sys.exit("Objects365 checkpoints are not cleared for commercial use; start from the backbone or COCO weights.")
    if args.smoke:
        args.data, args.name, args.epochs, args.batch = smoke_data(), "_smoke-boxes", 2, 4
    if not args.data or not args.name:
        sys.exit("give --data and --name (or --smoke)")
    dev = args.device or device()
    out = RUNS / args.name
    cfg = write_config(args.data.resolve(), out, args.epochs, args.batch)
    if not args.predict:
        train(cfg, dev, args.tune_from, args.seed)
    predict(cfg, out, args.data.resolve(), dev)


if __name__ == "__main__":
    main()
