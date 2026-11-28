import './live.css';
import { LOCATIONS, type LocationId } from '@pure-clinics/shared';
import { useState } from 'react';

import { HuidlyConnect, HuidlyConnected } from '../../huidly/Connect';
import { useHuidlyTeam } from '../../huidly/client';
import { useI18n } from '../../i18n';
import { cityOf } from '../data/core';
import { Card, Chip, TableWrap, useMoney } from '../kit';
import { clinicWhen, live, useLive, type LiveOrder, type LiveStock, type OrderStatus } from './api';

const STATUSES: OrderStatus[] = ['new', 'ready', 'shipped', 'done', 'cancelled'];

/**
 * Webshop & voorraad: the real orders from Pure's own site and app (marked site or app) and the stock the shop sells
 * from. They come in at Huidly; without the team's Huidly connection in this browser the screen asks for it first, and
 * the demo webshop below stays as it is.
 */
export function ShopOrders() {
  const { t } = useI18n();
  const team = useHuidlyTeam();
  const orders = useLive(live.orders);
  const stock = useLive(live.stock);
  if (!team) return <HuidlyConnect what={t('hy.why.shop')} />;
  if (orders.status !== 'ready' || !orders.data) return null;
  return (
    <div className="pk-live">
      <HuidlyConnected />
      <Orders
        list={orders.data}
        update={async (id, body) => {
          const next = await live.updateOrder(id, body);
          orders.set((orders.data ?? []).map((o) => (o.id === id ? next : o)));
          if (body.status === 'cancelled') stock.reload();
        }}
      />
      {stock.status === 'ready' && stock.data ? <Stock list={stock.data} save={async (body) => stock.set(await live.setStock(body))} /> : null}
    </div>
  );
}

const cityName = (id: string) => (LOCATIONS.some((l) => l.id === id) ? cityOf(id as LocationId) : id);

