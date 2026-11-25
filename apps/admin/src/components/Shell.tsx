import { LOCALE_NAMES, LOCALES, type Locale } from '@pure-clinics/shared';
import { Fragment, useEffect, useRef, useState } from 'react';

import { Accent, useI18n, useSetLocale, type MessageKey } from '../i18n';
import { CP_TABS, type CpTab } from '../campagnes/nav';
import { SCREENS, type ScreenId } from '../praktijk/nav';
import { Icon, type IconName } from './Icon';
import { useToast } from './ui';

/** The help page with the explainer video and common questions, on the demo site. */
const HELP_URL = 'https://pureclinics.savastana.com/hulp/';

/**
 * Agenda, Trajecten and Webshop jump to their part of the overview; Praktijk opens the practice module (its own
 * subscription); Campagnes opens the Mailchimp module; Hulp opens the help page; the rest follow later.
 */
const NAV: { icon: IconName; label: MessageKey; section?: string; help?: boolean; praktijk?: boolean; campagnes?: boolean }[] = [
  { icon: 'grid', label: 'nav.overview' },
  { icon: 'calendar', label: 'nav.agenda', section: 'agenda' },
  { icon: 'repeat', label: 'nav.courses', section: 'trajecten' },
  { icon: 'bag', label: 'nav.webshop', section: 'webshop' },
  { icon: 'clipboard', label: 'pk.nav.label', praktijk: true },
  { icon: 'users', label: 'nav.clients' },
  { icon: 'mail', label: 'nav.campaigns', campagnes: true },
  { icon: 'sliders', label: 'nav.settings' },
  { icon: 'help', label: 'nav.help', help: true },
];

type View = 'overview' | 'praktijk' | 'campagnes';

type SidebarProps = {
  view: View;
  onView: (view: View) => void;
  /** The Praktijk screen that is open (null outside Praktijk); its screens sit under Praktijk in the menu. */
  screen: ScreenId | null;
  onScreen: (screen: ScreenId) => void;
  /** The part of Campagnes that is open (null outside Campagnes); its parts sit under Campagnes in the same way. */
  tab: CpTab | null;
  onTab: (tab: CpTab) => void;
};

type SubItem = { id: string; label: string; current: boolean; onPick: () => void };

