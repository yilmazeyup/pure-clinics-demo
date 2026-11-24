import { useEffect, useRef, useState, type ComponentType, type CSSProperties } from 'react';

import { useI18n } from '../i18n';
// The module's base styles load before every screen's own, so a screen can refine a kit class.
import './praktijk.css';
import { PraktijkProvider, usePraktijk } from './context';
import { PkIcon } from './icons';
import { SCREENS, type ScreenId } from './nav';
import { OverviewScreen } from './overview/Overview';
import { AgendaScreen } from './screens/Agenda';
import { ClientsScreen } from './screens/Clients';
import { ClaimsScreen } from './screens/Claims';
import { DossierScreen } from './screens/Dossier';
import { FeaturesScreen } from './screens/Features';
import { BillingScreen } from './screens/Billing';
import { MessagesScreen } from './screens/Messages';
import { PlannerScreen } from './screens/Planner';
import { PortalScreen } from './screens/Portal';
import { ReportsScreen } from './screens/Reports';
import { SettingsScreen } from './screens/Settings';
import { StockScreen } from './screens/Stock';
import { TeamScreen } from './screens/Team';

const VIEWS: Record<ScreenId, ComponentType> = {
  overzicht: OverviewScreen,
  agenda: AgendaScreen,
  planner: PlannerScreen,
  portaal: PortalScreen,
  clienten: ClientsScreen,
  dossier: DossierScreen,
  facturen: BillingScreen,
  declaraties: ClaimsScreen,
  voorraad: StockScreen,
  berichten: MessagesScreen,
  rapportages: ReportsScreen,
  team: TeamScreen,
  instellingen: SettingsScreen,
  functies: FeaturesScreen,
};

type Props = { now: Date; screen: ScreenId; feature?: string; onScreen: (screen: ScreenId) => void };

/** Pure Praktijk: the practice-management module, sold as its own monthly subscription next to the panel. */
export function Praktijk({ now, screen, feature, onScreen }: Props) {
  return (
    <PraktijkProvider now={now} screen={screen} initialFeature={feature} onScreen={onScreen}>
      <Module />
    </PraktijkProvider>
  );
}

function Module() {
  const { t } = useI18n();
  const { screen, go, target } = usePraktijk();
  // A screen stays mounted once it has been opened, so its state survives a visit elsewhere.
  const [opened, setOpened] = useState<ScreenId[]>([screen]);
  const body = useRef<HTMLDivElement>(null);
  const nav = useRef<HTMLElement>(null);

  useEffect(() => {
    setOpened((list) => (list.includes(screen) ? list : [...list, screen]));
    // Keep the chosen tab in view in the scrolling sub-navigation on a phone, without scrolling the page itself.
    const bar = nav.current;
    const tab = bar?.querySelector<HTMLElement>('[aria-current="page"]');
    if (bar && tab && bar.scrollWidth > bar.clientWidth) {
      const b = bar.getBoundingClientRect();
      const r = tab.getBoundingClientRect();
      bar.scrollBy({ left: r.left - b.left - (b.width - r.width) / 2 });
    }
  }, [screen]);

  // A jump to a feature: wait for its element on the screen, bring it into view and let it glow for a moment.
  useEffect(() => {
    const id = target?.feature;
    if (!id) return;
    let tries = 0;
    let timer = 0;
    const find = () => {
      // The route follows the hash a moment after the jump, so look in whichever screen is visible at each try.
      const root = body.current?.querySelector('.pk-screen:not([hidden])');
      const el = root?.querySelector<HTMLElement>(`[data-feature~="${CSS.escape(id)}"]`);
      if (el && el.offsetParent !== null) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        el.classList.remove('pk-flash');
        void el.offsetWidth;
        el.classList.add('pk-flash');
        timer = window.setTimeout(() => el.classList.remove('pk-flash'), 2600);
      } else if (tries++ < 75) {
        timer = window.setTimeout(find, 80);
      }
    };
    timer = window.setTimeout(find, 60);
    return () => window.clearTimeout(timer);
  }, [target?.at]);

  return (
    <div className="pk">
      <nav ref={nav} className="pk-subnav rise" aria-label={t('pk.subnav.label')} style={{ '--d': '60ms' } as CSSProperties}>
        {SCREENS.map((s) => (
          <button key={s.id} aria-current={s.id === screen ? 'page' : undefined} onClick={() => go(s.id)}>
            <PkIcon name={s.icon} size={16} />
            {t(`pk.screen.${s.id}`)}
          </button>
        ))}
      </nav>

      <div ref={body} className="pk-body">
        {opened.map((id) => {
          const View = VIEWS[id];
          return (
            <div key={id} data-screen={id} className="pk-screen" hidden={id !== screen}>
              {/* The overview carries its own title in its hero. */}
              {id === 'overzicht' ? null : (
                <header className="pk-screen-head">
                  <h2 className="pk-screen-title">{t(`pk.screen.${id}`)}</h2>
                  <p className="help">{t(`pk.help.${id}`)}</p>
                </header>
              )}
              <View />
            </div>
          );
        })}
      </div>
    </div>
  );
}
