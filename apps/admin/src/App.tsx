import { lazy, Suspense, useEffect, useState } from 'react';

import { useDemoClock } from './clock';
import { Sidebar, Topbar } from './components/Shell';
import { Tour } from './components/Tour';
import { ToastProvider } from './components/ui';
import { Overview } from './dash/Overview';
import { I18nProvider, loadPraktijk, useI18n } from './i18n';
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

/** The overview, or Pure Praktijk at one of its screens: …/#praktijk/agenda opens the module there. */
function useRoute() {
  const [route, setRoute] = useState(() => screenFromHash(window.location.hash));
  useEffect(() => {
    const onHash = () => setRoute(screenFromHash(window.location.hash));
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  const open = (screen: ScreenId | null) => {
    if (screen) {
      if (window.location.hash !== `#praktijk/${screen}`) window.location.hash = `praktijk/${screen}`;
      else setRoute({ screen });
    } else {
      history.replaceState(null, '', window.location.pathname + window.location.search);
      setRoute(null);
    }
    window.scrollTo({ top: 0 });
  };
  return [route, open] as const;
}

function Panel() {
  const clock = useDemoClock();
  const [touring, setTouring] = useState(false);
  const [route, open] = useRoute();
  // The tour walks through the overview, so it starts there.
  const tour = () => {
    open(null);
    setTouring(true);
  };
  return (
    <div className="app">
      <ToastProvider>
        <Sidebar view={route ? 'praktijk' : 'overview'} onView={(view) => open(view === 'praktijk' ? (route?.screen ?? 'agenda') : null)} />
        <main className="main">
          <Topbar
            now={clock.now}
            playing={clock.playing}
            progress={clock.progress}
            onPlay={clock.play}
            onStop={clock.stop}
            onTour={tour}
          />
          {route ? (
            <Praktijk now={clock.now} screen={route.screen} feature={route.feature} onScreen={open} />
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
