# Huidscan: Pure Clinics' own skin-scan model

The pipeline to train a model on Pure's own photos that sees visible skin concerns in the app's selfie scan. Status, 27 November 2026: **the whole chain works and was proven
on a small public dataset (SCIN). There is no model to ship yet; that needs Pure's photos and labels.** The app keeps
its colour measures until a real model is approved.

What the model does: per face zone (forehead, both cheeks, nose, chin, under both eyes) a grade 0–3 for **redness,
pigmentation/uneven tone, fine lines and under-eye darkness**, and boxes around **inflamed blemishes, comedones and
dark spots**. Oily/dry is not modelled. It describes what is visible; it never names a condition.

## Rules

**Data**
- Pure's own client photos. They are already covered by Pure's consent for training, so **clients are not asked
  anything again**: no extra form, no question in the app. Someone who later asks to be left out goes on the
  leave-out list (`prepare.py --leave-out`).
- Client photos are health data. They stay **on the clinic's Mac (FileVault) or in the EU** under a processor
  agreement. **Never to EVREN**, never in WhatsApp, e-mail, consumer cloud or git. `data/`, `runs/`, label exports and
  model files are git-ignored.
- Public data: **SCIN** (Google, SCIN Data Use License: commercial use allowed with attribution, no re-identification)
  may be used. **ACNE04, AcneSCU, FFHQ-Wrinkle** are research-only: never for weights Pure uses (`prepare.py` refuses
  them by name). **MST-E** may only be used to evaluate, never to train (`prepare.py` puts it all in the test split).

**App wording (EU MDR)**: only "zichtbare onzuiverheden, roodheid, pigmentvlekken, fijne lijntjes, vermoeide
oogzone", always with "geen medische diagnose" and the way to the free intake. `huidscan.json` carries that wording.

**Code licences**: everything is Apache-2.0, MIT or BSD: timm (zone classifier), D-FINE (box detector, cloned into
`third_party/` with its LICENSE), MediaPipe (face landmarks), onnxruntime. **No Ultralytics YOLO (AGPL-3.0).**

