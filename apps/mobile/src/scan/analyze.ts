// The skin scan's measurements, on the device: plain arithmetic on the photo's pixels inside four zones of the face
// (forehead, cheeks, nose, chin) that the face landmarks mark out. No model judges the skin; these are simple, honest
// signals that a camera can see, and the app presents them as an indication, never as a diagnosis:
//   redness   how much of a zone is redder than the rest of your own face (a* in CIELAB);
//   tone      how uneven the lightness is once the fall of the light is taken out: spots, freckles, patches (L*);
//   blemish   small red bumps against their surroundings (local a* contrast);
//   shine     bright, light-coloured highlights, as an oily or sweaty skin reflects the light.
// Light, camera and make-up all change these numbers, which is why the screen says so.

export type Pt = { x: number; y: number };
export type ZoneId = 'forehead' | 'cheekL' | 'cheekR' | 'nose' | 'chin';
export type Signals = { redness: number; tone: number; shine: number; blemish: number };
export type ZoneResult = Signals & { pixels: number };
export type Outcome = {
  zones: Record<ZoneId, ZoneResult>;
  /** Per signal, for the face as a whole (0 = not seen, 1 = clearly visible). */
  overall: Signals;
  /** Median lightness of the skin (L*, 0–100): below about 35 the photo is too dark to say much. */
  light: number;
  /** Only when a trained model sits in public/models/ (see scan/model.ts): its own reading per zone and concern, 0–1;
   * `also`: the files of the second models averaged in. */
  model?: { version: string; zones: Record<string, Record<string, number>>; also?: string[] };
};

export const ZONES: ZoneId[] = ['forehead', 'cheekL', 'cheekR', 'nose', 'chin'];

/**
 * Landmarks (MediaPipe Face Landmarker, 478 points) around each zone. A zone is the convex hull of its points, pulled
 * in a little towards its middle so brows, hairline, nostrils and lips stay outside.
 */
export const ZONE_POINTS: Record<ZoneId, number[]> = {
  forehead: [67, 109, 10, 338, 297, 299, 296, 336, 9, 107, 66, 69],
  cheekL: [118, 101, 36, 205, 206, 216, 192, 213, 147, 123, 117],
  cheekR: [347, 330, 266, 425, 426, 436, 416, 433, 376, 352, 346],
  nose: [168, 122, 196, 3, 51, 45, 4, 275, 281, 248, 419, 351],
  chin: [18, 313, 421, 428, 396, 175, 171, 208, 201, 83],
};
const SHRINK: Record<ZoneId, number> = { forehead: 0.86, cheekL: 0.86, cheekR: 0.86, nose: 0.8, chin: 0.84 };

/** Convex hull (monotone chain), counter-clockwise. */
export function hull(points: Pt[]): Pt[] {
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

export const centroid = (poly: Pt[]): Pt => ({
  x: poly.reduce((s, q) => s + q.x, 0) / Math.max(1, poly.length),
  y: poly.reduce((s, q) => s + q.y, 0) / Math.max(1, poly.length),
});

/** The zones as polygons, in the same units as the landmarks. */
export function zonePolygons(lm: Pt[]): Record<ZoneId, Pt[]> {
  const out = {} as Record<ZoneId, Pt[]>;
  for (const zone of ZONES) {
    const h = hull(ZONE_POINTS[zone].map((i) => lm[i]).filter(Boolean));
    const c = centroid(h);
    const f = SHRINK[zone];
    out[zone] = h.map((q) => ({ x: c.x + (q.x - c.x) * f, y: c.y + (q.y - c.y) * f }));
  }
  return out;
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

// sRGB to linear light, once for all 256 values.
const LINEAR = new Float32Array(256);
for (let i = 0; i < 256; i++) {
  const c = i / 255;
  LINEAR[i] = c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}
const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);

/** Fills a polygon into `mask` with `value`, scanline by scanline. */
function fill(mask: Uint8Array, width: number, height: number, poly: Pt[], value: number) {
  if (poly.length < 3) return;
  const top = Math.max(0, Math.floor(Math.min(...poly.map((q) => q.y))));
  const bottom = Math.min(height - 1, Math.ceil(Math.max(...poly.map((q) => q.y))));
  for (let y = top; y <= bottom; y++) {
    const yc = y + 0.5;
    const xs: number[] = [];
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i];
      const b = poly[(i + 1) % poly.length];
      if ((a.y <= yc && b.y > yc) || (b.y <= yc && a.y > yc)) xs.push(a.x + ((yc - a.y) / (b.y - a.y)) * (b.x - a.x));
    }
    xs.sort((m, n) => m - n);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const x0 = Math.max(0, Math.ceil(xs[k] - 0.5));
      const x1 = Math.min(width - 1, Math.floor(xs[k + 1] - 0.5));
      for (let x = x0; x <= x1; x++) mask[y * width + x] = value;
    }
  }
}

