import { LOCATIONS, type LocationId, type ProductId } from '@pure-clinics/shared';
import { useEffect, useMemo, useRef, useState } from 'react';

import { useI18n, type MessageKey } from '../../../i18n';
import { Stage } from '../../../three/stage';
import { SHELF_COMPACT, SHELF_WIDE, StockShelf, type ShelfLevel } from '../../../three/stockShelf';
import type { Forecast } from '../../data/stock';
import { PkIcon } from '../../icons';
import { Card, Seg } from '../../kit';
import { cityOf, useDaysLeft, useProductName, useStock, useStockUi } from './common';

type Where = LocationId | 'all';

/** Short names for the plinth: brand products keep their Latin name in every language, the sets are translated. */
const SHORT: Record<ProductId, string | MessageKey> = {
  'zo-cleanser': 'Cleanser',
  'zo-defense': 'Power Defense',
  'zo-spf': 'SPF 50',
  'lycogel-camouflage': 'Camouflage',
  'wiqo-cream': 'Face Cream',
  'xlhair-revitalix': 'Revitalix',
  'xlhair-scalpfit': 'Scalpfit',
  'xlhair-spray': 'Hairspray',
  'camouflage-set': 'pk.voorraad.shelf.short.camouflage',
  'laser-aftercare-set': 'pk.voorraad.shelf.short.laser',
};

const COMPACT_QUERY = '(max-width: 760px)';

