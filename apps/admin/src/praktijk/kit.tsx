import type { Locale } from '@pure-clinics/shared';
import { useEffect, useMemo, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

import { CardHead } from '../components/ui';
import { Accent, useI18n } from '../i18n';
import { portrait, type Staff } from './data/core';
import { PkIcon, type PkIconName } from './icons';

// Small building blocks shared by every screen of Pure Praktijk, in the panel's own look: cards, chips, tables,
// segmented controls, switches, fields and a dialog. Styles live in praktijk.css under the pk- prefix.

/** A card with the panel's eyebrow and serif title; `feature` marks it for the feature overview's jump links. */
export function Card({
  eyebrow,
  title,
  help,
  actions,
  feature,
  className = '',
  children,
}: {
  eyebrow: string;
  title: string;
  help?: ReactNode;
  actions?: ReactNode;
  feature?: string;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <section className={`card pk-card ${className}`} data-feature={feature}>
      <CardHead eyebrow={eyebrow} title={<Accent text={title} />}>
        {actions ? <div className="head-actions">{actions}</div> : null}
      </CardHead>
      {help ? <p className="help">{help}</p> : null}
      {children}
    </section>
  );
}

export type Option<T extends string> = { value: T; label: string; icon?: PkIconName };

/** A row of buttons of which one is chosen: views, tabs, periods. */
export function Seg<T extends string>({
  value,
  options,
  onChange,
  label,
  variant = 'seg',
}: {
  value: T;
  options: Option<T>[];
  onChange: (value: T) => void;
  label: string;
  variant?: 'seg' | 'tabs';
}) {
  return (
    <div className={variant === 'tabs' ? 'pk-tabs' : 'pk-seg'} role="tablist" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} role="tab" aria-selected={o.value === value} onClick={() => onChange(o.value)}>
          {o.icon ? <PkIcon name={o.icon} size={15} /> : null}
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** An on/off switch with its label. */
export function Toggle({ checked, onChange, label, hint }: { checked: boolean; onChange: (on: boolean) => void; label: ReactNode; hint?: ReactNode }) {
  return (
    <label className="pk-toggle">
      <span className="pk-toggle-text">
        <span>{label}</span>
        {hint ? <small>{hint}</small> : null}
      </span>
      <button type="button" role="switch" aria-checked={checked} className="pk-switch" onClick={() => onChange(!checked)}>
        <i />
      </button>
    </label>
  );
}

/** A checkbox with its label. */
export function Check({ checked, onChange, label }: { checked: boolean; onChange: (on: boolean) => void; label: ReactNode }) {
  return (
    <label className="pk-check">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

export type Tone = 'neutral' | 'good' | 'bad' | 'warn' | 'brand' | 'now' | 'outline';

export function Chip({ tone = 'neutral', icon, children, title }: { tone?: Tone; icon?: PkIconName; children: ReactNode; title?: string }) {
  return (
    <span className={`pk-chip pk-chip--${tone}`} title={title}>
      {icon ? <PkIcon name={icon} size={13} stroke={1.9} /> : null}
      {children}
    </span>
  );
}

/** A labelled form field; put an input.pk-input, select.pk-input or textarea.pk-input inside. */
export function Field({ label, hint, children, wide }: { label: string; hint?: ReactNode; children: ReactNode; wide?: boolean }) {
  return (
    <label className={`pk-field ${wide ? 'pk-field--wide' : ''}`}>
      <span className="pk-field-label">{label}</span>
      {children}
      {hint ? <small className="pk-field-hint">{hint}</small> : null}
    </label>
  );
}

/** Tables scroll sideways inside their card on a phone; the page itself never does. */
export function TableWrap({ children, label }: { children: ReactNode; label?: string }) {
  return (
    <div className="pk-table-wrap" role="region" aria-label={label} tabIndex={0}>
      {children}
    </div>
  );
}

export function Stat({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: ReactNode; tone?: 'good' | 'bad' }) {
  return (
    <div className={`pk-stat ${tone ? `pk-stat--${tone}` : ''}`}>
      <span className="eyebrow">{label}</span>
      <strong>{value}</strong>
      {sub ? <small>{sub}</small> : null}
    </div>
  );
}

/** A horizontal bar, e.g. occupancy or a share of revenue. */
export function Bar({ value, max = 1, tone }: { value: number; max?: number; tone?: 'good' | 'bad' | 'brand' | 'now' }) {
  const pct = Math.max(0, Math.min(1, max ? value / max : 0));
  return (
    <span className={`pk-bar ${tone ? `pk-bar--${tone}` : ''}`} aria-hidden="true">
      <i style={{ width: `${pct * 100}%` }} />
    </span>
  );
}

/** The steps of a wizard; finished ones get a tick. */
export function Steps({ steps, current, onStep }: { steps: string[]; current: number; onStep?: (index: number) => void }) {
  return (
    <ol className="pk-steps">
      {steps.map((s, i) => (
        <li key={s} className={i < current ? 'done' : i === current ? 'now' : ''}>
          <button type="button" onClick={() => onStep?.(i)} disabled={!onStep}>
            <span className="pk-step-n">{i < current ? <PkIcon name="check" size={13} stroke={2.2} /> : i + 1}</span>
            {s}
          </button>
        </li>
      ))}
    </ol>
  );
}

/** A dialog over the panel; Escape or the backdrop closes it. Rendered into .app so the panel's colours apply. */
export function Modal({
  open,
  title,
  onClose,
  children,
  footer,
  wide,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  const { t } = useI18n();
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const before = document.activeElement as HTMLElement | null;
    box.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      before?.focus?.();
    };
  }, [open]);
  const host = document.querySelector('.app');
  if (!open || !host) return null;
  return createPortal(
    <div className="pk-modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={box} className={`pk-modal ${wide ? 'pk-modal--wide' : ''}`} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1}>
        <div className="pk-modal-head">
          <h2 className="card-title">{title}</h2>
          <button className="icon-button small" onClick={onClose} aria-label={t('pk.common.close')}>
            <PkIcon name="close" size={18} />
          </button>
        </div>
        <div className="pk-modal-body">{children}</div>
        {footer ? <div className="pk-modal-foot">{footer}</div> : null}
      </div>
    </div>,
    host,
  );
}

/** Key-value lines, e.g. the details of an invoice or a client. */
export function Kv({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <dl className="pk-kv">
      {rows.map(([k, v]) => (
        <div key={k}>
          <dt>{k}</dt>
          <dd>{v}</dd>
        </div>
      ))}
    </dl>
  );
}

/** A team member's portrait, or her initial when there is no photo (Loubna). */
export function Avatar({ staff, size = 32 }: { staff: Staff; size?: number }) {
  return staff.photo ? (
    <img className="pk-avatar" src={portrait(staff.id)} alt="" width={size} height={size} style={{ width: size, height: size }} />
  ) : (
    <span className="pk-avatar pk-avatar--initial" style={{ width: size, height: size, fontSize: size * 0.45 }} aria-hidden="true">
      {staff.name[0]}
    </span>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="pk-empty">{children}</p>;
}

const INTL: Record<Locale, string> = { nl: 'nl-NL', en: 'en-GB', ar: 'ar-u-nu-latn', fr: 'fr-FR', de: 'de-DE', it: 'it-IT', es: 'es-ES' };

/** Money with cents (€ 64,50), for invoices and claims; the panel's own eur() rounds to whole euros. */
export function useMoney() {
  const { locale } = useI18n();
  return useMemo(() => {
    const f = new Intl.NumberFormat(INTL[locale], { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return (amount: number) => f.format(amount);
  }, [locale]);
}

/** Numbers with decimals in the reader's own way: 1,5 or 1.5. */
export function useDecimal() {
  const { locale } = useI18n();
  return useMemo(() => {
    const f = new Intl.NumberFormat(INTL[locale], { maximumFractionDigits: 1 });
    return (n: number) => f.format(n);
  }, [locale]);
}

/** Saves rows as a CSV that Excel opens directly (semicolons, UTF-8 with BOM). */
export function downloadCsv(filename: string, rows: (string | number)[][]) {
  const cell = (v: string | number) => {
    const text = String(v);
    return /[";\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  const csv = '﻿' + rows.map((r) => r.map(cell).join(';')).join('\r\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Copies text to the clipboard; resolves false when the browser does not allow it. */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const area = document.createElement('textarea');
    area.value = text;
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand('copy');
    area.remove();
    return ok;
  }
}

/** Keeps a Latin name or code in one piece inside Arabic text. */
export const isolate = (text: string) => `⁨${text}⁩`;
