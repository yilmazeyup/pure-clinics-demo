import { LOCATIONS, PRODUCTS, sameDay } from '@pure-clinics/shared';
import { useEffect, useState } from 'react';

import { useI18n } from '../../i18n';
import { usePraktijk } from '../context';
import { PkIcon } from '../icons';
import { Seg, Stat, useMoney } from '../kit';
import { useStock } from './stock/common';
import { Levels } from './stock/Levels';
import { Orders } from './stock/Orders';
import { Products } from './stock/Products';
import { Suppliers } from './stock/Suppliers';
import './responsive.css';
import './Stock.css';
import { useTabInView } from './useTabInView';

type Tab = 'stock' | 'order' | 'suppliers' | 'products';

/** Where each feature of this screen lives, so a jump from the feature overview opens the right tab. */
const TAB_OF: Record<string, Tab> = {
  'n.location': 'stock',
  'n.past': 'stock',
  'n.order': 'order',
  'n.suppliers': 'suppliers',
  'm.list': 'products',
};

/** Voorraad: stock per location, the order list, suppliers and the product list. */
export function StockScreen() {
  const { t } = useI18n();
  const { target, go, now } = usePraktijk();
  const money = useMoney();
  const { stock, info, orders, booked, products } = useStock();
  const [tab, setTab] = useState<Tab>('stock');
  useTabInView(tab);

  useEffect(() => {
    const next = target?.feature ? TAB_OF[target.feature] : undefined;
    if (next) setTab(next);
  }, [target?.at]);

  let purchase = 0;
  let sale = 0;
  let low = 0;
  for (const p of products) {
    for (const l of LOCATIONS) {
      const n = stock[l.id][p.id];
      purchase += n * info[p.id].purchase;
      sale += n * info[p.id].price;
      if (!p.soldOut && n < info[p.id].min[l.id]) low++;
    }
  }
  const today = booked.filter((m) => sameDay(m.at, now)).length;

  return (
    <div className="pk-stack pk-st">
      <div className="pk-st-access" data-feature="n.access">
        <PkIcon name="lock" size={17} />
        <p>{t('pk.voorraad.access')}</p>
        <button className="btn btn-ghost btn-small" onClick={() => go('team', { feature: 's.profiles' })}>
          {t('pk.voorraad.accessLink')}
          <PkIcon name="arrow" size={14} />
        </button>
      </div>

      <div className="pk-stats">
        <Stat label={t('pk.voorraad.statValue')} value={money(purchase)} sub={t('pk.voorraad.statValueSub', { amount: money(sale) })} />
        <Stat
          label={t('pk.voorraad.statLow')}
          value={low}
          sub={t('pk.voorraad.statLowSub', { n: PRODUCTS.length * LOCATIONS.length })}
          tone={low ? 'bad' : 'good'}
        />
        <Stat label={t('pk.voorraad.statOnWay')} value={orders.filter((o) => !o.receivedAt).length} sub={t('pk.voorraad.statOnWaySub')} />
        <Stat label={t('pk.voorraad.statMoves')} value={today} sub={t('pk.voorraad.statMovesSub')} />
      </div>

      <Seg
        variant="tabs"
        label={t('pk.voorraad.tabs')}
        value={tab}
        onChange={setTab}
        options={[
          { value: 'stock', label: t('pk.voorraad.tab.stock'), icon: 'box' },
          { value: 'order', label: t('pk.voorraad.tab.order'), icon: 'truck' },
          { value: 'suppliers', label: t('pk.voorraad.tab.suppliers'), icon: 'building' },
          { value: 'products', label: t('pk.voorraad.tab.products'), icon: 'barcode' },
        ]}
      />

      {tab === 'stock' ? <Levels /> : tab === 'order' ? <Orders /> : tab === 'suppliers' ? <Suppliers /> : <Products />}
    </div>
  );
}
