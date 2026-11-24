import { LOCATIONS, type ProductId } from '@pure-clinics/shared';
import { useState } from 'react';

import { useI18n } from '../../../i18n';
import { usePraktijk } from '../../context';
import type { ProductInfo } from '../../data/stock';
import { PkIcon } from '../../icons';
import { Card, TableWrap, useMoney } from '../../kit';
import { useProductName, useStock } from './common';

const VATS: ProductInfo['vat'][] = [0, 9, 21];

/** The product list: prices and VAT, edited in bulk; a product only goes once nothing of it is left in stock. */
export function Products() {
  const { t } = useI18n();
  const { demo } = usePraktijk();
  const money = useMoney();
  const name = useProductName();
  const { stock, info, setInfo, products } = useStock();
  const [picked, setPicked] = useState<ProductId[]>([]);
  const [vat, setVat] = useState<ProductInfo['vat']>(21);
  const [change, setChange] = useState(3);

  const total = (id: ProductId) => LOCATIONS.reduce((s, l) => s + stock[l.id][id], 0);
  const all = products.length > 0 && picked.length === products.length;
  const toggle = (id: ProductId) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  const apply = (update: (d: ProductInfo) => ProductInfo) => {
    if (!picked.length) {
      demo(t('pk.voorraad.products.selectFirst'));
      return;
    }
    setInfo((i) => {
      const next = { ...i };
      for (const id of picked) next[id] = update(next[id]);
      return next;
    });
    demo(t('pk.voorraad.products.applied', { n: picked.length }));
  };

  return (
    <Card eyebrow={t('pk.voorraad.products.eyebrow')} title={t('pk.voorraad.products.title')} help={t('pk.voorraad.products.help')} feature="m.list">
      <div className="pk-st-bulk">
        <strong className="pk-small">{t('pk.voorraad.products.selected', { n: picked.length })}</strong>
        <span className="pk-st-bulk-group">
          <select className="pk-input" aria-label={t('pk.voorraad.products.setVat')} value={vat} onChange={(e) => setVat(Number(e.target.value) as ProductInfo['vat'])}>
            {VATS.map((v) => (
              <option key={v} value={v}>
                {t('pk.common.vat')} {v}%
              </option>
            ))}
          </select>
          <button className="btn btn-ghost btn-small" onClick={() => apply((d) => ({ ...d, vat }))}>
            {t('pk.voorraad.products.setVat')}
          </button>
        </span>
        <span className="pk-st-bulk-group">
          <span className="pk-st-pct">
            <input
              type="number"
              step="0.5"
              className="pk-input pk-st-qty"
              aria-label={t('pk.voorraad.products.changePrice')}
              value={change}
              onChange={(e) => setChange(Number(e.target.value) || 0)}
            />
            %
          </span>
          <button
            className="btn btn-ghost btn-small"
            onClick={() => apply((d) => ({ ...d, price: Math.round(d.price * (1 + change / 100) * 20) / 20 }))}
          >
            {t('pk.voorraad.products.changePrice')}
          </button>
        </span>
      </div>

      <TableWrap label={t('pk.voorraad.products.title')}>
        <table className="pk-table pk-cards">
          <thead>
            <tr>
              <th>
                <input
                  type="checkbox"
                  className="pk-st-box"
                  aria-label={t('pk.voorraad.products.selectAll')}
                  checked={all}
                  onChange={() => setPicked(all ? [] : products.map((p) => p.id))}
                />
              </th>
              <th>{t('pk.voorraad.levels.product')}</th>
              <th>{t('pk.voorraad.products.category')}</th>
              <th>{t('pk.voorraad.products.barcode')}</th>
              <th className="end">{t('pk.common.price')}</th>
              <th className="end">{t('pk.common.vat')}</th>
              <th className="end">{t('pk.voorraad.products.stock')}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {products.map((p) => {
              const d = info[p.id];
              const left = total(p.id);
              return (
                <tr key={p.id} aria-selected={picked.includes(p.id)}>
                  <td className="pk-cell-check">
                    <input type="checkbox" className="pk-st-box" aria-label={name(p.id)} checked={picked.includes(p.id)} onChange={() => toggle(p.id)} />
                  </td>
                  <td className="pk-cell-main">{name(p.id)}</td>
                  <td className="nowrap pk-cell-inline">{t(`pk.voorraad.cat.${p.category}`)}</td>
                  <td className="pk-mono pk-cell-inline">{d.barcode}</td>
                  <td className="end nowrap pk-cell-side">{money(d.price)}</td>
                  <td className="end pk-num pk-cell-half" data-label={t('pk.common.vat')}>
                    {d.vat}%
                  </td>
                  <td className="end pk-num pk-cell-half" data-label={t('pk.voorraad.products.stock')}>
                    {left}
                  </td>
                  <td className="end pk-cell-full">
                    <span className="pk-st-delete" title={left ? t('pk.voorraad.products.cantDelete', { n: left }) : undefined}>
                      <button
                        className="btn btn-ghost btn-small"
                        disabled={left > 0}
                        onClick={() => {
                          setInfo((i) => ({ ...i, [p.id]: { ...i[p.id], deleted: true } }));
                          setPicked((list) => list.filter((x) => x !== p.id));
                          demo(t('pk.voorraad.products.deleted', { product: name(p.id) }));
                        }}
                      >
                        <PkIcon name="trash" size={14} />
                        {t('pk.common.delete')}
                      </button>
                      {left ? <small className="pk-muted">{t('pk.voorraad.products.cantDelete', { n: left })}</small> : null}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </TableWrap>
    </Card>
  );
}
