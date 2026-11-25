import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

import { useI18n } from '../i18n';
import { Icon } from './Icon';
import './drawer.css';

/**
 * A panel that slides in from the side (from the left in Arabic), over a soft backdrop: the help of a page and a person's
 * own settings open in it. Escape or a click beside it closes it; the focus goes in and comes back.
 */
export function Drawer({ open, onClose, label, children }: { open: boolean; onClose: () => void; label: string; children: ReactNode }) {
  const { t } = useI18n();
  const close = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const before = document.activeElement as HTMLElement | null;
    const root = document.documentElement;
    const overflow = root.style.overflow;
    root.style.overflow = 'hidden';
    close.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      root.style.overflow = overflow;
      window.removeEventListener('keydown', onKey);
      before?.focus({ preventScroll: true });
    };
  }, [open]);
  // Drawn at the root of the panel, so nothing on the page (the live feed, the 3D views) can come on top of it, while it
  // keeps the panel's colours.
  const host = typeof document !== 'undefined' ? (document.querySelector('.app') ?? document.body) : null;
  if (!host) return null;
  return createPortal(
    <div className={`drawer ${open ? 'is-open' : ''}`} inert={!open}>
      <div className="drawer-backdrop" aria-hidden="true" onClick={onClose} />
      <aside className="drawer-panel" role="dialog" aria-modal="true" aria-label={label}>
        <button ref={close} className="drawer-close" aria-label={t('hlp.close')} onClick={onClose}>
          <Icon name="close" size={18} />
        </button>
        {open ? children : null}
      </aside>
    </div>,
    host,
  );
}
