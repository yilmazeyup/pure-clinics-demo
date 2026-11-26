#!/bin/sh
# The SCIN pilot from start to finish: download, prepare, train (about 4 minutes on MPS), evaluate, export, and run
# the export in headless Chrome through the app's own scan code. A pipeline test; its model is never shipped.
set -e
cd "$(dirname "$0")/.."
PY=.venv/bin/python
$PY train/pilot_scin.py --positives 220
$PY train/prepare.py --photos data/scin/images --zones data/scin/labels/zones_SCIN-weak.csv \
  --public-licence "SCIN Data Use License" --patch-fallback --out data/prepared/scin-pilot
$PY train/train_zones.py --data data/prepared/scin-pilot --name scin-pilot --binary redness \
  --minutes 4 --epochs 150 --batch 32 --lr 3e-4 --pilot
$PY train/evaluate.py --run runs/scin-pilot
$PY train/export_onnx.py --run runs/scin-pilot
$PY train/evaluate.py --run runs/scin-pilot --onnx runs/scin-pilot/export/huidscan.int8.onnx
node train/browser_check.mjs runs/scin-pilot/export
