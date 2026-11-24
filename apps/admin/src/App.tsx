import { lazy, Suspense, useEffect, useState } from 'react';

import { useDemoClock } from './clock';
import { Sidebar, Topbar } from './components/Shell';
import { Tour } from './components/Tour';
import { ToastProvider } from './components/ui';
import { Overview } from './dash/Overview';
import { campagnesFromHash, campagnesHash, type CpRoute } from './campagnes/nav';
import { I18nProvider, loadCampagnes, loadPraktijk, useI18n } from './i18n';
import { screenFromHash, type ScreenId } from './praktijk/nav';

// Pure Praktijk is a large module with its own texts; it loads the first time someone opens it, so the overview stays light.
const PraktijkModule = lazy(() => Promise.all([import('./praktijk/Praktijk'), loadPraktijk('nl')]).then(([m]) => ({ default: m.Praktijk })));

/** Loads the module's texts in the chosen language (Dutch shows until they are in) and draws the module. */
function Praktijk(props: Parameters<typeof PraktijkModule>[0]) {
  const { locale } = useI18n();
  const [, setLoaded] = useState(0);
  useEffect(() => {
    let live = true;
    void loadPraktijk(locale).then(() => live && setLoaded((n) => n + 1));
    return () => {
      live = false;
    };
  }, [locale]);
  return (
    <Suspense fallback={<div className="pk-loading" aria-busy="true" />}>
      <PraktijkModule {...props} />
    </Suspense>
  );
}

// Campagnes, the Mailchimp module, loads the same way: its code and texts arrive the first time it opens.
const CampagnesModule = lazy(() => Promise.all([import('./campagnes/Campagnes'), loadCampagnes('nl')]).then(([m]) => ({ default: m.Campagnes })));

function Campagnes(props: Parameters<typeof CampagnesModule>[0]) {
  const { locale } = useI18n();
  const [, setLoaded] = useState(0);
  useEffect(() => {
    let live = true;
    void loadCampagnes(locale).then(() => live && setLoaded((n) => n + 1));
    return () => {
      live = false;
    };
  }, [locale]);
  return (
    <Suspense fallback={<div className="pk-loading" aria-busy="true" />}>
      <CampagnesModule {...props} />
    </Suspense>
  );
}

type Route = { screen: ScreenId; feature?: string } | { campagnes: CpRoute } | null;

const routeOf = (hash: string): Route => {
  const campagnes = campagnesFromHash(hash);
  return campagnes ? { campagnes } : screenFromHash(hash);
};

/**
 * The overview, Pure Praktijk at one of its screens (…/#praktijk/agenda) or Campagnes at one of its tabs
 * (…/#campagnes/kalender).
 */
function useRoute() {
  const [route, setRoute] = useState<Route>(() => routeOf(window.location.hash));
  useEffect(() => {
    const onHash = () => setRoute(routeOf(window.location.hash));
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  const go = (hash: string, next: Route) => {
    if (window.location.hash !== `#${hash}`) window.location.hash = hash;
    else setRoute(next);
  };
  const open = (screen: ScreenId | null) => {
    if (screen) go(`praktijk/${screen}`, { screen });
    else {
      history.replaceState(null, '', window.location.pathname + window.location.search);
      setRoute(null);
    }
    window.scrollTo({ top: 0 });
  };
  const openCampagnes = (to: CpRoute, scroll = true) => {
    go(campagnesHash(to), { campagnes: to });
    if (scroll) window.scrollTo({ top: 0 });
  };
  return [route, open, openCampagnes] as const;
}

function Panel() {
  const clock = useDemoClock();
  const [touring, setTouring] = useState(false);
  const [route, open, openCampagnes] = useRoute();
  // Back to the tab of Campagnes that was open last, like Praktijk keeps its screen.
  const [lastTab, setLastTab] = useState<CpRoute['tab']>('overzicht');
  useEffect(() => {
    if (route && 'campagnes' in route) setLastTab(route.campagnes.tab);
  }, [route]);
  const praktijk = route && 'screen' in route ? route : null;
  const campagnes = route && 'campagnes' in route ? route.campagnes : null;
  // The tour walks through the overview, so it starts there.
  const tour = () => {
    open(null);
    setTouring(true);
  };
  return (
    <div className="app">
      <ToastProvider>
        <Sidebar
          view={praktijk ? 'praktijk' : campagnes ? 'campagnes' : 'overview'}
          onView={(view) =>
            view === 'campagnes' ? openCampagnes({ tab: campagnes?.tab ?? lastTab }) : open(view === 'praktijk' ? (praktijk?.screen ?? 'overzicht') : null)
          }
          screen={praktijk?.screen ?? null}
          onScreen={open}
        />
        <main className="main">
          <Topbar
            now={clock.now}
            playing={clock.playing}
            progress={clock.progress}
            onPlay={clock.play}
            onStop={clock.stop}
            onTour={tour}
            compact={!!praktijk}
          />
          {praktijk ? (
            <Praktijk now={clock.now} screen={praktijk.screen} feature={praktijk.feature} onScreen={open} />
          ) : campagnes ? (
            <Campagnes now={clock.now} route={campagnes} onRoute={openCampagnes} />
          ) : (
            <Overview now={clock.now} playing={clock.playing} />
          )}
        </main>
        <Tour open={touring} onOpen={tour} onClose={() => setTouring(false)} />
      </ToastProvider>
    </div>
  );
}

export function App() {
  return (
    <I18nProvider>
      <Panel />
    </I18nProvider>
  );
}
