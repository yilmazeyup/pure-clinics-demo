# EVREN daily trainings (29 Nov - 5 Dec 2026)

The owner asked (28 Nov 2026) for better skin-scan results: a model at least 10x larger than the app's
(MobileNetV3-large, 4.2M parameters), harder and better training, and at least 50 trainings a day for at least seven
days, free of charge: EVREN's GPUs with the account's credits ("Evren'den GPU kiralayabilirsin, bir ücret
ödemeyeceğim"). Nothing is paid for, ever.

## What is where

- **Data** (built 28 Nov): 8,606 FairFace faces (CC BY 4.0), 4,716 graded by two helpers (consensus labels) and 3,890
  by one; `label/face-grades*.csv`, `train/import_faces.py`, `data/prepared/face-v2` (224 px face crops).
  Agreement between the two graders (QWK): lines 0.93, pigmentation 0.82, redness 0.81, eyes 0.76, acne 0.69.
- **EVREN** (evren.ssyz.org.tr, the user's account, Chrome "Browser 2", deviceId adcef957-8e35-4d3a-9829-098b65da2c2e):
  project "Pure Clinics Huidscan" with the private datasets Huidscan Lijnen / Ogen / Roodheid / Pigment
  (gezichten), image classification, classes `<concern>-<grade>` (eyes, redness, pigmentation: 0-2; lines 0-3).
  Only training and validation people went up; Pure's own photos never go to EVREN. Sign-in is e-Devlet only:
  if EVREN asks for it, stop and ask the user to sign in.
- **Test set** (never uploaded): `data/evren-face/test.csv`, 783 faces; score with
  `.venv/bin/python train/eval_face_cls.py --yolo lines=<onnx> ... --face ../../apps/mobile/public/models/huidscan-face.onnx`.
- **Baseline to beat** (app's face model face-v1 on that test set, AUROC visible / clear, QWK): lines 0.928 / 0.960,
  0.80; eyes 0.894 / 0.933, 0.63; redness 0.847 / 0.935; pigmentation 0.851 / 0.940.
- **Mac**: `runs/face-v2-convnext-small` (ConvNeXt-Small, 49.5M parameters, ~15 min per epoch on the M1).

## The training form (learned by trial)

Coordinates in the 1504x812 screenshot frame of the EVREN tab, page https://evren.ssyz.org.tr/training.
The "Yeni Eğitim" form keeps the previous job's values (project, dataset, version switch, task, family, size,
hyperparameters, GPU); replace text fields with triple_click + cmd+a + type.
1. "Yeni Eğitim" (1422,357); wait 2; scroll up 15 at (750,300).
2. Name (548,161); tags (945,161).
3. Dataset: open (747,210), option x=712, y: Lijnen 238, Ogen 262, Pigment (gezichten) 285, Roodheid (gezichten) 330
   (308 and 353 are the old "huidpatches" sets: never). The "Mevcut veri ile" switch (1072,191) must be on
   (version line ends "(otomatik versiyon)"); it stays on when the dataset changes.
4. Family: YOLO26 (441,482), YOLO11 (613,482), YOLOv8 (787,482); then size x=1012, y: Nano 475, Small 499,
   Medium 523, Large 548, XLarge 572. "Başlangıç Ağırlığı (Fine-tune)" below the family can start from one of our
   earlier EVREN models.
5. Tab "Hiperparametre" (748,110): Epoch (450,190), image size (846,190), Patience (1043,190), Seed (648,242),
   LR0 (648,383); back with tab "Genel" (490,110). K-fold is not available for classification.
6. Check with a zoom of (356,130,1146,600); start (1094,739); wait 5; confirm "Bu Ayarlarla Devam Et" (1066,738).
7. The new job is the top row of the list; "Detay" shows P/R/F1 when done. A job costs about 0.2-1.5 credits.

## Each day

1. Read the leaderboard (`runs/evren-face/leaderboard.md`, git-ignored) and yesterday's jobs on EVREN (their P/R/F1).
2. Download the ONNX export of the best two or three models per concern from EVREN (the model's page; the file
   arrives in ~/Downloads, move it to `runs/evren-face/<job-name>.onnx`) and score them, alone and averaged, with
   `train/eval_face_cls.py`. Add the numbers to the leaderboard.
3. Launch at least 50 new jobs: about half exploit (the best family/size/settings per concern with new seeds, so
   their average can be scored as an ensemble; fine-tuning from the best model), about half explore (image size 192
   or 288, 150-200 epochs, LR0 0.003 / 0.0005, YOLO11 or YOLOv8, Large vs XLarge, augmentation changes). Keep the
   credits above 300.
4. Report to the user in Turkish, in a few lines: how many jobs ran, the best result per concern next to the app's
   baseline, and what changes tomorrow. Do not put a model into the app without the user's yes: when an ensemble
   beats the baseline clearly (AUROC and QWK), say so and ask.
