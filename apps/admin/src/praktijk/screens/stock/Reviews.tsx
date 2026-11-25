import { productById, type ProductId } from '@pure-clinics/shared';
import { useState } from 'react';

import { useI18n, type MessageKey } from '../../../i18n';
import { usePraktijk } from '../../context';
import { Card, Chip, Field, useDecimal } from '../../kit';
import { Stars, useProductName, useStock, useStockUi } from './common';

/** What customers say about each product: the average per product, and the reviews themselves, newest first. */
export function Reviews() {
  const { t, dayMonth } = useI18n();
  const { now } = usePraktijk();
  const decimal = useDecimal();
  const name = useProductName();
  const { openProduct } = useStockUi();
  const { reviews, products } = useStock();
  const [only, setOnly] = useState<ProductId | 'all'>('all');

  const summary = products
    .map((p) => {
      const own = reviews.filter((r) => r.product === p.id);
      return { product: p, count: own.length, average: own.length ? own.reduce((s, r) => s + r.rating, 0) / own.length : 0 };
    })
    .filter((x) => x.count)
    .sort((a, b) => b.average - a.average || b.count - a.count);
  const list = reviews.filter((r) => products.some((p) => p.id === r.product) && (only === 'all' || r.product === only));
  const all = reviews.filter((r) => products.some((p) => p.id === r.product));
  const average = all.length ? all.reduce((s, r) => s + r.rating, 0) / all.length : 0;

  return (
    <Card
      eyebrow={t('pk.voorraad.rev.eyebrow')}
      title={t('pk.voorraad.rev.heading')}
      help={t('pk.voorraad.rev.help')}
      feature="more.reviews"
      actions={<Chip tone="outline">{t('pk.voorraad.rev.demoChip')}</Chip>}
    >
      <div className="pk-st-rev">
        <aside className="pk-st-rev-sum">
          <div className="pk-st-rev-all">
            <strong>{decimal(average)}</strong>
            <Stars rating={average} label={t('pk.voorraad.rev.average', { n: decimal(average) })} />
            <small className="pk-muted">{t('pk.voorraad.rev.count', { n: all.length })}</small>
          </div>
          <ul className="pk-st-rev-products">
            {summary.map((s) => (
              <li key={s.product.id}>
                <button
                  type="button"
                  className={only === s.product.id ? 'is-on' : ''}
                  aria-pressed={only === s.product.id}
                  onClick={() => setOnly((o) => (o === s.product.id ? 'all' : s.product.id))}
                >
                  <span className="pk-st-rev-name">{name(s.product.id)}</span>
                  <span className="pk-st-rev-score">
                    <Stars rating={s.average} label={t('pk.voorraad.rev.average', { n: decimal(s.average) })} />
                    <small>
                      {decimal(s.average)} · {s.count}
                    </small>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </aside>

        <div className="pk-st-rev-list">
          <div className="pk-st-rev-filter">
            <Field label={t('pk.voorraad.levels.product')}>
              <select className="pk-input" value={only} onChange={(e) => setOnly(e.target.value as ProductId | 'all')}>
                <option value="all">{t('pk.voorraad.rev.allProducts')}</option>
                {summary.map((s) => (
                  <option key={s.product.id} value={s.product.id}>
                    {name(s.product.id)}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <ul className="pk-st-reviews">
            {list.map((r) => {
              const p = productById(r.product)!;
              return (
                <li key={r.id}>
                  <span className="pk-st-review-head">
                    <Stars rating={r.rating} label={t('pk.voorraad.rev.stars', { n: r.rating })} />
                    <strong>{r.name}</strong>
                    <small className="pk-muted">
                      {dayMonth(r.at, now)} · {t(`pk.voorraad.rev.via.${r.channel}`)}
                    </small>
                  </span>
                  <p>{t(`pk.voorraad.rev.t.${p.category}.${r.text}` as MessageKey)}</p>
                  {only === 'all' ? (
                    <button type="button" className="pk-st-link pk-small" onClick={() => openProduct(r.product)}>
                      {name(r.product)}
                    </button>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </Card>
  );
}
