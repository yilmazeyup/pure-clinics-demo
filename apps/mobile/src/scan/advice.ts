import { CONCERNS, type ConcernId, type TreatmentId } from '@pure-clinics/shared';

import type { Outcome } from './analyze';

// Which of Pure's treatments to suggest, from the concerns someone chose and what the selfie scan saw. Every treatment
// belongs to at least one concern (packages/shared CONCERNS), so each of them can come up; when nothing points
// anywhere, the advice is the general one: a facial. The free intake always comes first on the screen, and the skin
// therapist decides there; this only orders the list.

export type Skin = 'calm' | 'sensitive' | 'reactive';
/** What the scan can point at, and the concern it leads to. */
export type ScanSignal = 'redness' | 'tone' | 'blemish' | 'acne' | 'texture' | 'lines' | 'eyes';
export type Finding = { signal: ScanSignal; concern: ConcernId; strength: number };
export type Reason = { concern: ConcernId; fromPhoto: boolean; signal?: ScanSignal };
export type Pick = { id: TreatmentId; score: number; reasons: Reason[] };
export type AdviceResult = { main: Pick[]; also: Pick[]; general: boolean };

/** Treatments that can irritate skin that reddens easily; the skin therapist decides at the intake. */
export const NOT_FOR_REACTIVE: TreatmentId[] = ['tca', 'skinpen', 'tixel'];
/** The general advice when nothing else fits: a facial suits every skin. */
export const GENERAL: TreatmentId = 'facial';

/** From a reading (0-1) upwards the scan counts a signal as seen. The colour measures' thresholds are the ones the
 * app has always used; the face model's own signals count from about grade 1.5 of 3. */
export const SEEN: Record<ScanSignal, number> = {
  redness: 0.6,
  tone: 0.35,
  blemish: 0.45,
  acne: 0.5,
  texture: 0.5,
  lines: 0.5,
  eyes: 0.5,
};
const LEADS_TO: Record<ScanSignal, ConcernId> = {
  redness: 'redness',
  tone: 'pigment',
  blemish: 'acne',
  acne: 'acne',
  texture: 'scars',
  lines: 'aging',
  eyes: 'eyes',
};

/** What the photo suggests looking at, strongest first; one finding per concern (the colour measure and the model
 * may both see blemishes). */
export function findingsFromScan(outcome: Outcome): Finding[] {
  const values: Partial<Record<ScanSignal, number>> = {
    redness: outcome.overall.redness,
    tone: outcome.overall.tone,
    blemish: outcome.overall.blemish,
    ...(outcome.face ?? {}),
  };
  const out: Finding[] = [];
  for (const signal of Object.keys(LEADS_TO) as ScanSignal[]) {
    const v = values[signal];
    if (typeof v !== 'number' || !Number.isFinite(v) || v < SEEN[signal]) continue;
    // How far past the threshold, 0 (just seen) to 1 (as clear as it gets).
    out.push({ signal, concern: LEADS_TO[signal], strength: Math.min(1, (v - SEEN[signal]) / (1 - SEEN[signal])) });
  }
  out.sort((a, b) => b.strength - a.strength);
  return out.filter((f, i) => out.findIndex((g) => g.concern === f.concern) === i);
}

/**
 * Scores every treatment. A concern someone chose counts 3, a scan finding 1-2 by how clear it is; within a concern,
 * the treatments the clinic lists first count up to 1 more. A treatment takes its best concern's points, plus a little
 * for every other concern it also fits and 1 more when the photo agrees with what was chosen. Treatments that can
 * irritate reactive skin are left out for "quickly red or irritated" and count a little less for "sensitive".
 * The first three: for every chosen concern, then every finding, the treatment that fits that concern best (so each
 * wish gets its own answer, and a specific treatment beats one that is merely good for several things); then the
 * highest scores. The rest that fit are "also suitable".
 */
export function recommend(concerns: ConcernId[], findings: Finding[], skin: Skin | null): AdviceResult {
  type Scored = Pick & { by: Map<ConcernId, number> };
  const picks = new Map<TreatmentId, Scored>();
  const add = (id: TreatmentId, points: number, reason: Reason) => {
    if (id === 'consult') return;
    const p = picks.get(id) ?? { id, score: 0, reasons: [], by: new Map<ConcernId, number>() };
    p.by.set(reason.concern, Math.max(p.by.get(reason.concern) ?? 0, points));
    if (!p.reasons.some((r) => r.concern === reason.concern && r.fromPhoto === reason.fromPhoto)) p.reasons.push(reason);
    picks.set(id, p);
  };
  const listOf = (c: ConcernId) => CONCERNS.find((x) => x.id === c)?.treatments ?? [];
  for (const c of concerns) {
    const list = listOf(c);
    list.forEach((id, i) => add(id, 3 + (1 - i / list.length), { concern: c, fromPhoto: false }));
  }
  for (const f of findings) {
    const list = listOf(f.concern);
    list.forEach((id, i) => add(id, 1 + f.strength + (1 - i / list.length), { concern: f.concern, fromPhoto: true, signal: f.signal }));
  }
  const ranked: Scored[] = [];
  for (const p of picks.values()) {
    if (skin === 'reactive' && NOT_FOR_REACTIVE.includes(p.id)) continue;
    const points = [...p.by.values()].sort((a, b) => b - a);
    p.score = points[0] + 0.3 * (points.length - 1);
    if (skin === 'sensitive' && NOT_FOR_REACTIVE.includes(p.id)) p.score -= 0.75;
    if (p.reasons.some((r) => r.fromPhoto) && p.reasons.some((r) => !r.fromPhoto)) p.score += 1;
    // The reason shown first: what the person chose, then the clearest finding.
    p.reasons.sort((a, b) => Number(a.fromPhoto) - Number(b.fromPhoto));
    ranked.push(p);
  }
  const order = CONCERNS.flatMap((c) => c.treatments);
  ranked.sort((a, b) => b.score - a.score || order.indexOf(a.id) - order.indexOf(b.id));
  const main: Scored[] = [];
  const wishes = [...concerns, ...findings.map((f) => f.concern).filter((c) => !concerns.includes(c))];
  for (const c of wishes) {
    if (main.length >= 3) break;
    const best = ranked
      .filter((p) => !main.includes(p) && p.by.has(c))
      .sort((a, b) => (b.by.get(c) ?? 0) - (a.by.get(c) ?? 0) || b.score - a.score)[0];
    if (best) main.push(best);
  }
  for (const p of ranked) if (main.length < 3 && !main.includes(p)) main.push(p);
  main.sort((a, b) => b.score - a.score);
  const also = ranked.filter((p) => !main.includes(p)).slice(0, 6);
  const plain = ({ id, score, reasons }: Scored): Pick => ({ id, score, reasons });
  if (!main.length) return { main: [{ id: GENERAL, score: 0, reasons: [] }], also: [], general: true };
  return { main: main.map(plain), also: also.map(plain), general: false };
}