/** The parts of a module, folded open under its name in the menu while the module is open. */
function SubMenu({ open, label, items }: { open: boolean; label: string; items: SubItem[] }) {
  return (
    <div className={`nav-sub ${open ? 'is-open' : ''}`} inert={!open}>
      <div className="nav-sub-list" role="group" aria-label={label}>
        {items.map((item) => (
          <button key={item.id} aria-current={open && item.current ? 'page' : undefined} onClick={item.onPick}>
            {item.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * The menu. On a wide screen it stands on the left (on the right in Arabic), and the screens of Praktijk and the parts of
 * Campagnes fold open under their name while that module is open. On a phone and a tablet it is one Menu button that
 * slides the same menu in from the side.
 */
export function Sidebar({ view, onView, screen, onScreen, tab, onTab }: SidebarProps) {
  const { t, locale } = useI18n();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const aside = useRef<HTMLElement>(null);
  const menuButton = useRef<HTMLButtonElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);

  // The sliding menu on a phone: the page underneath stays put, Escape closes it, and the focus goes in and comes back.
  useEffect(() => {
    if (!open) return;
    const root = document.documentElement;
    const overflow = root.style.overflow;
    root.style.overflow = 'hidden';
    closeButton.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    const wide = window.matchMedia('(min-width: 901px)');
    const onWide = () => wide.matches && setOpen(false);
    window.addEventListener('keydown', onKey);
    wide.addEventListener('change', onWide);
    return () => {
      root.style.overflow = overflow;
      window.removeEventListener('keydown', onKey);
      wide.removeEventListener('change', onWide);
      menuButton.current?.focus({ preventScroll: true });
    };
  }, [open]);

  // Keep the chosen screen or part in sight when the menu is taller than the window, without moving the page.
  // It measures once the list has finished folding open.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const box = aside.current;
      const item = box?.querySelector<HTMLElement>('.nav-sub.is-open [aria-current="page"]');
      if (!box || !item || box.scrollHeight <= box.clientHeight) return;
      const b = box.getBoundingClientRect();
      const r = item.getBoundingClientRect();
      if (r.top < b.top + 12) box.scrollTop -= b.top + 12 - r.top;
      else if (r.bottom > b.bottom - 12) box.scrollTop += r.bottom - (b.bottom - 12);
    }, 360);
    return () => window.clearTimeout(timer);
  }, [screen, tab]);

  const pick = (go: () => void) => {
    setOpen(false);
    go();
  };
  const go = (index: number) => {
    setOpen(false);
    const item = NAV[index];
    if (item.praktijk) onView('praktijk');
    else if (item.campagnes) onView('campagnes');
    else if (index === 0 && view !== 'overview') onView('overview');
    else if (index === 0) window.scrollTo({ top: 0, behavior: 'smooth' });
    else if (item.help) window.open(`${HELP_URL}?lang=${locale}`, '_blank', 'noopener');
    else if (item.section) {
      const scroll = () => document.getElementById(item.section!)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      if (view === 'overview') scroll();
      else {
        onView('overview');
        window.setTimeout(scroll, 120);
      }
    } else toast(t('nav.soon', { label: t(item.label) }));
  };
  // Inside a module the screen or part under it is the current page; the module itself is then the open group above it.
  const groupOf = (index: number): View | null => (NAV[index].praktijk ? 'praktijk' : NAV[index].campagnes ? 'campagnes' : null);
  const wordmark = (
    <div className="logo" role="img" aria-label="Pure Clinics">
      <span className="wordmark" aria-hidden="true">
        <b>PURE</b>CLINICS
      </span>
    </div>
  );
  return (
    <aside ref={aside} className={`sidebar ${open ? 'is-open' : ''}`}>
      <div className="sidebar-top">
        {wordmark}
        <button ref={menuButton} className="menu-button" aria-expanded={open} aria-controls="side-menu" onClick={() => setOpen(true)}>
          <Icon name="menu" size={19} />
          {t('nav.menu')}
        </button>
      </div>

      <div className="side-backdrop" aria-hidden="true" onClick={() => setOpen(false)} />

      <div id="side-menu" className="side-menu">
        <div className="side-menu-head">
          {wordmark}
          <button ref={closeButton} className="menu-close" aria-label={t('nav.menuClose')} onClick={() => setOpen(false)}>
            <Icon name="close" size={19} />
          </button>
        </div>

        <nav className="nav" aria-label={t('nav.label')}>
          {NAV.map((item, index) => (
            <Fragment key={item.label}>
              <button
                className={groupOf(index) === view ? 'is-open' : undefined}
                aria-current={view === 'overview' && index === 0 ? 'page' : undefined}
                aria-expanded={groupOf(index) ? groupOf(index) === view : undefined}
                onClick={() => go(index)}
              >
                <Icon name={item.icon} />
                {t(item.label)}
                {item.praktijk ? <span className="pk-nav-chip">{t('pk.nav.chip')}</span> : null}
              </button>
              {item.praktijk ? (
                <SubMenu
                  open={view === 'praktijk'}
                  label={t('pk.subnav.label')}
                  items={SCREENS.map((s) => ({ id: s.id, label: t(`pk.screen.${s.id}`), current: s.id === screen, onPick: () => pick(() => onScreen(s.id)) }))}
                />
              ) : null}
              {item.campagnes ? (
                <SubMenu
                  open={view === 'campagnes'}
                  label={t('cp.tabs')}
                  items={CP_TABS.map((c) => ({ id: c.id, label: t(`cp.tab.${c.id}`), current: c.id === tab, onPick: () => pick(() => onTab(c.id)) }))}
                />
              ) : null}
            </Fragment>
          ))}
        </nav>

        <div className="test-box">
          <strong>{t('test.title')}</strong>
          {t('test.body')}
        </div>
      </div>
    </aside>
  );
}

type TopbarProps = {
  now: Date;
  playing: boolean;
  progress: number;
  onPlay: () => void;
  onStop: () => void;
  onTour: () => void;
  /** Inside a module (Pure Praktijk): a smaller greeting and fewer buttons on a phone, so the module's own content starts high. */
  compact?: boolean;
};

export function Topbar({ now, playing, progress, onPlay, onStop, onTour, compact = false }: TopbarProps) {
  const i18n = useI18n();
  const { t, clock, locale } = i18n;
  const setLocale = useSetLocale();
  const toast = useToast();
  return (
    <header className={`topbar rise ${compact ? 'topbar--compact' : ''}`}>
      <div>
        <h1 className="greeting">
          <Accent text={i18n.greeting(now)} />
        </h1>
        <p className="subline">
          {i18n.dayLong(now)} · {t('top.subline')}
        </p>
      </div>
      <div className="top-actions">
        <span className="demo-chip">{t('top.demo')}</span>
        <label className="lang-select">
          <Icon name="globe" size={17} />
          <select value={locale} aria-label={t('lang.label')} onChange={(event) => setLocale(event.target.value as Locale)}>
            {LOCALES.map((code) => (
              <option key={code} value={code}>
                {LOCALE_NAMES[code]}
              </option>
            ))}
          </select>
        </label>
        <button className="tour-button" onClick={onTour}>
          <Icon name="help" size={17} />
          {t('top.tour')}
        </button>
        <button className="search" onClick={() => toast(t('top.searchSoon'))}>
          <Icon name="search" size={18} />
          {t('top.search')}
          <kbd>⌘K</kbd>
        </button>
        {playing ? (
          <button className="play is-playing" onClick={onStop} aria-label={t('top.stop')}>
            <Icon name="stop" size={16} />
            <span className="play-time">{clock(now)}</span>
            <span className="play-bar">
              <i style={{ width: `${progress * 100}%` }} />
            </span>
          </button>
        ) : (
          <button className="play" onClick={onPlay}>
            <Icon name="play" size={16} />
            {t('top.play')}
          </button>
        )}
        <span className="live-chip" title={t('top.liveTitle')}>
          <i className="live-dot" />
          {playing ? t('top.demoTime') : t('top.live', { time: now })}
        </span>
        <button className="icon-button" aria-label={t('top.notifications')} onClick={() => toast(t('top.noNotifications'))}>
          <Icon name="bell" />
        </button>
        <span className="avatar" aria-label={t('top.admin')}>
          PC
        </span>
      </div>
    </header>
  );
}
