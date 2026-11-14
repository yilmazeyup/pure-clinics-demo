import { useMemo, type ReactElement } from 'react';

import { between, rng } from '../../../data/random';
import type { ConditionId } from '../../data/core';

// Placeholder "photos" for the demo: a drawn close-up of skin, never a real person. The marks follow the condition
// (spots for acne, little vessels for couperose, patches for pigment, hairs for unwanted hair, ink for a tattoo) and
// fade from before to after.

const TONES = ['#EBCDB6', '#E2BC9F', '#D4A988', '#C39373', '#A9785A'];
const STAGE = { before: 1, progress: 0.55, after: 0.18 } as const;

type Props = { seed: string; condition: ConditionId; stage: keyof typeof STAGE; className?: string };

export function SkinPhoto({ seed, condition, stage, className }: Props) {
  // The same skin for the same client and area; only the marks change with the stage.
  const base = seed.replace(/-[a-z]$/, '');
  const id = useMemo(() => `sk-${Math.abs(hash(seed + stage))}`, [seed, stage]);
  const shapes = useMemo(() => draw(base, condition, STAGE[stage], id), [base, condition, stage, id]);
  return (
    <svg className={className} viewBox="0 0 400 300" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs>
        <radialGradient id={`${id}-light`} cx="38%" cy="32%" r="80%">
          <stop offset="0" stopColor="#FFFFFF" stopOpacity="0.35" />
          <stop offset="0.6" stopColor="#FFFFFF" stopOpacity="0" />
          <stop offset="1" stopColor="#3A2A20" stopOpacity="0.18" />
        </radialGradient>
        <radialGradient id={`${id}-spot`}>
          <stop offset="0" stopColor="#C25B4E" stopOpacity="0.95" />
          <stop offset="0.55" stopColor="#D47C68" stopOpacity="0.55" />
          <stop offset="1" stopColor="#D47C68" stopOpacity="0" />
        </radialGradient>
        <radialGradient id={`${id}-patch`}>
          <stop offset="0" stopColor="#7A5238" stopOpacity="0.6" />
          <stop offset="1" stopColor="#7A5238" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="400" height="300" fill={shapes.tone} />
      {shapes.pores.map((p, i) => (
        <circle key={`p${i}`} cx={p[0]} cy={p[1]} r={p[2]} fill="#6E4A36" opacity={0.09} />
      ))}
      {shapes.marks}
      <rect width="400" height="300" fill={`url(#${id}-light)`} />
    </svg>
  );
}

function draw(key: string, cond: ConditionId, k: number, id: string) {
  const r = rng(`skin-${key}`);
  const tone = TONES[between(r, 0, TONES.length - 1)];
  const pores = Array.from({ length: 160 }, () => [between(r, 0, 400), between(r, 0, 300), 0.6 + r() * 1.1] as [number, number, number]);
  const m = rng(`marks-${key}-${cond}`);
  const count = (n: number) => Math.round(n * k);
  const marks: ReactElement[] = [];
  if (cond === 'acne' || cond === 'scars' || cond === 'camouflage' || cond === 'beauty') {
    const n = cond === 'acne' ? 26 : 16;
    for (let i = 0; i < n; i++) {
      const x = between(m, 20, 380);
      const y = between(m, 20, 280);
      const s = 6 + m() * 12;
      if (i >= count(n)) continue;
      marks.push(
        cond === 'scars' ? (
          <circle key={`m${i}`} cx={x} cy={y} r={s * 0.6} fill="none" stroke="#6E4A36" strokeOpacity={0.25} strokeWidth={2.5} />
        ) : (
          <circle key={`m${i}`} cx={x} cy={y} r={s} fill={`url(#${id}-spot)`} />
        ),
      );
    }
  } else if (cond === 'couperose') {
    for (let i = 0; i < count(18); i++) {
      const x = between(m, 30, 370);
      const y = between(m, 30, 270);
      const d = `M${x} ${y} q${between(m, -20, 20)} ${between(m, -14, 14)} ${between(m, 10, 40)} ${between(m, -10, 10)} t${between(m, 10, 30)} ${between(m, -8, 8)}`;
      marks.push(<path key={`m${i}`} d={d} fill="none" stroke="#B4473F" strokeOpacity={0.55} strokeWidth={1.4} strokeLinecap="round" />);
    }
  } else if (cond === 'pigment' || cond === 'aging') {
    for (let i = 0; i < count(cond === 'pigment' ? 12 : 6); i++) {
      marks.push(<ellipse key={`m${i}`} cx={between(m, 30, 370)} cy={between(m, 30, 270)} rx={14 + m() * 26} ry={10 + m() * 18} fill={`url(#${id}-patch)`} />);
    }
    if (cond === 'aging') {
      for (let i = 0; i < count(9); i++) {
        const y = between(m, 40, 260);
        marks.push(<path key={`l${i}`} d={`M${between(m, 20, 120)} ${y} q90 ${between(m, -12, 12)} ${between(m, 120, 240)} ${between(m, -6, 6)}`} fill="none" stroke="#6E4A36" strokeOpacity={0.22} strokeWidth={1.2} />);
      }
    }
  } else if (cond === 'hirsutism' || cond === 'hairloss') {
    for (let i = 0; i < count(cond === 'hairloss' ? 40 : 70); i++) {
      const x = between(m, 10, 390);
      const y = between(m, 10, 290);
      const a = m() * Math.PI;
      const l = 6 + m() * 10;
      marks.push(<line key={`m${i}`} x1={x} y1={y} x2={x + Math.cos(a) * l} y2={y + Math.sin(a) * l} stroke="#2B2420" strokeOpacity={0.7} strokeWidth={1.1} strokeLinecap="round" />);
    }
  } else if (cond === 'tattoo') {
    marks.push(
      <g key="ink" fill="none" stroke="#2F3C4E" strokeOpacity={0.15 + 0.6 * k} strokeWidth={6} strokeLinecap="round">
        <path d="M110 200 C150 110 250 110 290 200" />
        <path d="M150 210 C180 160 220 160 250 210" />
        <circle cx="200" cy="120" r="18" />
      </g>,
    );
  }
  return { tone, pores, marks };
}

function hash(text: string) {
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) | 0;
  return h;
}
