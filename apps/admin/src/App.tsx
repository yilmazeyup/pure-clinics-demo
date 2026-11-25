import { lazy, Suspense, useEffect, useState } from 'react';

import { ClientHome } from './account/ClientHome';
import { AccountProvider, useAccount } from './account/context';
import { SignIn } from './account/SignIn';
import { StaffHome } from './account/StaffHome';
import { useDemoClock } from './clock';
import { Sidebar, Topbar } from './components/Shell';
import { Tour } from './components/Tour';
import { ToastProvider } from './components/ui';
import { CoursesPage } from './dash/Courses';
import { Overview } from './dash/Overview';
import { campagnesFromHash, campagnesHash, type CpRoute } from './campagnes/nav';
import { type PageHelp } from './components/Help';
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

type Route = { screen: ScreenId; feature?: string } | { campagnes: CpRoute } | { courses: true } | null;

const routeOf = (hash: string): Route => {
  if (hash === '#trajecten') return { courses: true };
  const campagnes = campagnesFromHash(hash);
  return campagnes ? { campagnes } : screenFromHash(hash);
};

/**
 * The overview, the full list of treatment plans (…/#trajecten), the Kliniek module at one of its screens
 * (…/#praktijk/agenda; the Webshop entry opens its stock screen, …/#praktijk/voorraad) or Campagnes at one of its tabs
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
  const openCourses = () => {
    go('trajecten', { courses: true });
    window.scrollTo({ top: 0 });
  };
  return [route, open, openCampagnes, openCourses] as const;
}

function Panel() {
  const { account } = useAccount();
  const { t } = useI18n();
  const clock = useDemoClock();
  const [touring, setTouring] = useState(false);
  const [route, open, openCampagnes, openCourses] = useRoute();
  // Back to the tab of Campagnes that was open last, like Praktijk keeps its screen.
  const [lastTab, setLastTab] = useState<CpRoute['tab']>('overzicht');
  useEffect(() => {
    if (route && 'campagnes' in route) setLastTab(route.campagnes.tab);
  }, [route]);
  // Only the admin opens the modules and the full pages; a team member or a client always lands on her own page.
  const admin = account?.role === 'admin';
  const praktijk = admin && route && 'screen' in route ? route : null;
  const campagnes = admin && route && 'campagnes' in route ? route.campagnes : null;
  const courses = Boolean(admin && route && 'courses' in route);
  // The Webshop entry in the menu opens the module's stock screen; the menu shows it as its own entry.
  const view = praktijk ? (praktijk.screen === 'voorraad' ? 'shop' : 'praktijk') : campagnes ? 'campagnes' : courses ? 'courses' : 'overview';
  // What the open page is and is for, behind the question mark at the top right; its parts are read from the page itself.
  const page: PageHelp =
    account?.role === 'staff'
      ? { title: t('acc.nav.day'), intro: t('hlp.staff') }
      : account?.role === 'client'
        ? { title: t('acc.nav.me'), intro: t('hlp.client') }
        : praktijk
          ? { title: t(`pk.screen.${praktijk.screen}`), intro: t(`pk.help.${praktijk.screen}`) }
          : campagnes
            ? { title: `${t('nav.campaigns')} · ${t(`cp.tab.${campagnes.tab}`)}`, intro: t(`cp.help.${campagnes.tab}`) }
            : courses
              ? { title: t('courses.page.title'), intro: t('courses.page.help') }
              : { title: t('nav.overview'), intro: t('hlp.overview') };
  // The tour walks through the overview, so it starts there.
  const tour = () => {
    open(null);
    setTouring(true);
  };
  return (
    <div className="app">
      <ToastProvider>
        <Sidebar
          view={view}
          onView={(next) =>
            next === 'campagnes'
              ? openCampagnes({ tab: campagnes?.tab ?? lastTab })
              : next === 'shop'
                ? open('voorraad')
                : next === 'praktijk'
                  ? open(praktijk && praktijk.screen !== 'voorraad' ? praktijk.screen : 'overzicht')
                  : open(null)
          }
          screen={praktijk?.screen ?? null}
          onScreen={open}
          tab={campagnes?.tab ?? null}
          onTab={(tab) => openCampagnes({ tab })}
        />
        <main className="main">
          <Topbar
            now={clock.now}
            playing={clock.playing}
            progress={clock.progress}
            onPlay={clock.play}
            onStop={clock.stop}
            onTour={view === 'overview' && admin ? tour : undefined}
            page={page}
            compact={!!praktijk}
          />
          {account?.role === 'staff' ? (
            <StaffHome now={clock.now} account={account} />
          ) : account?.role === 'client' ? (
            <ClientHome now={clock.now} account={account} />
          ) : praktijk ? (
            <Praktijk now={clock.now} screen={praktijk.screen} feature={praktijk.feature} onScreen={open} />
          ) : campagnes ? (
            <Campagnes now={clock.now} route={campagnes} onRoute={openCampagnes} />
          ) : courses ? (
            <CoursesPage now={clock.now} onBack={() => open(null)} />
          ) : (
            <Overview now={clock.now} playing={clock.playing} onCourses={openCourses} onAgenda={() => open('agenda')} />
          )}
        </main>
        {admin ? <Tour open={touring} onOpen={tour} onClose={() => setTouring(false)} /> : null}
      </ToastProvider>
    </div>
  );
}

/** Nobody signed in: the sign-in page; otherwise the panel of that account. */
function Gate() {
  const { account } = useAccount();
  return account ? <Panel key={account.id} /> : <SignIn />;
}

export function App() {
  return (
    <I18nProvider>
      <AccountProvider>
        <Gate />
      </AccountProvider>
    </I18nProvider>
  );
}
