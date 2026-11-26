"""Trains the zone classifier: one small timm backbone, one head per concern, each predicting grade 0-3.

    python train/train_zones.py --data data/prepared/pure-v1 --name pure-v1-zones --minutes 30
    python train/train_zones.py --data data/prepared/scin-pilot --name scin-pilot --binary redness --minutes 4

--binary <concern> turns that concern into a two-class head (grade >= 1: visible) and drops the others; the SCIN pilot
uses it, because its weak labels only say "visible redness or not".

Augmentation keeps colour honest: no hue or saturation changes (they would wipe out the redness signal), only small
brightness/contrast changes, small turns and scale, blur and JPEG. A horizontal flip turns an image-left zone into an
image-right one, so the zone name is swapped with it (common.FLIP_ZONE).

Backbones (Apache-2.0 code in timm): mobilenetv3_small_100 (default), mobilenetv3_large_100, efficientnet_lite0
(tf_efficientnet_lite0). ImageNet-pretrained weights are used unless --no-pretrained; see README, "Licences".
"""

from __future__ import annotations

import argparse
import csv
import json
import math
import random
import sys
import time
from pathlib import Path

import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import APPLIES, CONCERNS, FLIP_ZONE, RUNS  # noqa: E402

MEAN = [0.485, 0.456, 0.406]
STD = [0.229, 0.224, 0.225]


def device() -> torch.device:
    if torch.backends.mps.is_available():
        return torch.device("mps")
    if torch.cuda.is_available():
        return torch.device("cuda")
    return torch.device("cpu")


class ZoneNet(nn.Module):
    def __init__(self, backbone: str, heads: dict[str, int], pretrained: bool = True, drop: float = 0.2):
        super().__init__()
        import timm

        self.body = timm.create_model(backbone, pretrained=pretrained, num_classes=0)
        self.drop = nn.Dropout(drop)
        # MobileNetV3 has a 1x1 head conv after the pooled features, so ask the backbone what it really returns.
        with torch.no_grad():
            self.body.eval()
            width = self.body(torch.zeros(1, 3, 64, 64)).shape[1]
        self.heads = nn.ModuleDict({k: nn.Linear(width, n) for k, n in heads.items()})

    def forward(self, x: torch.Tensor) -> dict[str, torch.Tensor]:
        f = self.drop(self.body(x))
        return {k: h(f) for k, h in self.heads.items()}


def read_rows(data: Path) -> list[dict]:
    return list(csv.DictReader(open(data / "zones.csv")))


def targets(row: dict, heads: dict[str, int], binary: str | None, zone: str) -> dict[str, int]:
    out = {}
    for c in heads:
        v = int(row.get(c) or -1)
        if v >= 0 and zone not in APPLIES.get(c, []):
            v = -1
        if binary and v >= 0:
            v = 1 if v >= 1 else 0
        out[c] = v
    return out


class Crops(torch.utils.data.Dataset):
    def __init__(self, data: Path, rows: list[dict], heads: dict[str, int], binary: str | None, train: bool, size: int):
        import cv2

        self.rows, self.heads, self.binary, self.train, self.size = rows, heads, binary, train, size
        self.images = [cv2.cvtColor(cv2.imread(str(data / "crops" / r["crop"])), cv2.COLOR_BGR2RGB) for r in rows]

    def __len__(self) -> int:
        return len(self.rows)

    def augment(self, img: np.ndarray, zone: str) -> tuple[np.ndarray, str]:
        import cv2

        s = self.size
        if random.random() < 0.5:
            img = img[:, ::-1]
            zone = FLIP_ZONE.get(zone, zone)
        # Small turn and scale around the centre.
        ang = random.uniform(-10, 10)
        sc = random.uniform(0.9, 1.15)
        m = cv2.getRotationMatrix2D((s / 2, s / 2), ang, sc)
        m[:, 2] += np.random.uniform(-0.05, 0.05, 2) * s
        img = cv2.warpAffine(np.ascontiguousarray(img), m, (s, s), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT)
        # Brightness and contrast only: every channel moves together, so the balance of red to green stays.
        a = random.uniform(0.9, 1.1)
        b = random.uniform(-0.06, 0.06) * 255
        img = np.clip(img.astype(np.float32) * a + b, 0, 255).astype(np.uint8)
        if random.random() < 0.3:
            img = cv2.GaussianBlur(img, (3, 3), random.uniform(0.3, 1.0))
        if random.random() < 0.3:
            ok, enc = cv2.imencode(".jpg", img, [cv2.IMWRITE_JPEG_QUALITY, random.randint(60, 95)])
            img = cv2.imdecode(enc, cv2.IMREAD_UNCHANGED)
        return img, zone

    def __getitem__(self, i: int):
        r = self.rows[i]
        img, zone = self.images[i], r["zone"]
        if self.train:
            img, zone = self.augment(img, zone)
        x = torch.from_numpy(np.ascontiguousarray(img)).permute(2, 0, 1).float() / 255.0
        x = (x - torch.tensor(MEAN)[:, None, None]) / torch.tensor(STD)[:, None, None]
        y = targets(r, self.heads, self.binary, zone)
        return x, torch.tensor([y[c] for c in self.heads], dtype=torch.long)


