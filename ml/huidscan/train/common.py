"""Shared definitions for the huidscan pipeline: zones, concerns, face alignment and zone crops.

The app (apps/mobile/src/scan/model.ts) must crop exactly the same way. The zone points and crop settings are also
written into huidscan.json by export_onnx.py, and the app reads them from there, so a change here travels with the
model instead of having to be copied by hand.

Landmark numbers are MediaPipe Face Landmarker's 478 points. "L" and "R" mean left and right *in the image*, as
MediaPipe numbers them (point 234 is the image-left edge of the face on a normal photo), the same convention as
analyze.ts. A horizontal flip turns an image-left zone into an image-right zone, so flips must swap the zone names.
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]  # ml/huidscan
DATA = ROOT / "data"
RUNS = ROOT / "runs"
FACE_MODEL = DATA / "models" / "face_landmarker.task"
FACE_MODEL_URL = (
    "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task"
)

# --- Zones -----------------------------------------------------------------------------------------------------------
# The first five match ZONE_POINTS and SHRINK in apps/mobile/src/scan/analyze.ts. The two under-eye zones are new: the
# band between the lower eyelid and the top of the cheek.
ZONE_POINTS: dict[str, list[int]] = {
    "forehead": [67, 109, 10, 338, 297, 299, 296, 336, 9, 107, 66, 69],
    "cheekL": [118, 101, 36, 205, 206, 216, 192, 213, 147, 123, 117],
    "cheekR": [347, 330, 266, 425, 426, 436, 416, 433, 376, 352, 346],
    "nose": [168, 122, 196, 3, 51, 45, 4, 275, 281, 248, 419, 351],
    "chin": [18, 313, 421, 428, 396, 175, 171, 208, 201, 83],
    "underEyeL": [226, 110, 24, 23, 22, 26, 112, 244, 233, 128, 121, 120, 119, 118, 117, 111, 35],
    "underEyeR": [446, 339, 254, 253, 252, 256, 341, 464, 453, 357, 350, 349, 348, 347, 346, 340, 265],
}
SHRINK: dict[str, float] = {
    "forehead": 0.86, "cheekL": 0.86, "cheekR": 0.86, "nose": 0.8, "chin": 0.84, "underEyeL": 0.92, "underEyeR": 0.92,
}
ZONES: list[str] = list(ZONE_POINTS)
FLIP_ZONE: dict[str, str] = {
    "forehead": "forehead", "nose": "nose", "chin": "chin",
    "cheekL": "cheekR", "cheekR": "cheekL", "underEyeL": "underEyeR", "underEyeR": "underEyeL",
    "patch": "patch",
}
ZONE_NL: dict[str, str] = {
    "forehead": "voorhoofd", "cheekL": "wang (links op de foto)", "cheekR": "wang (rechts op de foto)",
    "nose": "neus", "chin": "kin", "underEyeL": "onder het oog (links op de foto)",
    "underEyeR": "onder het oog (rechts op de foto)", "patch": "huidvlak (geen gezicht gevonden)",
}

# --- Concerns --------------------------------------------------------------------------------------------------------
# Zone grades 0-3. Which zones a concern is graded in; elsewhere the label is "not applicable" and ignored in the loss.
CONCERNS: list[str] = ["redness", "pigmentation", "fine_lines", "under_eye_dark"]
APPLIES: dict[str, list[str]] = {
    "redness": ["forehead", "cheekL", "cheekR", "nose", "chin", "patch"],
    "pigmentation": ["forehead", "cheekL", "cheekR", "nose", "chin", "patch"],
    "fine_lines": ["forehead", "underEyeL", "underEyeR"],
    "under_eye_dark": ["underEyeL", "underEyeR"],
}
# Wording the app may show (EU MDR: describe what is visible, never name a condition).
CONCERN_NL: dict[str, str] = {
    "redness": "roodheid",
    "pigmentation": "pigmentvlekken",
    "fine_lines": "fijne lijntjes",
    "under_eye_dark": "vermoeide oogzone",
}
BOX_CLASSES: list[dict] = [
    {"id": 1, "name": "inflamed_blemish", "name_nl": "ontstoken onzuiverheid", "app_nl": "zichtbare onzuiverheden"},
    {"id": 2, "name": "comedone", "name_nl": "mee-eter", "app_nl": "zichtbare onzuiverheden"},
    {"id": 3, "name": "dark_spot", "name_nl": "pigmentvlek", "app_nl": "pigmentvlekken"},
]

# --- Monk skin tone groups -------------------------------------------------------------------------------------------
def monk_group(monk) -> str:
    try:
        m = int(monk)
    except (TypeError, ValueError):
        return "onbekend"
    if 1 <= m <= 3:
        return "1-3"
    if 4 <= m <= 6:
        return "4-6"
    if 7 <= m <= 10:
        return "7-10"
    return "onbekend"


MONK_GROUPS = ["1-3", "4-6", "7-10"]

# --- Alignment and crops ---------------------------------------------------------------------------------------------
# The face is rotated so the eyes are level and scaled so its width (point 234 to 454) is FACE_WIDTH pixels; then each
# zone is cut as a square around its outline (side = longest side of the zone's box x CROP_PAD) and scaled to the
# model's input size.
FACE_WIDTH = 384
CROP_PAD = 1.15
EYE_L = [33, 133]  # corners of the image-left eye
EYE_R = [362, 263]  # corners of the image-right eye


def hull(points: np.ndarray) -> np.ndarray:
    """Convex hull (monotone chain), same as analyze.ts."""
    p = sorted(map(tuple, points.tolist()))
    if len(p) < 3:
        return np.array(p, dtype=np.float64)

    def cross(o, a, b):
        return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])

    lower: list = []
    for q in p:
        while len(lower) >= 2 and cross(lower[-2], lower[-1], q) <= 0:
            lower.pop()
        lower.append(q)
    upper: list = []
    for q in reversed(p):
        while len(upper) >= 2 and cross(upper[-2], upper[-1], q) <= 0:
            upper.pop()
        upper.append(q)
    return np.array(lower[:-1] + upper[:-1], dtype=np.float64)


def zone_polygon(lm: np.ndarray, zone: str, zone_points=ZONE_POINTS, shrink=SHRINK) -> np.ndarray:
    h = hull(lm[zone_points[zone]])
    c = h.mean(axis=0)
    return c + (h - c) * shrink[zone]


def align_matrix(lm: np.ndarray, face_width: float = FACE_WIDTH) -> np.ndarray:
    """2x3 similarity transform from image pixels to the aligned face frame.

    In the aligned frame the eyes are level, the face is `face_width` wide and the midpoint between the eyes sits at
    (0, 0). Only the rotation, scale and that midpoint matter; crops are taken relative to it.
    """
    el = lm[EYE_L].mean(axis=0)
    er = lm[EYE_R].mean(axis=0)
    angle = math.atan2(er[1] - el[1], er[0] - el[0])
    width = float(np.hypot(*(lm[454] - lm[234]))) or 1.0
    s = face_width / width
    c, si = math.cos(-angle) * s, math.sin(-angle) * s
    mid = (el + er) / 2
    # p' = s R(-angle) (p - mid)
    return np.array([[c, -si, -(c * mid[0] - si * mid[1])], [si, c, -(si * mid[0] + c * mid[1])]], dtype=np.float64)


def apply(m: np.ndarray, pts: np.ndarray) -> np.ndarray:
    return pts @ m[:, :2].T + m[:, 2]


@dataclass
class Crop:
    zone: str
    square: tuple[float, float, float]  # x0, y0, side in the aligned frame
    matrix: np.ndarray  # 2x3, image pixels -> crop pixels


def zone_crops(lm: np.ndarray, size: int, zones=ZONES, zone_points=ZONE_POINTS, shrink=SHRINK,
               face_width: float = FACE_WIDTH, pad: float = CROP_PAD) -> list[Crop]:
    """Per zone, the transform that cuts its square out of the original photo and scales it to size x size."""
    a = align_matrix(lm, face_width)
    al = apply(a, lm)
    out = []
    for zone in zones:
        poly = zone_polygon(al, zone, zone_points, shrink)
        x0, y0 = poly.min(axis=0)
        x1, y1 = poly.max(axis=0)
        side = max(x1 - x0, y1 - y0) * pad
        cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
        sx, sy = cx - side / 2, cy - side / 2
        k = size / side
        # crop = k * (aligned - (sx, sy)) = k * A p - k * (sx, sy)
        m = np.vstack([a, [0, 0, 1]])
        t = np.array([[k, 0, -k * sx], [0, k, -k * sy], [0, 0, 1]], dtype=np.float64)
        out.append(Crop(zone, (sx, sy, side), (t @ m)[:2]))
    return out


def cut(image_rgb: np.ndarray, crop: Crop, size: int) -> np.ndarray:
    """Cuts one zone. When the zone is much larger than the output, the photo is first shrunk with area averaging, as
    a browser does when it draws a large image small, so both sides see a similar amount of detail."""
    import cv2

    m = crop.matrix.copy()
    scale = float(np.sqrt(abs(np.linalg.det(m[:, :2]))))
    src = image_rgb
    if scale < 0.5:
        f = min(1.0, 2.0 * scale)
        src = cv2.resize(image_rgb, None, fx=f, fy=f, interpolation=cv2.INTER_AREA)
        m = m @ np.array([[1 / f, 0, 0], [0, 1 / f, 0], [0, 0, 1]], dtype=np.float64)
    # Outside the photo stays black, as on a canvas (transparent pixels read back as 0).
    return cv2.warpAffine(src, m, (size, size), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_CONSTANT, borderValue=(0, 0, 0))


def zone_visible(lm: np.ndarray, zone: str) -> float:
    """How much of a zone faces the camera, from its area relative to the face (side views hide the far cheek)."""
    a = align_matrix(lm)
    al = apply(a, lm)
    poly = zone_polygon(al, zone)
    x, y = poly[:, 0], poly[:, 1]
    area = 0.5 * abs(np.dot(x, np.roll(y, 1)) - np.dot(y, np.roll(x, 1)))
    return float(area) / (FACE_WIDTH ** 2)


# --- Face landmarks --------------------------------------------------------------------------------------------------
class FaceFinder:
    """MediaPipe Face Landmarker (Apache-2.0) in image mode, one face."""

    def __init__(self, model_path: Path = FACE_MODEL):
        if not Path(model_path).exists():
            import urllib.request

            Path(model_path).parent.mkdir(parents=True, exist_ok=True)
            urllib.request.urlretrieve(FACE_MODEL_URL, model_path)
        import mediapipe as mp
        from mediapipe.tasks.python import BaseOptions, vision

        self._mp = mp
        opts = vision.FaceLandmarkerOptions(
            base_options=BaseOptions(model_asset_path=str(model_path)),
            running_mode=vision.RunningMode.IMAGE,
            num_faces=1,
        )
        self._lm = vision.FaceLandmarker.create_from_options(opts)

    def landmarks(self, image_rgb: np.ndarray, max_side: int = 1280) -> np.ndarray | None:
        """478 landmarks in pixels of `image_rgb`, or None. Detection runs on a copy of at most `max_side` pixels, as in
        the app, and the points are scaled back."""
        import cv2

        h, w = image_rgb.shape[:2]
        f = min(1.0, max_side / max(h, w))
        small = cv2.resize(image_rgb, (round(w * f), round(h * f)), interpolation=cv2.INTER_AREA) if f < 1 else image_rgb
        img = self._mp.Image(image_format=self._mp.ImageFormat.SRGB, data=np.ascontiguousarray(small))
        res = self._lm.detect(img)
        if not res.face_landmarks:
            return None
        pts = res.face_landmarks[0]
        if len(pts) < 468:
            return None
        return np.array([[p.x * w, p.y * h] for p in pts], dtype=np.float64)


def load_rgb(path: Path) -> np.ndarray:
    """Reads a photo the way a browser shows it (EXIF orientation applied), as RGB, without its metadata."""
    from PIL import Image, ImageOps

    with Image.open(path) as im:
        im = ImageOps.exif_transpose(im)
        return np.asarray(im.convert("RGB"))