/** A box blur that only averages pixels where `weight` is set, via summed-area tables. */
function maskedMean(values: Float32Array, weight: Uint8Array, width: number, height: number, radius: number): Float32Array {
  const W = width + 1;
  const sv = new Float64Array(W * (height + 1));
  const sw = new Float64Array(W * (height + 1));
  for (let y = 0; y < height; y++) {
    let rv = 0;
    let rw = 0;
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const w = weight[i] ? 1 : 0;
      rv += values[i] * w;
      rw += w;
      sv[(y + 1) * W + x + 1] = sv[y * W + x + 1] + rv;
      sw[(y + 1) * W + x + 1] = sw[y * W + x + 1] + rw;
    }
  }
  const out = new Float32Array(width * height);
  for (let y = 0; y < height; y++) {
    const y0 = Math.max(0, y - radius);
    const y1 = Math.min(height, y + radius + 1);
    for (let x = 0; x < width; x++) {
      const x0 = Math.max(0, x - radius);
      const x1 = Math.min(width, x + radius + 1);
      const n = sw[y1 * W + x1] - sw[y0 * W + x1] - sw[y1 * W + x0] + sw[y0 * W + x0];
      const s = sv[y1 * W + x1] - sv[y0 * W + x1] - sv[y1 * W + x0] + sv[y0 * W + x0];
      out[y * width + x] = n > 0 ? s / n : values[y * width + x];
    }
  }
  return out;
}

/**
 * Measures the four zones of one face. `image` is RGBA pixels (a canvas' ImageData) and `lm` the landmarks in the
 * same pixel units. The face should be about 300 pixels wide; the caller crops and scales to that, so photos from
 * different cameras are measured at the same scale.
 */