def auroc(y: np.ndarray, p: np.ndarray) -> float:
    pos, neg = p[y == 1], p[y == 0]
    if len(pos) == 0 or len(neg) == 0:
        return float("nan")
    order = np.argsort(np.concatenate([pos, neg]), kind="mergesort")
    ranks = np.empty(len(order))
    ranks[order] = np.arange(1, len(order) + 1)
    allp = np.concatenate([pos, neg])
    # average ranks for ties
    for v in np.unique(allp):
        idx = allp == v
        if idx.sum() > 1:
            ranks[idx] = ranks[idx].mean()
    return float((ranks[: len(pos)].sum() - len(pos) * (len(pos) + 1) / 2) / (len(pos) * len(neg)))


def qwk(a: np.ndarray, b: np.ndarray, k: int = 4) -> float:
    o = np.zeros((k, k))
    for x, y in zip(a, b):
        o[x, y] += 1
    if o.sum() == 0:
        return float("nan")
    w = np.array([[(i - j) ** 2 for j in range(k)] for i in range(k)]) / (k - 1) ** 2
    e = np.outer(o.sum(1), o.sum(0)) / o.sum()
    den = (w * e).sum()
    return float(1 - (w * o).sum() / den) if den > 0 else float("nan")


@torch.no_grad()
def predict(model: nn.Module, loader, dev) -> tuple[dict[str, np.ndarray], np.ndarray]:
    model.eval()
    probs: dict[str, list] = {k: [] for k in model.heads}
    ys = []
    for x, y in loader:
        out = model(x.to(dev))
        for k, v in out.items():
            probs[k].append(F.softmax(v.float(), dim=1).cpu().numpy())
        ys.append(y.numpy())
    return {k: np.concatenate(v) for k, v in probs.items()}, np.concatenate(ys)


