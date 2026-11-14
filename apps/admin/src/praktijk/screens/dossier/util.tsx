import { useEffect, useState, type InputHTMLAttributes } from 'react';

import { STAFF } from '../../data/core';

const pad = (n: number) => String(n).padStart(2, '0');

/** A date as the value of <input type="date">. */
export const toInput = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** The value of <input type="date"> as a date at noon, so time zones never move it a day. */
export const fromInput = (value: string): Date | null => (/^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T12:00`) : null);

/** The team member behind a three-letter code in the log, or the code itself. */
export const staffName = (code: string) => STAFF.find((s) => s.code === code)?.name ?? code;

type CommitProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> & { value: string; onCommit: (value: string) => void };

/** An input that saves when you leave it or press Enter, so the change log gets one line instead of one per key. */
export function CommitInput({ value, onCommit, ...rest }: CommitProps) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const commit = () => {
    if (draft !== value) onCommit(draft);
  };
  return (
    <input
      {...rest}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
      }}
    />
  );
}

/** Keeps the pointer on the element while dragging; synthetic events (tests, screenshots) have no pointer to capture. */
export function capture(e: { currentTarget: Element; pointerId: number }) {
  try {
    e.currentTarget.setPointerCapture(e.pointerId);
  } catch {
    // Nothing to capture; the drag still works while the pointer stays on the element.
  }
}
