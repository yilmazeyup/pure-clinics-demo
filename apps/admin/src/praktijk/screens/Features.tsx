import { useMemo, useState, type CSSProperties } from 'react';

import { useI18n, type MessageKey } from '../../i18n';
import { usePraktijk } from '../context';
import { EXTRAS, FEATURE_GROUPS, FEATURES, type Feature } from '../features';
import { PkIcon } from '../icons';
import { Card, Chip } from '../kit';
import { SCREENS, type ScreenId } from '../nav';
import './responsive.css';
import './Features.css';

/** Lower case without accents, so "clienten" finds "Cliënten". */
const fold = (text: string) =>
  text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

/**
 * The comparison page: every feature of the SkinAdmin inventory, grouped A to Y, each marked as present and linked to
 * the screen of Pure Praktijk where it lives. A click jumps there and lets the spot glow.
 */
export function FeaturesScreen() {
  const { t } = useI18n();
  const { go } = usePraktijk();
  const [query, setQuery] = useState('');
  const [only, setOnly] = useState<ScreenId | 'all'>('all');

  const q = fold(query.trim());
  const groups = useMemo(
    () =>
      FEATURE_GROUPS.map((g) => ({
        ...g,
        shown: g.features.filter(
          (f) =>
            (only === 'all' || f.screen === only) &&
            (!q || fold(`${t(`pk.f.${f.id}` as MessageKey)} ${t(`pk.fg.${g.letter}` as MessageKey)} ${t(`pk.screen.${f.screen}`)}`).includes(q)),
        ),
      })).filter((g) => g.shown.length),
    [q, only, t],
  );
  const extras = EXTRAS.filter((f) => (only === 'all' || f.screen === only) && (!q || fold(t(`pk.f.${f.id}` as MessageKey)).includes(q)));

  const row = (f: Feature) => (
    <li key={f.id}>
      <button className="pk-fx-item" onClick={() => go(f.screen, { feature: f.id })} title={t('pk.functies.goto', { screen: t(`pk.screen.${f.screen}`) })}>
        <span className="pk-fx-tick" aria-label={t('pk.functies.present')}>
          <PkIcon name="check" size={13} stroke={2.4} />
        </span>
        <span className="pk-fx-label">{t(`pk.f.${f.id}` as MessageKey)}</span>
        <span className="pk-fx-where">
          {t(`pk.screen.${f.screen}`)}
          <PkIcon name="arrow" size={13} />
        </span>
      </button>
    </li>
  );

  return (
    <div className="pk-stack pk-fx">
      <Card
        eyebrow={t('pk.functies.eyebrow')}
        title={t('pk.functies.title')}
        actions={
          <Chip tone="good" icon="check">
            {t('pk.functies.count', { present: FEATURES.length, total: FEATURES.length })}
          </Chip>
        }
      >
        <div className="pk-fx-tools">
          <label className="pk-search pk-fx-search">
            <PkIcon name="search" size={16} />
            <input
              className="pk-input"
              type="search"
              value={query}
              placeholder={t('pk.functies.search')}
              aria-label={t('pk.functies.search')}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          <label className="pk-fx-only">
            <span className="pk-field-label">{t('pk.functies.onlyScreen')}</span>
            <select className="pk-input" value={only} onChange={(e) => setOnly(e.target.value as ScreenId | 'all')}>
              <option value="all">{t('pk.common.all')}</option>
              {SCREENS.filter((s) => s.id !== 'functies').map((s) => (
                <option key={s.id} value={s.id}>
                  {t(`pk.screen.${s.id}`)}
                </option>
              ))}
            </select>
          </label>
          <span className="pk-muted pk-small">{t('pk.functies.groups', { n: FEATURE_GROUPS.length })}</span>
        </div>
      </Card>

      {groups.length || extras.length ? null : <p className="pk-empty">{t('pk.functies.noResults', { q: query.trim() })}</p>}

      <div className="pk-fx-groups">
        {groups.map((g, i) => (
          <section key={g.letter} className="card pk-fx-group rise" style={{ '--d': `${Math.min(i, 12) * 30}ms` } as CSSProperties}>
            <header className="pk-fx-head">
              <span className="pk-fx-letter">{g.letter}</span>
              <h3>{t(`pk.fg.${g.letter}` as MessageKey)}</h3>
              <span className="pk-fx-n">
                {g.shown.length}/{g.features.length}
              </span>
            </header>
            <ul className="pk-fx-list">{g.shown.map(row)}</ul>
          </section>
        ))}
      </div>

      {extras.length ? (
        <Card eyebrow={t('pk.functies.moreEyebrow')} title={t('pk.functies.moreTitle')} help={t('pk.functies.moreHelp')} className="pk-fx-more">
          <ul className="pk-fx-list pk-fx-list--more">{extras.map(row)}</ul>
        </Card>
      ) : null}

      <p className="pk-muted pk-small pk-fx-source">{t('pk.functies.source')}</p>
    </div>
  );
}
