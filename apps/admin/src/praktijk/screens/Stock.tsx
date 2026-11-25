import { LOCATIONS, PRODUCTS, type LocationId, type ProductId } from '@pure-clinics/shared';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { useI18n } from '../../i18n';
import { usePraktijk } from '../context';
import { PkIcon } from '../icons';
import { Seg, Stat, useMoney } from '../kit';
import { cityOf, StockUiContext, useProductName, useStock, type StockUi } from './stock/common';
import { Forecast } from './stock/Forecast';
import { Levels } from './stock/Levels';
import { Orders } from './stock/Orders';
import { ProductView, SidePanel } from './stock/Panel';
import { Products } from './stock/Products';
import { Reviews } from './stock/Reviews';
import { Shelf } from './stock/Shelf';
import { Suppliers } from './stock/Suppliers';
import './responsive.css';
import './Stock.css';
import { useTabInView } from './useTabInView';

type Tab = 'stock' | 'forecast' | 'order' | 'suppliers' | 'reviews' | 'products';

/** Where each feature of this screen lives, so a jump from the feature overview opens the right tab. */
const TAB_OF: Record<string, Tab> = {
  'n.location': 'stock',
  'n.past': 'stock',
  'n.order': 'order',
  'more.request': 'order',
  'n.suppliers': 'suppliers',
  'more.forecast': 'forecast',
  'more.sales': 'forecast',
  'more.reviews': 'reviews',
  'm.list': 'products',
};

/**
 * Webshop & voorraad: one stock per clinic, with the webshop's sales counted in (an order goes out of the nearest
 * clinic's stock). On top the shelf in 3D; below it the stock, what sold and when it runs out, the request list with
 * its e-mails, the suppliers, the reviews and the product list.
 */
export function StockScreen() {
  const { t } = useI18n();
  const { target, go, demo } = usePraktijk();
  const money = useMoney();
  const name = useProductName();
  const { stock, info, orders, products, forecast, request, requests } = useStock();
  const [tab, setTab] = useState<Tab>('stock');
  const [product, setProduct] = useState<ProductId | null>(null);
  useTabInView(tab);

  useEffect(() => {
    const next = target?.feature ? TAB_OF[target.feature] : undefined;
    if (next) setTab(next);
  }, [target?.at]);

  const ask = useCallback(
    (id: ProductId, locationId?: LocationId) => {
      const where = request(id, locationId);
      demo(t('pk.voorraad.ask.added', { product: name(id), city: cityOf(where) }));
    },
    [request, demo, t, name],
  );
  const ui = useMemo<StockUi>(() => ({ openProduct: setProduct, ask }), [ask]);

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
  const soon = forecast.filter((f) => f.bucket === 'out' || f.bucket === 'week').length;

  return (
    <StockUiContext.Provider value={ui}>
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
          <Stat label={t('pk.voorraad.statSoon')} value={soon} sub={t('pk.voorraad.statSoonSub')} />
          <Stat
            label={t('pk.voorraad.statOnWay')}
            value={orders.filter((o) => !o.receivedAt).length}
            sub={requests.length ? t('pk.voorraad.statAsked', { n: requests.length }) : t('pk.voorraad.statOnWaySub')}
          />
        </div>

        <Shelf />

        <Seg
          variant="tabs"
          label={t('pk.voorraad.tabs')}
          value={tab}
          onChange={setTab}
          options={[
            { value: 'stock', label: t('pk.voorraad.tab.stock'), icon: 'box' },
            { value: 'forecast', label: t('pk.voorraad.tab.forecast'), icon: 'chart' },
            { value: 'order', label: requests.length ? `${t('pk.voorraad.tab.order')} · ${requests.length}` : t('pk.voorraad.tab.order'), icon: 'truck' },
            { value: 'suppliers', label: t('pk.voorraad.tab.suppliers'), icon: 'building' },
            { value: 'reviews', label: t('pk.voorraad.tab.reviews'), icon: 'thumb' },
            { value: 'products', label: t('pk.voorraad.tab.products'), icon: 'barcode' },
          ]}
        />

        {tab === 'stock' ? (
          <Levels />
        ) : tab === 'forecast' ? (
          <Forecast />
        ) : tab === 'order' ? (
          <Orders />
        ) : tab === 'suppliers' ? (
          <Suppliers />
        ) : tab === 'reviews' ? (
          <Reviews />
        ) : (
          <Products />
        )}

        <SidePanel open={product !== null} onClose={() => setProduct(null)} label={product ? name(product) : ''}>
          {product ? <ProductView key={product} id={product} /> : null}
        </SidePanel>
      </div>
    </StockUiContext.Provider>
  );
}
