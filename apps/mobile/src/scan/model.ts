import { overallOf, type Outcome, type Pt, type Signals, type ZoneId, ZONES } from './analyze';

// Pure's own skin-scan model, when there is one. If public/models/ holds huidscan.json (labels, input size, version,
// how to cut the zones) and the .onnx file it names, the model is loaded with onnxruntime-web (WASM, from jsDelivr at
// a fixed version), runs on the same face zones on the device, and its reading per zone is blended into the colour
// measures. Without those files nothing changes: the scan shows the colour measures exactly as before.
// Training, export and the files' format: ml/huidscan/README.md. The photo never leaves the device.

const ORT_VERSION = '1.31.1';
const ORT_CDN = `https://cdn.jsdelivr.net/npm/onnxruntime-web@${ORT_VERSION}/dist/`;

/** huidscan.json, as written by ml/huidscan/train/export_onnx.py. */
export type ModelInfo = {
  format: number;
  version: string;
  /** The model file next to huidscan.json: fp32 or int8, the app does not care which. */
  file: string;
  pilot?: boolean;
  input: { name: string; size: number };
  heads: { name: string; classes: number }[];
  zones: string[];
  zonePoints: Record<string, number[]>;
  shrink: Record<string, number>;
  crop: { faceWidth: number; pad: number; eyeL: number[]; eyeR: number[]; widthPoints: [number, number] };
  applies?: Record<string, string[]>;
  /** How much the model counts against the colour measures, 0–1: one number for every head, or per head (a head
   * left out counts 0). */
  blend?: number | Record<string, number>;
};

type OrtTensor = { data: Float32Array | ArrayLike<number>; dims: readonly number[] };
type Session = { run: (feeds: Record<string, OrtTensor>) => Promise<Record<string, OrtTensor>> };
type Ort = {
  env: { wasm: { wasmPaths?: string; numThreads?: number } };
  Tensor: new (type: 'float32', data: Float32Array, dims: number[]) => OrtTensor;
  InferenceSession: { create: (url: string, options?: unknown) => Promise<Session> };
};

export type ZoneModel = { info: ModelInfo; session: Session; ort: Ort };
/** Per zone, per head: 0 (not seen) to 1 (clearly visible). */
export type ZoneReadings = Record<string, Record<string, number>>;

/** Where public/ is served: the folder the app's own script came from (as in pwa.ts), else the site's root. */
export function appBase(): string {
  if (typeof document === 'undefined') return '/';
  const script = Array.from(document.scripts).find((s) => /\/_expo\/static\/js\//.test(s.src));
  return script ? script.src.replace(/_expo\/static\/js\/.*$/, '') : `${location.origin}/`;
}

/** Checks huidscan.json; anything else (a missing file served as the app's own page, say) means "no model". */
function readInfo(raw: unknown): ModelInfo | null {
  const info = raw as Partial<ModelInfo> | null;
  if (!info || typeof info !== 'object') return null;
  if (typeof info.file !== 'string' || !/^[\w.-]+\.onnx$/.test(info.file)) return null;
  if (!info.input || !(info.input.size > 0) || typeof info.input.name !== 'string') return null;
  if (!Array.isArray(info.heads) || !info.heads.length || !Array.isArray(info.zones) || !info.zones.length) return null;
  if (!info.zonePoints || !info.shrink || !info.crop) return null;
  return info as ModelInfo;
}

let loading: Promise<ZoneModel | null> | null = null;

/** Loads the model once; resolves to null when there is none or it cannot run here. `base` is for tests. */
export function loadZoneModel(base?: string): Promise<ZoneModel | null> {
  if (base !== undefined) return open(base);
  if (!loading) loading = open(appBase());
  return loading;
}

async function open(base: string): Promise<ZoneModel | null> {
  if (typeof document === 'undefined' || typeof fetch === 'undefined') return null;
  const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), 30000));
  const work = (async () => {
    try {
      const res = await fetch(`${base}models/huidscan.json`, { cache: 'no-cache' });
      if (!res.ok) return null;
      const info = readInfo(await res.json().catch(() => null));
      if (!info) return null;
      // A plain dynamic import of a web address, kept away from the app's bundler (as in run.ts).
      const importUrl = new Function('url', 'return import(url)') as (url: string) => Promise<Ort>;
      const ort = await importUrl(`${ORT_CDN}ort.wasm.min.mjs`);
      ort.env.wasm.wasmPaths = ORT_CDN;
      ort.env.wasm.numThreads = 1;
      const session = await ort.InferenceSession.create(`${base}models/${info.file}`, { executionProviders: ['wasm'] });
      return { info, session, ort };
    } catch {
      return null;
    }
  })();
  return Promise.race([work, timeout]);
}

