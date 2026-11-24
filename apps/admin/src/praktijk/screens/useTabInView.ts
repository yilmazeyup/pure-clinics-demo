import { useEffect } from 'react';

/** On a phone a screen's tab row scrolls sideways; keep the chosen tab in view there, without moving the page. */
export function useTabInView(value: string) {
  useEffect(() => {
    for (const bar of document.querySelectorAll<HTMLElement>('.pk-screen:not([hidden]) .pk-tabs')) {
      if (bar.scrollWidth <= bar.clientWidth + 1) continue;
      const tab = bar.querySelector<HTMLElement>('[aria-selected="true"]');
      if (!tab) continue;
      const b = bar.getBoundingClientRect();
      const r = tab.getBoundingClientRect();
      if (r.left >= b.left - 1 && r.right <= b.right + 1) continue;
      bar.scrollBy({ left: r.left - b.left - (b.width - r.width) / 2, behavior: 'smooth' });
    }
  }, [value]);
}
