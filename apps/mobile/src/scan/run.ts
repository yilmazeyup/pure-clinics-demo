import { analyzeSkin, zonePolygons, type Outcome, type Pt, type ZoneId } from './analyze';
import { withZoneModel } from './model';

// Finding the face, in the browser: MediaPipe's Face Landmarker (Google), loaded from jsDelivr at a fixed version, with
// Google's own model file. Both are downloaded the first time someone opens the scan, then cached by the browser.
// Everything runs on the device; the photo itself is never uploaded.

const VERSION = '0.10.35';
const CDN = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${VERSION}`;
const MODEL = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';

/** A photo ready to scan: the pixels on a canvas, and a data URL to show it (both stay in memory on the device). */
export type ScanPhoto = { canvas: HTMLCanvasElement; uri: string; width: number; height: number };

export type ScanFound = {
  kind: 'found';
  /** Landmarks as fractions of the photo's width and height. */
  landmarks: Pt[];
  /** Zone outlines, as fractions of the photo. */
  zones: Record<ZoneId, Pt[]>;
  /** Lines of the face's contours (oval, brows, eyes, lips), as pairs of landmark numbers. */
  contours: [number, number][];
  outcome: Outcome;
};
export type ScanResult = ScanFound | { kind: 'no-face' } | { kind: 'unavailable' };

type Landmarker = {
  detect: (image: HTMLCanvasElement) => { faceLandmarks: { x: number; y: number }[][] };
};
type Vision = {
  FilesetResolver: { forVisionTasks: (path: string) => Promise<unknown> };
  FaceLandmarker: {
    createFromOptions: (files: unknown, options: unknown) => Promise<Landmarker>;
    FACE_LANDMARKS_CONTOURS: { start: number; end: number }[];
  };
};

// MediaPipe writes its start-up notes ("INFO: Created TensorFlow Lite XNNPACK delegate…") to the console as errors.
// They are not errors, so they are kept out of the console while it loads and runs.
const CHATTER = /^(INFO:|[IWE]\d{4} |Graph successfully|.*gl_context|.*inference_feedback|.*face_landmarker_graph)/;
async function quietly<T>(work: () => Promise<T> | T): Promise<T> {
  const c = console as unknown as Record<'error' | 'warn' | 'log' | 'info', (...args: unknown[]) => void>;
  const original = { error: c.error, warn: c.warn, log: c.log, info: c.info };
  for (const k of ['error', 'warn', 'log', 'info'] as const) {
    c[k] = (...args: unknown[]) => {
      if (typeof args[0] === 'string' && CHATTER.test(args[0])) return;
      original[k].apply(console, args);
    };
  }
  try {
    return await work();
  } finally {
    Object.assign(c, original);
  }
}

let loading: Promise<{ landmarker: Landmarker; contours: [number, number][] }> | null = null;

/** Loads the face finder once; a failure (offline, blocked) can be retried later. */
export function loadFaceFinder() {
  if (!loading) {
    // A plain dynamic import of a web address, kept away from the app's bundler.
    const importUrl = new Function('url', 'return import(url)') as (url: string) => Promise<Vision>;
    const timeout = new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), 30000));
    loading = Promise.race([
      quietly(async () => {
        const vision = await importUrl(`${CDN}/vision_bundle.mjs`);
        const files = await vision.FilesetResolver.forVisionTasks(`${CDN}/wasm`);
        const landmarker = await vision.FaceLandmarker.createFromOptions(files, {
          baseOptions: { modelAssetPath: MODEL, delegate: 'CPU' },
          runningMode: 'IMAGE',
          numFaces: 1,
        });
        const contours = vision.FaceLandmarker.FACE_LANDMARKS_CONTOURS.map((c) => [c.start, c.end] as [number, number]);
        return { landmarker, contours };
      }),
      timeout,
    ]);
    loading.catch(() => {
      loading = null;
    });
  }
  return loading;
}

/** Draws an image or a video frame onto a canvas of at most `max` pixels on its long side. */
export function toCanvas(source: CanvasImageSource, width: number, height: number, { mirror = false, max = 1280 } = {}): HTMLCanvasElement {
  const scale = Math.min(1, max / Math.max(width, height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  const g = canvas.getContext('2d');
  if (!g) return canvas;
  if (mirror) {
    g.translate(canvas.width, 0);
    g.scale(-1, 1);
  }
  g.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas;
}

export function photoFrom(canvas: HTMLCanvasElement): ScanPhoto {
  return { canvas, uri: canvas.toDataURL('image/jpeg', 0.9), width: canvas.width, height: canvas.height };
}

/** Finds the face and measures it. */
export async function scanPhoto(photo: ScanPhoto): Promise<ScanResult> {
  let finder: Awaited<ReturnType<typeof loadFaceFinder>>;
  try {
    finder = await loadFaceFinder();
  } catch {
    return { kind: 'unavailable' };
  }
  let points: { x: number; y: number }[] | undefined;
  try {
    points = (await quietly(() => finder.landmarker.detect(photo.canvas))).faceLandmarks?.[0];
  } catch {
    return { kind: 'unavailable' };
  }
  if (!points || points.length < 468) return { kind: 'no-face' };
  const landmarks = points.map((p) => ({ x: p.x, y: p.y }));

  // Measure at one scale: crop around the face and scale it to about 300 pixels wide.
  const xs = landmarks.map((p) => p.x * photo.width);
  const ys = landmarks.map((p) => p.y * photo.height);
  const minX = Math.max(0, Math.min(...xs) - 8);
  const minY = Math.max(0, Math.min(...ys) - 8);
  const maxX = Math.min(photo.width, Math.max(...xs) + 8);
  const maxY = Math.min(photo.height, Math.max(...ys) + 8);
  const faceWidth = maxX - minX;
  if (faceWidth < 60) return { kind: 'no-face' };
  const scale = 300 / faceWidth;
  const work = document.createElement('canvas');
  work.width = Math.max(1, Math.round((maxX - minX) * scale));
  work.height = Math.max(1, Math.round((maxY - minY) * scale));
  const g = work.getContext('2d', { willReadFrequently: true });
  if (!g) return { kind: 'unavailable' };
  g.drawImage(photo.canvas, minX, minY, maxX - minX, maxY - minY, 0, 0, work.width, work.height);
  const pixels = g.getImageData(0, 0, work.width, work.height);
  const local = landmarks.map((p) => ({ x: (p.x * photo.width - minX) * scale, y: (p.y * photo.height - minY) * scale }));
  const measured = analyzeSkin(pixels, local);
  // With a trained model in public/models/, its zone readings are blended in; without one the measures stay as they are.
  const inPhoto = landmarks.map((p) => ({ x: p.x * photo.width, y: p.y * photo.height }));
  const outcome = await withZoneModel(measured, photo.canvas, inPhoto);

  return { kind: 'found', landmarks, zones: zonePolygons(landmarks), contours: finder.contours, outcome };
}