**Pretrained weights** are a separate question from code licences (see "Decisions"): timm's MobileNetV3 weights were
trained on ImageNet; D-FINE's HGNetV2 backbone too; D-FINE-N on COCO. Never start from D-FINE's `*_obj365` /
`*_obj2coco` checkpoints (D-FINE's README: Objects365 terms, not cleared for commercial use; `train_boxes.py` refuses).

**Colour honesty**: no hue or saturation augmentation anywhere (it erases redness and pigment). A horizontal flip
swaps left and right zones.

## Layout

```
ml/huidscan/
  README.md  FOTOPROTOCOL.md
  label/index.html          labelling tool for the therapists (local, Dutch)
  label/kappa.py            agreement between two therapists (standard library only)
  train/common.py           zones, landmarks, alignment, crops: the single definition
  train/import_photos.py    Pure's existing photo archive -> code_date_view.jpg, without names or EXIF
  train/import_voor_na.py   Pure's VOOR|NA composites -> graded skin patches;  train/cv_voor_na.py  5-fold test
  train/prepare.py          photos + labels -> aligned zone crops, detector tiles, split by person
  train/train_zones.py      timm classifier, one head per concern (grade 0-3), MPS
  train/train_boxes.py      D-FINE-N wrapper (setup, config, train, predict, smoke test)
  train/evaluate.py         results per Monk group, with intervals
  train/export_onnx.py      ONNX + int8, huidscan.json, reference outputs; --install into the app
  train/browser_check.*     runs the export in headless Chrome through the app's own scan code
  train/pilot_scin.py       the SCIN pilot data;  train/run_pilot.sh  the pilot start to finish
  .venv/  data/  runs/  third_party/      (git-ignored)
apps/mobile/src/scan/model.ts            the app hook (the app sends no photo anywhere)
```

## Set up (once)

```sh
cd ml/huidscan
/opt/homebrew/bin/python3.12 -m venv .venv
.venv/bin/pip install -r train/requirements.txt
.venv/bin/python train/train_boxes.py --setup     # only for the box detector: clones D-FINE, installs its needs
```
The face model (`face_landmarker.task`, Google, Apache-2.0) downloads itself into `data/models/` on first use.

## The steps

**1. Pure's photos in.** Copy Pure's existing photo archive to the clinic's Mac as it is, one folder per client (or
all in one folder with the client's name at the start of each file name, then add `--by name`), and run:
```sh
.venv/bin/python train/import_photos.py --src ~/Huidscan/archief --out ~/Huidscan/fotos --key ~/Huidscan/sleutel.csv
```
It keeps the photos with a whole face (legs, tattoos and close-ups are skipped), works out front/left/right from the
face, takes the date from the photo, and saves clean JPEGs as `PC0042_20261201_F.jpg`: no names, no EXIF, no GPS. The
names sit only in `sleutel.csv` (client -> code), which stays on that Mac; the next import gives every client the same
code and skips photos it already took. The archive folder can be deleted afterwards.

**2. New photos.** FOTOPROTOCOL.md: same light and camera, no make-up, three views (F, L, R), straight onto the clinic's
Mac in `Huidscan/fotos` with the client's code from `sleutel.csv`. Old photos in mixed light still help; the protocol
makes the new ones better.

**3. Labelling.** Open `label/index.html` in Chrome (double-click is enough; or `python3 -m http.server` in `label/`).
Each therapist enters initials, opens the photos and grades the zones the face finder proposes, draws boxes, sets the
Monk tone and marks bad photos. Labels stay in that browser; "Exporteren" saves `huidscan_zones_<NV>_<date>.csv` and
`huidscan_boxes_<NV>_<date>.json`; "Back-up" saves everything. Nothing is uploaded.
Two therapists label the same first 50 clients independently, then:
```sh
python3 label/kappa.py huidscan_zones_NV_*.csv huidscan_zones_ES_*.csv --boxes huidscan_boxes_NV_*.json huidscan_boxes_ES_*.json
```
Below 0.60 on a concern: sit together over the disagreements, sharpen what 1, 2 and 3 mean, then go on. Keep
double-labelling about one client in five, and all of the test set.

**4. Prepare.**
```sh
.venv/bin/python train/prepare.py --photos ~/Huidscan/fotos --zones ~/Huidscan/labels/huidscan_zones_*.csv \
  --boxes ~/Huidscan/labels/huidscan_boxes_*.json --out data/prepared/pure-v1
```
Two therapists' grades are averaged (rounded half up); boxes are merged (`--box-merge union|agree`). The test set takes
the same number of people from each Monk group (1–3, 4–6, 7–10) as far as the data allows; `prepare.json` says which
groups fall short.

**5. Zone classifier.**
```sh
.venv/bin/python train/train_zones.py --data data/prepared/pure-v1 --name pure-v1-zones --minutes 30
```
MobileNetV3-small by default (`--backbone efficientnet_lite0` also works), 128 px crops, MPS.

**6. Box detector.**
```sh
.venv/bin/python train/train_boxes.py --data data/prepared/pure-v1 --name pure-v1-boxes --epochs 72
.venv/bin/python train/train_boxes.py --data data/prepared/pure-v1 --name pure-v1-boxes --predict
```
`--smoke` runs two epochs on 24 synthetic tiles of dots to check the wiring (it ran on MPS: training, COCO
evaluation and test predictions, a few seconds per epoch). D-FINE's photometric augmentation is switched off (hue).
The detector is not wired into the app yet; the zone model is.

**7. Evaluate.**
```sh
.venv/bin/python train/evaluate.py --run runs/pure-v1-zones
.venv/bin/python train/evaluate.py --boxes-gt data/prepared/pure-v1/tiles_test.json --boxes-pred runs/pure-v1-boxes/test_pred.json
```
Proposed bar before anything reaches the app: at least 30 test people in every Monk group; per concern a quadratic
weighted kappa of 0.6 or more overall, no Monk group more than 0.1 below the overall; about as good as two therapists
agree with each other; and the owner has seen the table.

**8. Export and check in the browser.**
```sh
.venv/bin/python train/export_onnx.py --run runs/pure-v1-zones
node train/browser_check.mjs runs/pure-v1-zones/export
```
`huidscan.onnx` (fp32) and `huidscan.int8.onnx` (int8 weights, fp32 arithmetic: a quarter of the download, same
answers; full int8 changed a third of the pilot's answers, MobileNetV3 quantises badly), plus `huidscan.json`. The
check runs both in onnxruntime-web 1.31.1 in headless Chrome and compares with Python, then runs the app's own
`run.ts` scan on a face with and without the model.

**9. Into the app** (only after step 7's bar and the owner's yes):
```sh
.venv/bin/python train/export_onnx.py --run runs/pure-v1-zones --install
```
copies the model to `apps/mobile/public/models/huidscan.onnx` + `huidscan.json`. It refuses pilot runs and runs trained
only on public data. `apps/mobile/src/scan/model.ts` then loads it (onnxruntime-web from jsDelivr, WASM), cuts the same
zones from the selfie, and blends its redness and pigmentation readings into the colour measures (`blend` in
`huidscan.json`, 0.5 by default); fine lines and the eye zone are kept in `outcome.model` until the screen gets words
for them. Without those two files the app behaves exactly as before.

**Someone asks to be left out.** Look up their code in `sleutel.csv`, add it to `Huidscan/weglaten.txt`, delete their
photos from `Huidscan/fotos`, run `prepare.py --leave-out ~/Huidscan/weglaten.txt` again (it rebuilds
`data/prepared/...` from scratch, so the old crops are gone) and train the next version without them. Delete old
`data/prepared/*` folders you no longer use.

## First model on Pure's own photos (27 November 2026)

Pure's published before/after photos (pureclinics.nl, 55 images, of which 44 show a face: 26 clients, 78 photo
halves) were graded by Claude, half by half, for redness and pigmentation 0-3 (`label/voor-na-grades.csv`; two Sylfirm
images are the same photos as IPL 05 and were left out). Most are close-ups, so `train/import_voor_na.py` cuts skin
patches instead of face zones (band, VOOR/NA badge, eyes, brows and lips masked), and `train/cv_voor_na.py` trains and
tests in five folds, each client tested once and never trained on.
```sh
.venv/bin/python train/cv_voor_na.py --name voor-na --minutes 3     # about 4 minutes on the M1
```
Result per photo half, on clients the model never saw (`runs/voor-na-cv/cv.json`):

| | redness | pigmentation |
|---|---|---|
| AUROC visible (grade >= 1) / clear (>= 2) | 0.82 / 0.78 | 0.70 / 0.75 |
| a plain colour measure on the same patches | 0.81 / 0.79 (mean a*) | 0.50 / 0.46 (dark-pixel share) |
| grade within one of Claude's grade | 95% | 97% |
| before/after pairs where the model reads less after | 38 of 55 | 31 of 36 |

In plain words: for redness the colour measure the app already has is as good; for spots and uneven tone the model
sees what the colour measure misses. It is not in the app yet: 26 clients, nearly all light skin (one Monk 4, one
Monk 7), and one grader. More of Pure's own before/after photos (Instagram) are the next step.

## The SCIN pilot (a pipeline test, not a model)

`train/run_pilot.sh` does it all. What it showed:

- **Data**: 316 SCIN head/neck images (96 "not red": looks healthy or a non-red condition; 220 "red": mostly
  inflammatory conditions), weak per-case labels, 146 people. Only **7 of 316 photos had a findable face** (SCIN is
  mostly close-ups), so the pilot is in effect a "visible redness yes/no" classifier on skin patches. Attribution in
  `data/scin/ATTRIBUTION.md`.
- **Training**: MobileNetV3-small, 150 epochs in about 3 minutes on the M1's GPU (MPS).
- **Test** (23 people, 55 crops, Monk-balanced as far as SCIN allows: 10 / 10 / 3 people): **AUROC 0.59 (95% interval
  0.34–0.81)**; an earlier run with the same settings gave 0.67 (0.47–0.85). In plain words: **not distinguishable from chance**,
  and every Monk group is too small to read (Monk 7–10: 3 people). Expected with 243 training crops and labels that
  belong to a case rather than to the crop.
- **Export**: fp32 ONNX matches PyTorch to 1e-5; int8 weights 1.7 MB instead of 6.1 MB, AUROC 0.60.
- **Browser**: onnxruntime-web gives Python's numbers to 3e-6 (fp32 and int8); the app's `model.ts` cuts the same zones
  as Python (1–3 grey levels of 255 apart on average); the app's whole scan runs with the model (about 70 ms for seven
  zones) and without it (colour measures unchanged). The pilot model's answer moved by up to 0.14 on those tiny
  resampling differences: an unstable model. The check reports this, and a model to ship must not do it.