function useCompact(): boolean {
  const [compact, setCompact] = useState(() => window.matchMedia(COMPACT_QUERY).matches);
  useEffect(() => {
    const mq = window.matchMedia(COMPACT_QUERY);
    const on = () => setCompact(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return compact;
}

/** How soon a set of forecasts runs out, the soonest first: out, within a week, within a month, later. */
const TONE_RANK: Record<ShelfLevel['tone'], number> = { out: 4, week: 3, month: 2, ok: 1, unavailable: 0 };
const toneOf = (f: Forecast): ShelfLevel['tone'] => (f.bucket === 'out' ? 'out' : f.bucket === 'week' ? 'week' : f.bucket === 'month' ? 'month' : 'ok');

/**
 * The stock as a 3D shelf, at one clinic or both together, with what runs out this week next to it. Webshop sales are
 * counted in: a webshop order goes out of the stock of the clinic nearest to the customer.
 */
export function Shelf() {
  const i18n = useI18n();
  const { t } = i18n;
  const name = useProductName();
  const daysLeft = useDaysLeft();
  const compact = useCompact();
  const { stock, info, products, forecast, requests } = useStock();
  const { openProduct, ask } = useStockUi();
  const [where, setWhere] = useState<Where>('nijmegen');
  const [hover, setHover] = useState<ProductId | null>(null);
  const host = useRef<HTMLDivElement>(null);
  const scene = useRef<StockShelf | null>(null);
  const stage = useRef<Stage | null>(null);
  const open = useRef(openProduct);
  open.current = openProduct;

  const locations = where === 'all' ? LOCATIONS : LOCATIONS.filter((l) => l.id === where);
  const here = useMemo(() => forecast.filter((f) => where === 'all' || f.locationId === where), [forecast, where]);
  const short = (id: ProductId) => {
    const s = SHORT[id];
    return s.startsWith('pk.') ? t(s as MessageKey) : s;
  };

  // What each jar shows: the units left here, against a full shelf (three times the minimum, or more when there is more).
  const levels = useMemo(() => {
    const out: Partial<Record<ProductId, ShelfLevel>> = {};
    for (const p of products) {
      const level = locations.reduce((s, l) => s + stock[l.id][p.id], 0);
      const min = locations.reduce((s, l) => s + info[p.id].min[l.id], 0);
      const own = here.filter((f) => f.product === p.id);
      const tone = p.soldOut ? 'unavailable' : own.map(toneOf).sort((a, b) => TONE_RANK[b] - TONE_RANK[a])[0] ?? 'ok';
      out[p.id] = { level, capacity: Math.max(min * 3, level, 6), tone };
    }
    return out;
  }, [products, locations, stock, info, here]);

  const tags = useMemo(() => {
    const out: Partial<Record<ProductId, string>> = {};
    for (const p of products) {
      const own = here.filter((f) => f.product === p.id);
      const parts = p.soldOut
        ? [t('pk.voorraad.status.unavailable')]
        : own.map((f) => `${where === 'all' ? `${cityOf(f.locationId)} ` : ''}${t('pk.voorraad.shelf.left', { n: f.level })} · ${daysLeft(f)}`);
      out[p.id] = `${name(p.id)} · ${parts.join(' · ')}`;
    }
    return out;
  }, [products, here, where, t, daysLeft, name]);

  const counts = useMemo(
    () => Object.fromEntries(products.map((p) => [p.id, p.soldOut ? '–' : String(levels[p.id]?.level ?? 0)])) as Partial<Record<ProductId, string>>,
    [products, levels],
  );

  useEffect(() => {
    const layout = compact ? SHELF_COMPACT : SHELF_WIDE;
    const view = new Stage(host.current!, {
      camera: layout.camera,
      target: layout.target,
      intro: layout.intro,
      fov: 30,
      minDistance: 7,
      maxDistance: 22,
      // All the way round, but never below the plinth or straight down from above.
      minPolarAngle: 0.3,
      maxPolarAngle: 1.25,
      fitAspect: layout.fitAspect,
      spin: 0.07,
    });
    const shelf = new StockShelf(
      view,
      products.map((p) => ({ id: p.id, short: short(p.id), name: name(p.id) })),
      setHover,
      (id) => open.current(id),
      compact ? layout.print : host.current!.clientWidth < 820 ? 1.2 : layout.print,
    );
    scene.current = shelf;
    stage.current = view;
    return () => {
      shelf.dispose();
      view.dispose();
      scene.current = null;
      stage.current = null;
    };
    // Rebuilt for a new layout, language or product list; new levels only move the fill (next effect).
  }, [compact, i18n.locale, products.length]);

  useEffect(() => {
    scene.current?.update(levels, counts, tags);
  }, [levels, counts, tags, compact, i18n.locale, products.length]);

  const soon = here.filter((f) => f.bucket === 'out' || f.bucket === 'week');
  const month = here.filter((f) => f.bucket === 'month');
  const requested = (f: Forecast) => requests.some((r) => r.product === f.product && r.locationId === f.locationId);

  return (
    <Card
      className="pk-st-shelf"
      eyebrow={t('pk.voorraad.shelf.eyebrow')}
      title={t('pk.voorraad.shelf.title')}
      help={t('pk.voorraad.shelf.help')}
      feature="more.shelf"
      actions={
        <Seg<Where>
          label={t('pk.voorraad.levels.locations')}
          value={where}
          onChange={(w) => {
            setHover(null);
            scene.current?.point(null);
            setWhere(w);
          }}
          options={[...LOCATIONS.map((l) => ({ value: l.id as Where, label: l.city })), { value: 'all', label: t('pk.voorraad.shelf.both') }]}
        />
      }
    >
      <div className="pk-st-shelf-body">
        <div className="scene-host pk-st-shelf-scene" ref={host} role="img" aria-label={t('pk.voorraad.shelf.help')}>
          <span className="scene-hint">{t('pk.voorraad.shelf.hint')}</span>
          <button type="button" className="pk-st-shelf-reset" onClick={() => stage.current?.home()}>
            <PkIcon name="refresh" size={15} />
            {t('pk.voorraad.shelf.reset')}
          </button>
        </div>
        <aside className="pk-st-shelf-side">
          <div className="pk-st-shelf-soon">
            <span className="eyebrow">{t('pk.voorraad.shelf.soon')}</span>
            {soon.length ? (
              <ul>
                {soon.slice(0, 5).map((f) => (
                  <li
                    key={`${f.product}@${f.locationId}`}
                    className={hover === f.product ? 'is-pointed' : ''}
                    onMouseEnter={() => scene.current?.point(f.product)}
                    onMouseLeave={() => scene.current?.point(null)}
                  >
                    <button type="button" className="pk-st-shelf-name" onClick={() => openProduct(f.product)}>
                      <strong>{name(f.product)}</strong>
                      <small>
                        {where === 'all' ? `${cityOf(f.locationId)} · ` : ''}
                        {t('pk.voorraad.shelf.left', { n: f.level })} · {daysLeft(f)}
                      </small>
                    </button>
                    {requested(f) ? (
                      <span className="pk-st-asked">
                        <PkIcon name="check" size={13} />
                        {t('pk.voorraad.ask.done')}
                      </span>
                    ) : (
                      <button type="button" className="btn btn-ghost btn-small" onClick={() => ask(f.product, f.locationId)}>
                        <PkIcon name="plus" size={13} />
                        {t('pk.voorraad.ask.button')}
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="pk-muted pk-small">{t('pk.voorraad.shelf.none')}</p>
            )}
          </div>
          <p className="pk-st-shelf-month">{t('pk.voorraad.shelf.month', { n: month.length })}</p>
          <div className="pk-st-shelf-legend" aria-hidden="true">
            <span>
              <i className="is-ok" />
              {t('pk.voorraad.shelf.legendOk')}
            </span>
            <span>
              <i className="is-month" />
              {t('pk.voorraad.shelf.legendMonth')}
            </span>
            <span>
              <i className="is-week" />
              {t('pk.voorraad.shelf.legendWeek')}
            </span>
          </div>
          <p className="pk-muted pk-small pk-st-shelf-note">
            <PkIcon name="info" size={14} />
            {t('pk.voorraad.shelf.webshop')}
          </p>
        </aside>
      </div>
    </Card>
  );
}