// --- Cutting the zones: the same steps as ml/huidscan/train/common.py --------------------------------------------

/** A 2D affine map in canvas order: x' = a·x + c·y + e, y' = b·x + d·y + f. */
type Affine = [number, number, number, number, number, number];
const map = (m: Affine, p: Pt): Pt => ({ x: m[0] * p.x + m[2] * p.y + m[4], y: m[1] * p.x + m[3] * p.y + m[5] });

/** Levels the eyes, scales the face to `faceWidth` and puts the point between the eyes at (0, 0). */
function alignment(lm: Pt[], crop: ModelInfo['crop']): Affine {
  const mean = (ids: number[]) => ({
    x: ids.reduce((s, i) => s + lm[i].x, 0) / ids.length,
    y: ids.reduce((s, i) => s + lm[i].y, 0) / ids.length,
  });
  const el = mean(crop.eyeL);
  const er = mean(crop.eyeR);
  const angle = Math.atan2(er.y - el.y, er.x - el.x);
  const [w0, w1] = crop.widthPoints;
  const width = Math.hypot(lm[w1].x - lm[w0].x, lm[w1].y - lm[w0].y) || 1;
  const s = crop.faceWidth / width;
  const c = Math.cos(-angle) * s;
  const si = Math.sin(-angle) * s;
  const mx = (el.x + er.x) / 2;
  const my = (el.y + er.y) / 2;
  return [c, si, -si, c, -(c * mx - si * my), -(si * mx + c * my)];
}

/** Convex hull (monotone chain), as in analyze.ts and common.py. */
function hullOf(points: Pt[]): Pt[] {
  const p = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  if (p.length < 3) return p;
  const cross = (o: Pt, a: Pt, b: Pt) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower: Pt[] = [];
  for (const q of p) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 0) lower.pop();
    lower.push(q);
  }
  const upper: Pt[] = [];
  for (let i = p.length - 1; i >= 0; i--) {
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p[i]) <= 0) upper.pop();
    upper.push(p[i]);
  }
  return lower.slice(0, -1).concat(upper.slice(0, -1));
}

/** For each zone, the map from photo pixels to its size×size crop. */
export function zoneMaps(lm: Pt[], info: ModelInfo): { zone: string; m: Affine }[] {
  const a = alignment(lm, info.crop);
  const aligned = lm.map((p) => map(a, p));
  const size = info.input.size;
  return info.zones.map((zone) => {
    const h = hullOf((info.zonePoints[zone] ?? []).map((i) => aligned[i]).filter(Boolean));
    const cx = h.reduce((s, q) => s + q.x, 0) / Math.max(1, h.length);
    const cy = h.reduce((s, q) => s + q.y, 0) / Math.max(1, h.length);
    const f = info.shrink[zone] ?? 1;
    const poly = h.map((q) => ({ x: cx + (q.x - cx) * f, y: cy + (q.y - cy) * f }));
    const xs = poly.map((q) => q.x);
    const ys = poly.map((q) => q.y);
    const x0 = Math.min(...xs);
    const x1 = Math.max(...xs);
    const y0 = Math.min(...ys);
    const y1 = Math.max(...ys);
    const side = Math.max(x1 - x0, y1 - y0) * info.crop.pad || 1;
    const sx = (x0 + x1) / 2 - side / 2;
    const sy = (y0 + y1) / 2 - side / 2;
    const k = size / side;
    return { zone, m: [k * a[0], k * a[1], k * a[2], k * a[3], k * a[4] - k * sx, k * a[5] - k * sy] as Affine };
  });
}

/**
 * Cuts the zones out of the photo as one batch of pixels (n × 3 × size × size, RGB 0–1). As in common.cut(): when a
 * zone is shrunk to less than half, the photo is first drawn smaller with the browser's best smoothing, then mapped.
 */