function Orders({ list, update }: { list: LiveOrder[]; update: (id: string, body: { status?: OrderStatus; paid?: boolean; track?: string }) => Promise<void> }) {
  const { t, text, locale } = useI18n();
  const money = useMoney();
  const [failed, setFailed] = useState<string | null>(null);
  const act = (id: string, body: Parameters<typeof update>[1]) => {
    setFailed(null);
    update(id, body).catch(() => setFailed(id));
  };
  const waiting = list.filter((o) => o.status === 'new').length;

  return (
    <Card eyebrow={t('pk.live.orders.eyebrow')} title={t('pk.live.orders.title')} help={t('pk.live.orders.help')} feature="w.live" actions={waiting ? <Chip tone="warn">{t('pk.live.orders.waiting', { n: waiting })}</Chip> : null}>
      {list.length ? (
        <TableWrap label={t('pk.live.orders.title')}>
          <table className="pk-table pk-live-table">
            <thead>
              <tr>
                <th>{t('pk.live.orders.number')}</th>
                <th>{t('pk.common.client')}</th>
                <th>{t('pk.live.orders.items')}</th>
                <th>{t('pk.live.orders.delivery')}</th>
                <th className="end">{t('pk.live.orders.total')}</th>
                <th>{t('pk.common.status')}</th>
              </tr>
            </thead>
            <tbody>
              {list.map((o) => (
                <tr key={o.id} className={o.status === 'cancelled' ? 'pk-live-off' : ''}>
                  <td className="nowrap">
                    <strong>{o.number}</strong>
                    <small className="pk-live-sub">
                      {clinicWhen(o.createdAt, locale)} · {t(o.channel === 'app' ? 'pk.live.channel.app' : 'pk.live.channel.site')}
                    </small>
                  </td>
                  <td>
                    {o.client.name || o.client.email}
                    <small className="pk-live-sub">
                      {o.client.email}
                      {o.client.phone ? ` · ${o.client.phone}` : ''}
                    </small>
                  </td>
                  <td>
                    {o.items.map((i) => (
                      <span key={i.product} className="pk-live-line">
                        {i.qty} × {(i.name && text(i.name)) || i.product}
                      </span>
                    ))}
                    {o.giftCards.map((g) => (
                      <span key={g.id} className="pk-live-line">
                        {g.qty} × {text(g.name)}
                        {g.to ? ` · ${t('pk.live.orders.for', { name: g.to })}` : ''}
                      </span>
                    ))}
                    {o.note ? <small className="pk-live-sub pk-live-note">“{o.note}”</small> : null}
                  </td>
                  <td>
                    {o.delivery.method === 'pickup'
                      ? t('pk.live.orders.pickup', { city: cityName(o.delivery.location) })
                      : t('pk.live.orders.post', { city: o.delivery.address.city })}
                    {o.delivery.method === 'post' ? (
                      <small className="pk-live-sub">
                        {o.delivery.address.name}, {o.delivery.address.street}, {o.delivery.address.postcode} {o.delivery.address.city} ({o.delivery.address.country})
                      </small>
                    ) : null}
                  </td>
                  <td className="end nowrap">
                    {money(o.total)}
                    <small className="pk-live-sub">
                      <label className="pk-live-paid">
                        <input type="checkbox" checked={o.payment.status === 'paid'} disabled={o.status === 'cancelled'} onChange={(e) => act(o.id, { paid: e.target.checked })} />
                        {o.payment.status === 'paid'
                          ? t('pk.live.orders.paid')
                          : t(o.payment.method === 'in-clinic' ? 'pk.live.orders.inClinic' : 'pk.live.orders.request')}
                      </label>
                    </small>
                  </td>
                  <td>
                    <select className="pk-input pk-input--small" value={o.status} disabled={o.status === 'cancelled'} onChange={(e) => act(o.id, { status: e.target.value as OrderStatus })} aria-label={t('pk.common.status')}>
                      {STATUSES.filter((s) => s !== 'ready' || o.delivery.method === 'pickup')
                        .filter((s) => s !== 'shipped' || o.delivery.method === 'post')
                        .map((s) => (
                          <option key={s} value={s}>
                            {t(`pk.live.orders.st.${s}`)}
                          </option>
                        ))}
                    </select>
                    {o.delivery.method === 'post' && o.status !== 'cancelled' ? (
                      <input
                        className="pk-input pk-input--small pk-live-track"
                        placeholder={t('pk.live.orders.track')}
                        defaultValue={o.track ?? ''}
                        maxLength={60}
                        onBlur={(e) => e.target.value !== (o.track ?? '') && act(o.id, { track: e.target.value })}
                      />
                    ) : null}
                    {failed === o.id ? <small className="pk-live-failed">{t('pk.live.failed')}</small> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      ) : (
        <p className="pk-muted">{t('pk.live.orders.empty')}</p>
      )}
    </Card>
  );
}

function Stock({ list, save }: { list: LiveStock[]; save: (body: { product: string; hidden?: boolean }) => Promise<void> }) {
  const { t, text } = useI18n();
  const money = useMoney();
  const [failed, setFailed] = useState<string | null>(null);
  const act = (product: string, body: { hidden?: boolean }) => {
    setFailed(null);
    save({ product, ...body }).catch(() => setFailed(product));
  };
  return (
    <Card eyebrow={t('pk.live.orders.eyebrow')} title={t('pk.live.stock.title')} help={t('pk.live.stock.help')} feature="w.liveStock">
      <TableWrap label={t('pk.live.stock.title')}>
        <table className="pk-table pk-live-table">
          <thead>
            <tr>
              <th>{t('pk.live.stock.product')}</th>
              <th className="end">{t('pk.common.price')}</th>
              <th className="end">{t('pk.live.stock.count')}</th>
              <th>{t('pk.live.stock.shown')}</th>
            </tr>
          </thead>
          <tbody>
            {list.map((p) => (
              <tr key={p.product} className={p.hidden ? 'pk-live-off' : ''}>
                <td>
                  {p.brand ? <small className="pk-live-sub">{p.brand}</small> : null}
                  {text(p.name)}
                </td>
                <td className="end nowrap">{money(p.price)}</td>
                <td className="end">
                  {/* The one stock, counted in Voorraad & inkoop: both clinics together, each apart underneath. */}
                  <span className={`pk-live-count ${p.stock <= 3 ? 'pk-live-low' : ''}`}>{p.stock}</span>
                  <small className="pk-live-sub">{LOCATIONS.map((l) => `${l.city} ${p.byLocation?.[l.id] ?? 0}`).join(' · ')}</small>
                  {failed === p.product ? <small className="pk-live-failed">{t('pk.live.failed')}</small> : null}
                </td>
                <td>
                  <label className="pk-live-paid">
                    <input type="checkbox" checked={!p.hidden} onChange={(e) => act(p.product, { hidden: !e.target.checked })} />
                    {t(p.hidden ? 'pk.live.stock.hidden' : 'pk.live.stock.onSale')}
                  </label>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableWrap>
    </Card>
  );
}
