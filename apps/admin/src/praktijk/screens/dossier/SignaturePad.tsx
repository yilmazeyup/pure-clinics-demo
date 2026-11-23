import { useEffect, useRef, useState, type PointerEvent } from 'react';

import { useI18n } from '../../../i18n';
import { PkIcon } from '../../icons';
import { capture } from './util';

/**
 * A signature drawn with mouse, finger or pen: pointer events on a canvas at the screen's pixel density, with smooth
 * strokes. `onSign` gets a PNG of the signature.
 */
export function SignaturePad({ onSign }: { onSign: (png: string) => void }) {
  const { t } = useI18n();
  const canvas = useRef<HTMLCanvasElement>(null);
  const last = useRef<{ x: number; y: number } | null>(null);
  const [empty, setEmpty] = useState(true);

  // Matches the drawing surface to the element's size and the screen's density.
  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    const fit = () => {
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      const { width, height } = el.getBoundingClientRect();
      const w = Math.max(1, Math.round(width * ratio));
      const h = Math.max(1, Math.round(height * ratio));
      // Resizing a canvas wipes it, so only when the size really changed.
      if (el.width === w && el.height === h) return;
      el.width = w;
      el.height = h;
      const ctx = el.getContext('2d');
      if (!ctx) return;
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = '#3F3128';
      ctx.lineWidth = 2.2;
      setEmpty(true);
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const point = (e: PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const down = (e: PointerEvent<HTMLCanvasElement>) => {
    capture(e);
    last.current = point(e);
    const ctx = e.currentTarget.getContext('2d');
    if (ctx) {
      ctx.beginPath();
      ctx.arc(last.current.x, last.current.y, 1.1, 0, Math.PI * 2);
      ctx.fillStyle = '#3F3128';
      ctx.fill();
    }
    setEmpty(false);
  };

  const move = (e: PointerEvent<HTMLCanvasElement>) => {
    if (!last.current) return;
    const ctx = e.currentTarget.getContext('2d');
    if (!ctx) return;
    const p = point(e);
    const mid = { x: (last.current.x + p.x) / 2, y: (last.current.y + p.y) / 2 };
    ctx.beginPath();
    ctx.moveTo(last.current.x, last.current.y);
    ctx.quadraticCurveTo(last.current.x, last.current.y, mid.x, mid.y);
    ctx.lineTo(p.x, p.y);
    // Faster strokes get a little thinner, like ink.
    const speed = Math.hypot(p.x - last.current.x, p.y - last.current.y);
    ctx.lineWidth = Math.max(1.4, 2.8 - speed * 0.06);
    ctx.stroke();
    last.current = p;
  };

  const up = () => {
    last.current = null;
  };

  const clear = () => {
    const el = canvas.current;
    const ctx = el?.getContext('2d');
    if (!el || !ctx) return;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, el.width, el.height);
    ctx.restore();
    setEmpty(true);
  };

  return (
    <div className="pk-ds-sign">
      <div className="pk-ds-sign-pad">
        <canvas
          ref={canvas}
          aria-label={t('pk.dossier.ic.pad')}
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onPointerCancel={up}
        />
        {empty ? <span className="pk-ds-sign-hint">{t('pk.dossier.ic.sign')}</span> : null}
        <i className="pk-ds-sign-line" aria-hidden="true" />
      </div>
      <div className="pk-row">
        <button className="btn btn-ghost btn-small" onClick={clear} disabled={empty}>
          <PkIcon name="undo" size={14} />
          {t('pk.dossier.ic.clear')}
        </button>
        <button
          className="btn btn-primary btn-small"
          disabled={empty}
          title={empty ? t('pk.dossier.ic.empty') : undefined}
          onClick={() => canvas.current && onSign(canvas.current.toDataURL('image/png'))}
        >
          <PkIcon name="pen" size={14} />
          {t('pk.dossier.ic.confirm')}
        </button>
      </div>
    </div>
  );
}
