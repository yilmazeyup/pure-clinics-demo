"""Results on the test split, per Monk skin tone group (1-3, 4-6, 7-10), with 95% intervals.

    python train/evaluate.py --run runs/pure-v1-zones
    python train/evaluate.py --run runs/scin-pilot --onnx runs/scin-pilot/export/huidscan.int8.onnx
    python train/evaluate.py --boxes-gt data/prepared/pure-v1/tiles_test.json --boxes-pred runs/pure-v1-boxes/test_pred.json

Zone grades (0-3): quadratic weighted kappa, mean absolute error, exact and within-one agreement.
Two-class heads: AUROC, and sensitivity/specificity at the threshold that worked best on the validation split.
Boxes: AP at IoU 0.5 per class and group, from a COCO results file.
Intervals come from resampling people (not crops), 1000 times. A group with fewer than 30 test crops or 10 people is
marked as too small to say anything: report it, do not read it.
"""

from __future__ import annotations

import argparse
import csv
import json
import sys
from collections import defaultdict
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import MONK_GROUPS, monk_group  # noqa: E402
from train_zones import Crops, auroc, qwk, targets  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]


def probs_torch(run: Path, ds) -> dict[str, np.ndarray]:
    import torch

    from train_zones import ZoneNet, device, predict

    ck = torch.load(run / "best.pt", map_location="cpu", weights_only=False)
    cfg = ck["config"]
    model = ZoneNet(cfg["backbone"], cfg["heads"], pretrained=False)
    model.load_state_dict(ck["state_dict"])
    dev = device()
    model.to(dev)
    dl = torch.utils.data.DataLoader(ds, batch_size=64)
    p, _ = predict(model, dl, dev)
    return p


def probs_onnx(path: Path, ds, cfg: dict) -> dict[str, np.ndarray]:
    import onnxruntime as ort

    sess = ort.InferenceSession(str(path), providers=["CPUExecutionProvider"])
    mean = np.array(cfg["mean"], dtype=np.float32)[:, None, None]
    std = np.array(cfg["std"], dtype=np.float32)[:, None, None]
    out: dict[str, list] = defaultdict(list)
    for i in range(0, len(ds), 64):
        xs = np.stack([ds[j][0].numpy() for j in range(i, min(len(ds), i + 64))])
        pixels = (xs * std + mean).astype(np.float32)  # the ONNX model takes 0-1 RGB and normalises itself
        res = sess.run(None, {"pixels": pixels})
        for name, v in zip([o.name for o in sess.get_outputs()], res):
            out[name].append(v)
    return {k: np.concatenate(v) for k, v in out.items()}


def bootstrap(fn, people: np.ndarray, n: int = 1000, seed: int = 0) -> tuple[float, float]:
    rng = np.random.default_rng(seed)
    uniq = np.unique(people)
    idx_by = {p: np.where(people == p)[0] for p in uniq}
    vals = []
    for _ in range(n):
        pick = rng.choice(uniq, size=len(uniq), replace=True)
        idx = np.concatenate([idx_by[p] for p in pick])
        v = fn(idx)
        if not np.isnan(v):
            vals.append(v)
    if len(vals) < n * 0.5:
        return float("nan"), float("nan")
    return float(np.percentile(vals, 2.5)), float(np.percentile(vals, 97.5))


def youden(y: np.ndarray, p: np.ndarray) -> float:
    best, thr = -1.0, 0.5
    for t in np.unique(p):
        pred = p >= t
        sens = (pred & (y == 1)).sum() / max(1, (y == 1).sum())
        spec = (~pred & (y == 0)).sum() / max(1, (y == 0).sum())
        if sens + spec - 1 > best:
            best, thr = sens + spec - 1, float(t)
    return thr


def zone_report(run: Path, onnx: Path | None) -> dict:
    cfg = json.load(open(run / "config.json"))
    data = Path(cfg["data"])
    heads, binary = cfg["heads"], cfg.get("binary")
    rows = list(csv.DictReader(open(data / "zones.csv")))
    usable = [r for r in rows if any(t >= 0 for t in targets(r, heads, binary, r["zone"]).values())]
    out = {"run": cfg["name"], "model": str(onnx or run / "best.pt"), "pilot": cfg.get("pilot"), "heads": {}}
    parts = {}
    for split in ("val", "test"):
        rs = [r for r in usable if r["split"] == split]
        ds = Crops(data, rs, heads, binary, False, cfg["size"])
        probs = probs_onnx(onnx, ds, cfg) if onnx else probs_torch(run, ds)
        ys = np.array([[targets(r, heads, binary, r["zone"])[c] for c in heads] for r in rs])
        parts[split] = (rs, probs, ys)

    for j, (head, n) in enumerate(heads.items()):
        rv, pv, yv = parts["val"]
        mv = yv[:, j] >= 0
        thr = youden(yv[mv, j], pv[head][mv, 1]) if n == 2 and mv.any() else None
        rs, probs, ys = parts["test"]
        groups = np.array([monk_group(r["monk"]) for r in rs])
        people = np.array([r["person"] for r in rs])
        res = {"threshold_from_val": thr}
        for g in ["alle"] + MONK_GROUPS + ["onbekend"]:
            m = (ys[:, j] >= 0) & ((groups == g) if g != "alle" else True)
            idx_all = np.where(m)[0]
            if len(idx_all) == 0:
                continue
            y, p, pp = ys[idx_all, j], probs[head][idx_all], people[idx_all]
            entry = {"crops": int(len(idx_all)), "people": int(len(np.unique(pp)))}
            entry["too_small"] = entry["crops"] < 30 or entry["people"] < 10
            if n == 2:
                entry["positives"] = int((y == 1).sum())
                entry["auroc"] = auroc(y, p[:, 1])
                entry["auroc_95"] = bootstrap(lambda i: auroc(y[i], p[i, 1]), pp)
                pred = p[:, 1] >= thr
                entry["sensitivity"] = float((pred & (y == 1)).sum() / max(1, (y == 1).sum()))
                entry["specificity"] = float((~pred & (y == 0)).sum() / max(1, (y == 0).sum()))
                entry["balanced_accuracy"] = (entry["sensitivity"] + entry["specificity"]) / 2
            else:
                g_pred = p.argmax(1)
                entry["qwk"] = qwk(y, g_pred, n)
                entry["qwk_95"] = bootstrap(lambda i: qwk(y[i], g_pred[i], n), pp)
                entry["mae"] = float(np.abs(y - g_pred).mean())
                entry["exact"] = float((y == g_pred).mean())
                entry["within_one"] = float((np.abs(y - g_pred) <= 1).mean())
                entry["grade_counts"] = np.bincount(y, minlength=n).tolist()
            res[g] = entry
        out["heads"][head] = res
    return out


