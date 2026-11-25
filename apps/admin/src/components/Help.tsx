import { useState } from 'react';

import { Accent, useI18n } from '../i18n';
import { Drawer } from './Drawer';
import { Icon } from './Icon';

/** The help pages with the explainer videos, on the demo site. */
const HELP_URL = 'https://pureclinics.savastana.com/hulp/';

/** What a page is called and what it is for, shown at the top of its help. */
export type PageHelp = { title: string; intro: string };

type Part = { id: number; eyebrow: string; title: string; help: string; el: HTMLElement };

/**
 * Every part of the page that is on screen now, read from its cards: the small line above, the title and the line that
 * says what it is for and how to use it. So the help always matches the page, in the chosen language.
 */
function partsOnPage(): Part[] {
  const cards = [...document.querySelectorAll<HTMLElement>('main .card')].filter((el) => el.offsetParent !== null);
  const parts: Part[] = [];
  cards.forEach((el, id) => {
    const title = el.querySelector('.card-title, h1, h2')?.textContent?.trim() ?? '';
    const help = el.querySelector('.help')?.textContent?.trim() ?? '';
    if (!title || !help || el.parentElement?.closest('main .card')) return;
    parts.push({ id, eyebrow: el.querySelector('.eyebrow')?.textContent?.trim() ?? '', title, help, el });
  });
  return parts;
}

/**
 * The question mark at the top right of every page: it opens what the page is for, each part of it with how to use it,
 * and a place for the page's explainer video, which follows when the project is done.
 */
export function HelpButton({ page, onTour }: { page: PageHelp; onTour?: () => void }) {
  const { t, locale } = useI18n();
  const [open, setOpen] = useState(false);
  const [parts, setParts] = useState<Part[]>([]);
  const show = () => {
    setParts(partsOnPage());
    setOpen(true);
  };
  const goTo = (part: Part) => {
    setOpen(false);
    window.setTimeout(() => part.el.scrollIntoView({ behavior: 'smooth', block: 'start' }), 250);
  };
  return (
    <>
      <button className="icon-button help-button" aria-label={t('hlp.button')} title={t('hlp.button')} onClick={show}>
        <Icon name="help" />
      </button>
      <Drawer open={open} onClose={() => setOpen(false)} label={t('hlp.button')}>
        <span className="eyebrow">{t('hlp.eyebrow')}</span>
        <h2 className="drawer-title">
          <Accent text={page.title} />
        </h2>
        <p className="help">{page.intro}</p>

        <div className="help-video" role="img" aria-label={t('hlp.videoSoon')}>
          <span>
            <Icon name="play" size={18} />
          </span>
          {t('hlp.videoSoon')}
        </div>

        {parts.length ? (
          <section className="drawer-section">
            <h3>{t('hlp.onPage')}</h3>
            <div className="help-parts">
              {parts.map((part) => (
                <button key={part.id} className="help-part" onClick={() => goTo(part)}>
                  {part.eyebrow ? <small>{part.eyebrow}</small> : null}
                  <strong>{part.title}</strong>
                  <span>{part.help}</span>
                </button>
              ))}
            </div>
          </section>
        ) : null}

        <div className="help-foot">
          {onTour ? (
            <button
              className="btn btn-primary"
              onClick={() => {
                setOpen(false);
                onTour();
              }}
            >
              <Icon name="play" size={15} />
              {t('hlp.tour')}
            </button>
          ) : null}
          <a className="btn btn-ghost" href={`${HELP_URL}?lang=${locale}`} target="_blank" rel="noopener">
            {t('hlp.more')}
            <Icon name="arrow" size={14} />
          </a>
        </div>
      </Drawer>
    </>
  );
}