def score(probs: dict[str, np.ndarray], ys: np.ndarray, heads: dict[str, int]) -> dict[str, float]:
    out = {}
    for j, (k, n) in enumerate(heads.items()):
        m = ys[:, j] >= 0
        if m.sum() == 0:
            continue
        if n == 2:
            out[k] = auroc(ys[m, j], probs[k][m, 1])
        else:
            out[k] = qwk(ys[m, j], probs[k][m].argmax(1), n)
    return out


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--data", type=Path, required=True)
    ap.add_argument("--name", required=True)
    ap.add_argument("--backbone", default="mobilenetv3_small_100")
    ap.add_argument("--no-pretrained", action="store_true")
    ap.add_argument("--binary", choices=CONCERNS, help="train only this concern, as visible / not visible")
    ap.add_argument("--concerns", nargs="+", default=CONCERNS)
    ap.add_argument("--epochs", type=int, default=60)
    ap.add_argument("--minutes", type=float, default=30, help="stop after this much training time")
    ap.add_argument("--batch", type=int, default=64)
    ap.add_argument("--lr", type=float, default=1e-3)
    ap.add_argument("--wd", type=float, default=0.05)
    ap.add_argument("--label-smoothing", type=float, default=0.05)
    ap.add_argument("--seed", type=int, default=0)
    ap.add_argument("--pilot", action="store_true", help="mark the run as a pipeline test that must never ship")
    args = ap.parse_args()

    random.seed(args.seed)
    np.random.seed(args.seed)
    torch.manual_seed(args.seed)
    dev = device()
    prep = json.load(open(args.data / "prepare.json"))
    size = prep["size"]
    heads = {args.binary: 2} if args.binary else {c: 4 for c in args.concerns}

    rows = read_rows(args.data)
    usable = [r for r in rows if any(t >= 0 for t in targets(r, heads, args.binary, r["zone"]).values())]
    parts = {s: [r for r in usable if r["split"] == s] for s in ("train", "val", "test")}
    print({s: len(v) for s, v in parts.items()}, "crops;", "device", dev)
    if not parts["train"]:
        sys.exit("No training crops: is this evaluation-only data (MST-E), or are no grades filled in?")

    # Class weights per head from the training split (inverse frequency, softened).
    weights = {}
    for c, n in heads.items():
        ys = [targets(r, heads, args.binary, r["zone"])[c] for r in parts["train"]]
        cnt = np.bincount([y for y in ys if y >= 0], minlength=n).astype(np.float64)
        w = np.where(cnt > 0, (cnt.sum() / np.maximum(cnt, 1)) ** 0.5, 0.0)
        weights[c] = torch.tensor(w / w[w > 0].mean(), dtype=torch.float32, device=dev)
        print(f"  {c}: train counts {cnt.astype(int).tolist()}")

    train_ds = Crops(args.data, parts["train"], heads, args.binary, True, size)
    val_ds = Crops(args.data, parts["val"], heads, args.binary, False, size)
    train_dl = torch.utils.data.DataLoader(train_ds, batch_size=args.batch, shuffle=True, drop_last=len(train_ds) > args.batch)
    val_dl = torch.utils.data.DataLoader(val_ds, batch_size=args.batch)

    model = ZoneNet(args.backbone, heads, pretrained=not args.no_pretrained).to(dev)
    opt = torch.optim.AdamW(model.parameters(), lr=args.lr, weight_decay=args.wd)
    steps = args.epochs * max(1, len(train_dl))
    sched = torch.optim.lr_scheduler.OneCycleLR(opt, max_lr=args.lr, total_steps=steps, pct_start=0.15)

    out = RUNS / args.name
    out.mkdir(parents=True, exist_ok=True)
    cfg = {
        "name": args.name, "backbone": args.backbone, "pretrained": not args.no_pretrained, "heads": heads,
        "binary": args.binary, "size": size, "mean": MEAN, "std": STD, "data": str(args.data.resolve()),
        "source": prep["source"], "public_licence": prep.get("public_licence"), "pilot": bool(args.pilot),
        "zones": prep["zones"], "zone_points": prep["zone_points"], "shrink": prep["shrink"],
        "face_width": prep["face_width"], "crop_pad": prep["crop_pad"], "applies": prep["applies"],
        "seed": args.seed,
    }
    json.dump(cfg, open(out / "config.json", "w"), indent=2)
    log = open(out / "train_log.csv", "w", newline="")
    lw = csv.writer(log)
    lw.writerow(["epoch", "seconds", "train_loss"] + [f"val_{k}" for k in heads])

    best, t0 = -math.inf, time.time()
    for epoch in range(1, args.epochs + 1):
        model.train()
        total, n = 0.0, 0
        for x, y in train_dl:
            x, y = x.to(dev), y.to(dev)
            out_ = model(x)
            loss = torch.zeros((), device=dev)
            for j, k in enumerate(heads):
                if (y[:, j] >= 0).any():
                    loss = loss + F.cross_entropy(out_[k], y[:, j], weight=weights[k], ignore_index=-1,
                                                  label_smoothing=args.label_smoothing)
            opt.zero_grad()
            loss.backward()
            opt.step()
            sched.step()
            total += loss.item() * len(x)
            n += len(x)
        probs, ys = predict(model, val_dl, dev)
        val = score(probs, ys, heads)
        mean_val = float(np.nanmean(list(val.values()))) if val else float("nan")
        secs = time.time() - t0
        lw.writerow([epoch, round(secs, 1), round(total / max(1, n), 4)] + [round(val.get(k, float("nan")), 4) for k in heads])
        log.flush()
        print(f"epoch {epoch:3d}  {secs:6.0f}s  loss {total / max(1, n):.3f}  val {', '.join(f'{k} {v:.3f}' for k, v in val.items())}")
        if not math.isnan(mean_val) and mean_val > best:
            best = mean_val
            torch.save({"state_dict": model.state_dict(), "config": cfg, "epoch": epoch, "val": val}, out / "best.pt")
        if secs > args.minutes * 60:
            print(f"time budget of {args.minutes} min reached")
            break
    torch.save({"state_dict": model.state_dict(), "config": cfg, "epoch": epoch, "val": val}, out / "last.pt")
    if not (out / "best.pt").exists():
        torch.save({"state_dict": model.state_dict(), "config": cfg, "epoch": epoch, "val": val}, out / "best.pt")
    print(f"best mean val {best:.3f}; saved {out / 'best.pt'}")


if __name__ == "__main__":
    main()