def ap50(gt: dict, pred: list[dict], cls: int, image_ids: set[int]) -> tuple[float, int]:
    gts = defaultdict(list)
    for a in gt["annotations"]:
        if a["category_id"] == cls and a["image_id"] in image_ids:
            gts[a["image_id"]].append(a["bbox"])
    n_gt = sum(len(v) for v in gts.values())
    used = {k: [False] * len(v) for k, v in gts.items()}
    dets = sorted([d for d in pred if d["category_id"] == cls and d["image_id"] in image_ids], key=lambda d: -d["score"])
    tp = []
    from prepare import iou

    for d in dets:
        best, bi = 0.5, -1
        for i, g in enumerate(gts.get(d["image_id"], [])):
            v = iou(d["bbox"], g)
            if v >= best and not used[d["image_id"]][i]:
                best, bi = v, i
        if bi >= 0:
            used[d["image_id"]][bi] = True
            tp.append(1)
        else:
            tp.append(0)
    if n_gt == 0:
        return float("nan"), 0
    tp = np.array(tp)
    ctp = np.cumsum(tp)
    rec = ctp / n_gt
    prec = ctp / np.arange(1, len(tp) + 1)
    ap = 0.0
    for r in np.linspace(0, 1, 101):
        ps = prec[rec >= r] if len(prec) else []
        ap += (max(ps) if len(ps) else 0) / 101
    return float(ap), n_gt


def box_report(gt_path: Path, pred_path: Path) -> dict:
    gt = json.load(open(gt_path))
    pred = json.load(open(pred_path))
    out = {}
    for g in ["alle"] + MONK_GROUPS:
        ids = {im["id"] for im in gt["images"] if g == "alle" or im.get("monk_group") == g}
        if not ids:
            continue
        out[g] = {c["name"]: dict(zip(("ap50", "boxes"), ap50(gt, pred, c["id"], ids))) for c in gt["categories"]}
    return out


def table(rep: dict) -> str:
    lines = [f"# Evaluation: {rep['run']}", "", f"Model: `{rep['model']}`", ""]
    if rep.get("pilot"):
        lines += ["**Pilot: pipeline test on weak public labels. Not a model to ship.**", ""]
    for head, res in rep["heads"].items():
        thr = res.get("threshold_from_val")
        lines += [f"## {head}" + (f" (threshold from validation: {thr:.3f})" if thr is not None else ""), ""]
        two = "auroc" in next(v for k, v in res.items() if isinstance(v, dict))
        if two:
            lines += ["| Monk group | crops | people | visible | AUROC (95%) | sensitivity | specificity | note |",
                      "|---|---|---|---|---|---|---|---|"]
        else:
            lines += ["| Monk group | crops | people | QWK (95%) | MAE | exact | within 1 | note |",
                      "|---|---|---|---|---|---|---|---|"]
        for g, e in res.items():
            if not isinstance(e, dict):
                continue
            note = "too small to read" if e["too_small"] else ""
            if two:
                lo, hi = e["auroc_95"]
                lines.append(f"| {g} | {e['crops']} | {e['people']} | {e['positives']} | {e['auroc']:.2f} ({lo:.2f}-{hi:.2f}) "
                             f"| {e['sensitivity']:.2f} | {e['specificity']:.2f} | {note} |")
            else:
                lo, hi = e["qwk_95"]
                lines.append(f"| {g} | {e['crops']} | {e['people']} | {e['qwk']:.2f} ({lo:.2f}-{hi:.2f}) | {e['mae']:.2f} "
                             f"| {e['exact']:.2f} | {e['within_one']:.2f} | {note} |")
        lines.append("")
    return "\n".join(lines)


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--run", type=Path)
    ap.add_argument("--onnx", type=Path, help="evaluate this exported model instead of the PyTorch checkpoint")
    ap.add_argument("--boxes-gt", type=Path)
    ap.add_argument("--boxes-pred", type=Path)
    args = ap.parse_args()
    if args.run:
        rep = zone_report(args.run, args.onnx)
        suffix = "" if not args.onnx else "_" + args.onnx.stem.replace(".", "_")
        json.dump(rep, open(args.run / f"eval{suffix}.json", "w"), indent=2)
        md = table(rep)
        (args.run / f"eval{suffix}.md").write_text(md)
        print(md)
    if args.boxes_gt and args.boxes_pred:
        rep = box_report(args.boxes_gt, args.boxes_pred)
        print(json.dumps(rep, indent=2))


if __name__ == "__main__":
    main()
