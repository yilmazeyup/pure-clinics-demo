import { Platform } from 'react-native';

/**
 * Makes the web build installable ("Zet op beginscherm"): links the manifest and the home screen icons that sit in
 * public/. The app can live in a sub-folder (/app/ on pureclinics.savastana.com), so the links are made from the
 * folder the app's own script was loaded from, which is right on every page, also on deep links.
 */
export function addHomeScreenLinks() {
  if (Platform.OS !== 'web' || typeof document === 'undefined') return;
  if (document.querySelector('link[rel="manifest"]')) return;
  const script = Array.from(document.scripts).find((s) => /\/_expo\/static\/js\//.test(s.src));
  const base = script ? script.src.replace(/_expo\/static\/js\/.*$/, '') : `${location.origin}/`;
  const add = (tag: 'link' | 'meta', attrs: Record<string, string>) => {
    const el = document.createElement(tag);
    Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));
    document.head.appendChild(el);
  };
  add('link', { rel: 'manifest', href: `${base}manifest.json` });
  add('link', { rel: 'apple-touch-icon', href: `${base}apple-touch-icon.png` });
  add('meta', { name: 'apple-mobile-web-app-capable', content: 'yes' });
  add('meta', { name: 'mobile-web-app-capable', content: 'yes' });
  add('meta', { name: 'apple-mobile-web-app-title', content: 'Pure Clinics' });
  add('meta', { name: 'apple-mobile-web-app-status-bar-style', content: 'default' });
}