- **Labelling tool**: run from `file://` in headless Chrome as two therapists; its exports went through `kappa.py` and
  `prepare.py`.

## What Pure needs to provide (estimates)

Rough rules of thumb, to be revised after the first 150 clients:

| | first real test | version 1 (to consider for the app) |
|---|---|---|
| clients with usable face photos | 150 | 600 |
| per concern, clients graded 2 or 3 somewhere | 40 | 150 (redness, pigmentation, fine lines, eye zone each) |
| Monk 4–6 / 7–10 | as many as come | at least 100 / 60, so the test set has 30 per group |
| boxes | – | about 1,500 per class: ~300 clients with blemishes/comedones, ~300 with dark spots |

Monk 7–10 will be the hardest from Nijmegen and Uden alone; photos from other clinics in Huidly are the realistic way
there, later.

Therapist time: zones, tint and quality about 4 minutes per client (three views); boxes about 12 minutes for a
blemish-prone face, under 2 minutes to confirm a clear one; one calibration session of 2–3 hours. That is roughly
**35 hours for the first 150 clients** and **130 hours for version 1** (including double-labelling the test set).

## Settled

- **No extra consent step**: Pure's photos are covered for training; clients are not asked again (owner, 27 Nov 2026).
- **Pretrained weights**: ImageNet/COCO starting weights, as is usual commercially. Never D-FINE's Objects365 ones.
- **Masked crops**: not needed; crops never leave the clinic's Mac or the EU training machine.
- **Light**: two daylight LED panels with softboxes and a grey card make new photos better; not needed to start.

## Licences and attribution

- D-FINE: Apache-2.0, © The D-FINE Authors, `third_party/D-FINE/LICENSE` kept as cloned.
- timm: Apache-2.0. MediaPipe Face Landmarker: Apache-2.0 (Google). onnxruntime(-web): MIT.
- Monk Skin Tone Scale (used in the labelling tool): CC BY 4.0, Dr. Ellis Monk / Google.
- SCIN: SCIN Data Use License, Google Research, https://github.com/google-research-datasets/scin ; Ward A, et al.
  JAMA Netw Open. 2024;7(11):e2446615. Used for the pilot only; nothing from it ships.