export function analyzeSkin(image: { data: Uint8ClampedArray; width: number; height: number }, lm: Pt[]): Outcome {
  const { data, width, height } = image;
  const n = width * height;
  const L = new Float32Array(n);
  const A = new Float32Array(n);
  const clipped = new Uint8Array(n);
  for (let i = 0, j = 0; i < n; i++, j += 4) {
    const r = data[j];
    const g = data[j + 1];
    const b = data[j + 2];
    const R = LINEAR[r];
    const G = LINEAR[g];
    const B = LINEAR[b];
    const X = (0.4124 * R + 0.3576 * G + 0.1805 * B) / 0.95047;
    const Y = 0.2126 * R + 0.7152 * G + 0.0722 * B;
    const fy = f(Y);
    L[i] = 116 * fy - 16;
    A[i] = 500 * (f(X) - fy);
    if (r > 250 || g > 250 || b > 250) clipped[i] = 1;
  }

  const polys = zonePolygons(lm);
  const zoneOf = new Uint8Array(n);
  ZONES.forEach((zone, k) => fill(zoneOf, width, height, polys[zone], k + 1));

  // Skin pixels to measure: inside a zone, not too dark (a stray hair or a nostril), not burnt out by the flash.
  const skin = new Uint8Array(n);
  const lights: number[] = [];
  const reds: number[] = [];
  for (let i = 0; i < n; i++) {
    if (zoneOf[i] && L[i] > 18 && !clipped[i]) {
      skin[i] = 1;
      if (i % 3 === 0) {
        lights.push(L[i]);
        reds.push(A[i]);
      }
    }
  }
  const median = (list: number[]) => {
    if (!list.length) return 0;
    const sorted = [...list].sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)];
  };
  const light = median(lights);
  const faceRed = median(reds);

  const faceWidth = Math.hypot((lm[454]?.x ?? 0) - (lm[234]?.x ?? 0), (lm[454]?.y ?? 0) - (lm[234]?.y ?? 0)) || width * 0.8;
  const radius = Math.max(3, Math.round(faceWidth * 0.03));
  const localL = maskedMean(L, skin, width, height, radius);
  const localA = maskedMean(A, skin, width, height, radius);

  // Per zone: counts for the shares, and sums for a flat plane through L* (x, y), so a gentle fall of light across
  // the cheek is not mistaken for an uneven tone; what is left around that plane is the zone's own unevenness.
  type Acc = {
    all: number; skin: number; red: number; bump: number; shine: number; sumA: number;
    n: number; sx: number; sy: number; sv: number; sxx: number; syy: number; sxy: number; sxv: number; syv: number;
  };
  const acc: Acc[] = ZONES.map(() => ({ all: 0, skin: 0, red: 0, bump: 0, shine: 0, sumA: 0, n: 0, sx: 0, sy: 0, sv: 0, sxx: 0, syy: 0, sxy: 0, sxv: 0, syv: 0 }));
  const toneOk = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const z = zoneOf[i];
    if (!z) continue;
    const a = acc[z - 1];
    a.all++;
    const dL = L[i] - localL[i];
    // Shine: a burnt-out highlight, or a patch clearly lighter than its surroundings.
    const shiny = clipped[i] === 1 || (dL > 7 && L[i] > 60);
    if (shiny) a.shine++;
    if (!skin[i]) continue;
    a.skin++;
    a.sumA += A[i];
    const dA = A[i] - localA[i];
    if (A[i] > faceRed + 5) a.red++;
    if (dA > 3 && dL < 2) a.bump++;
    // Tone is read from plain skin: no highlights, no hairs.
    if (shiny || dL < -25) continue;
    toneOk[i] = 1;
    const x = (i % width) / width;
    const y = Math.floor(i / width) / width;
    const v = L[i];
    a.n++;
    a.sx += x;
    a.sy += y;
    a.sv += v;
    a.sxx += x * x;
    a.syy += y * y;
    a.sxy += x * y;
    a.sxv += x * v;
    a.syv += y * v;
  }
  // Solve the plane per zone (3×3 normal equations), then the spread around it.
  const planes = acc.map((a) => {
    const det3 = (m: number[][]) =>
      m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
    const M = [
      [a.n, a.sx, a.sy],
      [a.sx, a.sxx, a.sxy],
      [a.sy, a.sxy, a.syy],
    ];
    const R = [a.sv, a.sxv, a.syv];
    const D = det3(M);
    if (a.n < 30 || Math.abs(D) < 1e-9) return [a.n ? a.sv / a.n : 0, 0, 0];
    const col = (j: number) => M.map((row, r) => row.map((c, k) => (k === j ? R[r] : c)));
    return [det3(col(0)) / D, det3(col(1)) / D, det3(col(2)) / D];
  });
  const spread = ZONES.map(() => ({ ss: 0, n: 0 }));
  for (let i = 0; i < n; i++) {
    if (!toneOk[i]) continue;
    const k = zoneOf[i] - 1;
    const [c0, c1, c2] = planes[k];
    const r = L[i] - (c0 + c1 * ((i % width) / width) + c2 * (Math.floor(i / width) / width));
    spread[k].ss += r * r;
    spread[k].n++;
  }

  const zones = {} as Record<ZoneId, ZoneResult>;
  ZONES.forEach((zone, k) => {
    const a = acc[k];
    const share = (v: number) => (a.skin ? v / a.skin : 0);
    const meanA = a.skin ? a.sumA / a.skin : 0;
    // Darker skin shows the same spot with less difference in L*, so the spread is read relative to the skin's light.
    const sdL = (spread[k].n ? Math.sqrt(spread[k].ss / spread[k].n) : 0) * (65 / Math.max(30, light));
    const shine = clamp01(((a.all ? a.shine / a.all : 0) - 0.015) / 0.09);
    // The forehead catches the light most and the chin sits in the jaw's shadow; there the edge of a highlight or a
    // shadow would read as unevenness, so those zones need a clearer spread before it counts.
    const tone =
      zone === 'forehead'
        ? clamp01((sdL - 5) / 4) * (shine > 0.5 ? 0.5 : 1)
        : zone === 'chin'
          ? clamp01((sdL - 3.6) / 3)
          : clamp01((sdL - 2.4) / 2.2);
    zones[zone] = {
      pixels: a.skin,
      redness: clamp01(0.65 * clamp01((share(a.red) - 0.06) / 0.34) + 0.35 * clamp01((meanA - 16) / 10)),
      tone,
      blemish: clamp01((share(a.bump) - 0.015) / 0.07),
      shine,
    };
  });

  return { zones, overall: overallOf(zones), light };
}

/** The face as a whole, from its zones. */
export function overallOf(zones: Record<ZoneId, Signals>): Signals {
  const avg = (...v: number[]) => v.reduce((s, x) => s + x, 0) / v.length;
  const cheeks = (k: keyof Signals) => avg(zones.cheekL[k], zones.cheekR[k]);
  return {
    // Redness shows on cheeks and nose; the forehead and chin are the face's own reference.
    redness: Math.max(cheeks('redness'), zones.nose.redness * 0.65),
    tone: 0.8 * cheeks('tone') + 0.2 * zones.forehead.tone,
    // A chin that is redder than the rest of the face usually goes with spots there.
    blemish: Math.max(zones.chin.blemish, zones.forehead.blemish, cheeks('blemish'), 0.5 * zones.chin.redness),
    shine: Math.max(zones.forehead.shine, zones.nose.shine),
  };
}

/** "nauwelijks", "een beetje", "goed zichtbaar". */
export const levelOf = (v: number): 'low' | 'some' | 'clear' => (v < 0.3 ? 'low' : v < 0.65 ? 'some' : 'clear');