export function cutZones(source: HTMLCanvasElement, lm: Pt[], info: ModelInfo): { zones: string[]; pixels: Float32Array } {
  const size = info.input.size;
  const maps = zoneMaps(lm, info);
  const pixels = new Float32Array(maps.length * 3 * size * size);
  const out = document.createElement('canvas');
  out.width = size;
  out.height = size;
  const g = out.getContext('2d', { willReadFrequently: true });
  if (!g) throw new Error('no 2d context');
  maps.forEach(({ m }, n) => {
    const scale = Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2]));
    let src: HTMLCanvasElement = source;
    let mm = m;
    if (scale < 0.5) {
      const f = Math.min(1, 2 * scale);
      const small = document.createElement('canvas');
      small.width = Math.max(1, Math.round(source.width * f));
      small.height = Math.max(1, Math.round(source.height * f));
      const sg = small.getContext('2d');
      if (sg) {
        sg.imageSmoothingEnabled = true;
        sg.imageSmoothingQuality = 'high';
        sg.drawImage(source, 0, 0, small.width, small.height);
        const fx = small.width / source.width;
        const fy = small.height / source.height;
        src = small;
        mm = [m[0] / fx, m[1] / fx, m[2] / fy, m[3] / fy, m[4], m[5]];
      }
    }
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, size, size);
    g.imageSmoothingEnabled = true;
    g.imageSmoothingQuality = 'low';
    g.setTransform(mm[0], mm[1], mm[2], mm[3], mm[4], mm[5]);
    g.drawImage(src, 0, 0);
    const data = g.getImageData(0, 0, size, size).data;
    const plane = size * size;
    const base = n * 3 * plane;
    for (let i = 0; i < plane; i++) {
      pixels[base + i] = data[i * 4] / 255;
      pixels[base + plane + i] = data[i * 4 + 1] / 255;
      pixels[base + 2 * plane + i] = data[i * 4 + 2] / 255;
    }
  });
  return { zones: maps.map((x) => x.zone), pixels };
}

/** Runs the model on the zones of one face. `lm` are the landmarks in pixels of `source`. */
export async function readZones(model: ZoneModel, source: HTMLCanvasElement, lm: Pt[]): Promise<ZoneReadings> {
  const { info, session, ort } = model;
  const size = info.input.size;
  const { zones, pixels } = cutZones(source, lm, info);
  const out = await session.run({ [info.input.name]: new ort.Tensor('float32', pixels, [zones.length, 3, size, size]) });
  const readings: ZoneReadings = {};
  zones.forEach((zone, n) => {
    readings[zone] = {};
    for (const head of info.heads) {
      const t = out[head.name];
      if (!t) continue;
      const k = head.classes;
      const p = Array.from({ length: k }, (_, j) => Number(t.data[n * k + j]));
      // Two classes: the chance it is visible. More: the expected grade, 0–3 scaled to 0–1.
      readings[zone][head.name] = k === 2 ? p[1] : p.reduce((s, v, j) => s + v * j, 0) / (k - 1);
    }
  });
  return readings;
}

// Which head feeds which of the scan's signals. Shine is never the model's (oily/dry is not modelled); blemishes will
// come from the box detector later. Fine lines and the eye zone are kept in outcome.model until the screen shows them.
const SIGNAL_OF: Record<string, keyof Signals> = { redness: 'redness', pigmentation: 'tone' };

/** Mixes the model's zone readings into the colour measures and works out the whole face again. */
export function blendOutcome(outcome: Outcome, readings: ZoneReadings, info: ModelInfo): Outcome {
  const weight = (head: string) => {
    const b = info.blend;
    const v = typeof b === 'object' && b ? (b[head] ?? 0) : (b ?? 0.5);
    return Math.min(1, Math.max(0, Number(v) || 0));
  };
  const zones = { ...outcome.zones };
  for (const zone of ZONES as ZoneId[]) {
    const r = readings[zone];
    if (!r) continue;
    const z = { ...zones[zone] };
    for (const [head, signal] of Object.entries(SIGNAL_OF)) {
      const applies = !info.applies?.[head] || info.applies[head].includes(zone);
      const w = weight(head);
      if (w > 0 && applies && typeof r[head] === 'number' && Number.isFinite(r[head])) z[signal] = (1 - w) * z[signal] + w * r[head];
    }
    zones[zone] = z;
  }
  return { ...outcome, zones, overall: overallOf(zones), model: { version: info.version, zones: readings } };
}

/** The scan's hook: with a model, the blended outcome; without one (or on any error), the outcome as it was. */
export async function withZoneModel(outcome: Outcome, source: HTMLCanvasElement, lm: Pt[]): Promise<Outcome> {
  try {
    const model = await loadZoneModel();
    if (!model) return outcome;
    return blendOutcome(outcome, await readZones(model, source, lm), model.info);
  } catch {
    return outcome;
  }
}
