import { useEffect, useRef, type CSSProperties } from 'react';

import { Accent, useI18n } from '../i18n';
// Campagnes shares Pure Praktijk's building blocks (cards, chips, tables, fields) and adds its own styles on top.
import '../praktijk/praktijk.css';
import { PkIcon } from '../praktijk/icons';
import './campagnes.css';
import { Composer } from './composer/Composer';
import { CP_TABS, type CpRoute } from './nav';
import { CpProvider, useCp } from './state';
import { CalendarTab } from './tabs/Calendar';
import { CampaignsTab } from './tabs/Campaigns';
import { ContactsTab } from './tabs/Contacts';
import { OverviewTab } from './tabs/Overview';
import { SegmentsTab } from './tabs/Segments';
import { SettingsTab } from './tabs/Settings';

type Props = { now: Date; route: CpRoute; onRoute: (route: CpRoute, scroll?: boolean) => void };

/** Campagnes: e-mail and SMS campaigns through Mailchimp, planned, written, sent and measured from the panel. */
export function Campagnes({ now, route, onRoute }: Props) {
  return (
    <CpProvider now={now} route={route} onRoute={onRoute}>
      <Module />
    </CpProvider>
  );
}

function Module() {
  const { t } = useI18n();
  const { route, open, byId, create, sync } = useCp();
  const nav = useRef<HTMLElement>(null);
  const campaign = route.campaign ? byId(route.campaign) : undefined;

  // Keep the chosen tab in view in the scrolling tab bar on a phone, without scrolling the page.
  useEffect(() => {
    const bar = nav.current;
    const tab = bar?.querySelector<HTMLElement>('[aria-current="page"]');
    if (bar && tab && bar.scrollWidth > bar.clientWidth) {
      const b = bar.getBoundingClientRect();
      const r = tab.getBoundingClientRect();
      bar.scrollBy({ left: r.left - b.left - (b.width - r.width) / 2 });
    }
  }, [route.tab]);

  return (
    <div className="pk cp">
      <section className="card pk-head cp-head rise">
        <div className="pk-head-top">
          <div className="pk-head-text">
            <span className="eyebrow">{t('cp.head.eyebrow')}</span>
            <h1 className="pk-title">
              <Accent text={t('cp.head.title')} />
            </h1>
            <p className="help">{t('cp.head.help')}</p>
          </div>
          <div className="pk-head-side cp-head-side">
            <span className={`pk-chip ${sync.running ? 'pk-chip--brand' : 'pk-chip--good'}`}>
              <i className="live-dot" />
              {t(sync.running ? 'cp.head.syncing' : 'cp.head.connected')}
            </span>
            <div className="cp-head-new">
              <button className="btn btn-primary" onClick={() => create('email')}>
                <PkIcon name="mail" size={15} />
                {t('cp.new.email')}
              </button>
              <button className="btn btn-ghost" onClick={() => create('sms')}>
                <PkIcon name="sms" size={15} />
                {t('cp.new.sms')}
              </button>
            </div>
          </div>
        </div>
        <p className="pk-demo-line">
          <PkIcon name="info" size={15} />
          {t('cp.head.demo')}
        </p>
      </section>

      <nav ref={nav} className="pk-subnav cp-subnav rise" aria-label={t('cp.tabs')} style={{ '--d': '60ms' } as CSSProperties}>
        {CP_TABS.map((tab) => (
          <button key={tab.id} aria-current={tab.id === route.tab && !campaign ? 'page' : undefined} onClick={() => open(tab.id)}>
            <PkIcon name={tab.icon} size={16} />
            {t(`cp.tab.${tab.id}`)}
          </button>
        ))}
      </nav>

      <div className="pk-body cp-body">
        {campaign ? (
          <Composer key={campaign.id} campaign={campaign} />
        ) : (
          <div className="pk-screen" data-tab={route.tab}>
            <header className="pk-screen-head">
              <h2 className="pk-screen-title">{t(`cp.tab.${route.tab}`)}</h2>
              <p className="help">{t(`cp.help.${route.tab}`)}</p>
            </header>
            {route.tab === 'overzicht' ? <OverviewTab /> : null}
            {route.tab === 'kalender' ? <CalendarTab /> : null}
            {route.tab === 'campagnes' ? <CampaignsTab /> : null}
            {route.tab === 'segmenten' ? <SegmentsTab /> : null}
            {route.tab === 'contacten' ? <ContactsTab /> : null}
            {route.tab === 'instellingen' ? <SettingsTab /> : null}
          </div>
        )}
      </div>
    </div>
  );
}
