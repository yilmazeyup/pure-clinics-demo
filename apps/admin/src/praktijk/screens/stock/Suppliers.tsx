import { LOCATIONS, type LocationId, type ProductId } from '@pure-clinics/shared';
import { useState } from 'react';

import { useI18n } from '../../../i18n';
import { usePraktijk } from '../../context';
import type { Supplier } from '../../data/stock';
import { PkIcon } from '../../icons';
import { Card, Chip, Field, Kv, Modal, TableWrap, Toggle, isolate, useMoney } from '../../kit';
import { useProductName, useStock } from './common';

const BLANK: Supplier = { id: '', name: '', contact: '', email: '', phone: '', leadDays: 3, auto: false };

/**
 * Suppliers with their products: purchase price and the minimum per location, edited in place. A new supplier can be
 * added; per supplier the request e-mail goes by itself or waits for a look and a click.
 */
export function Suppliers() {
  const { t, pct } = useI18n();
  const { demo } = usePraktijk();
  const money = useMoney();
  const name = useProductName();
  const { suppliers, setSuppliers, info, setInfo, products } = useStock();
  const [editing, setEditing] = useState<Supplier | null>(null);
  const setAuto = (id: string, auto: boolean) => setSuppliers((list) => list.map((s) => (s.id === id ? { ...s, auto } : s)));

  const setPurchase = (id: ProductId, value: number) => setInfo((i) => ({ ...i, [id]: { ...i[id], purchase: Math.max(0, value) } }));
  const setMin = (id: ProductId, l: LocationId, value: number) =>
    setInfo((i) => ({ ...i, [id]: { ...i[id], min: { ...i[id].min, [l]: Math.max(0, Math.round(value)) } } }));

  return (
    <Card
      eyebrow={t('pk.voorraad.suppliers.eyebrow')}
      title={t('pk.voorraad.suppliers.title')}
      help={t('pk.voorraad.suppliers.help')}
      feature="n.suppliers"
      actions={
        <button className="btn btn-ghost btn-small" onClick={() => setEditing(BLANK)}>
          <PkIcon name="plus" size={14} />
          {t('pk.voorraad.suppliers.add')}
        </button>
      }
    >
      <div className="pk-st-suppliers">
        {suppliers.map((s) => {
          const own = products.filter((p) => info[p.id].supplier === s.id);
          return (
            <section key={s.id} className="pk-st-supplier">
              <div className="pk-row pk-row--between">
                <span className="pk-row">
                  <h3 className="pk-subtitle pk-st-inline">{s.name}</h3>
                  {s.auto ? (
                    <Chip tone="good" icon="send">
                      {t('pk.voorraad.mode.auto')}
                    </Chip>
                  ) : (
                    <Chip tone="neutral">{t('pk.voorraad.mode.manual')}</Chip>
                  )}
                </span>
                <button className="btn btn-ghost btn-small" onClick={() => setEditing(s)}>
                  <PkIcon name="edit" size={14} />
                  {t('pk.common.edit')}
                </button>
              </div>
              <div className="pk-st-supplier-info">
                <Kv
                  rows={[
                    [t('pk.voorraad.suppliers.contact'), s.contact],
                    [t('pk.voorraad.suppliers.email'), <span className="pk-mono">{s.email}</span>],
                    [t('pk.voorraad.suppliers.phone'), <span className="pk-mono">{s.phone}</span>],
                    [t('pk.voorraad.suppliers.lead'), s.leadDays],
                  ]}
                />
                <div className="pk-st-mode">
                  <Toggle checked={s.auto} onChange={(on) => setAuto(s.id, on)} label={t('pk.voorraad.mode.toggle')} hint={t('pk.voorraad.mode.toggleHint')} />
                </div>
              </div>
              {own.length ? null : <p className="pk-muted pk-small">{t('pk.voorraad.suppliers.noProducts')}</p>}
              {own.length ? (
              <TableWrap label={s.name}>
                <table className="pk-table pk-st-supplier-table pk-cards">
                  <thead>
                    <tr>
                      <th>{t('pk.voorraad.levels.product')}</th>
                      <th className="end">{t('pk.voorraad.levels.purchase')}</th>
                      {LOCATIONS.map((l) => (
                        <th key={l.id} className="end">
                          {t('pk.voorraad.suppliers.minCity', { city: isolate(l.city) })}
                        </th>
                      ))}
                      <th className="end">{t('pk.voorraad.suppliers.margin')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {own.map((p) => {
                      const d = info[p.id];
                      const net = d.price / (1 + d.vat / 100);
                      return (
                        <tr key={p.id}>
                          <td className="pk-cell-main">
                            {name(p.id)}
                            <small className="pk-muted pk-st-block">{money(d.price)}</small>
                          </td>
                          <td className="end" data-label={t('pk.voorraad.levels.purchase')}>
                            <input
                              type="number"
                              step="0.01"
                              min={0}
                              className="pk-input pk-st-price"
                              aria-label={`${t('pk.voorraad.levels.purchase')} · ${name(p.id)}`}
                              value={d.purchase}
                              onChange={(e) => setPurchase(p.id, Number(e.target.value) || 0)}
                            />
                          </td>
                          {LOCATIONS.map((l) => (
                            <td key={l.id} className="end" data-label={t('pk.voorraad.suppliers.minCity', { city: l.city })}>
                              <input
                                type="number"
                                min={0}
                                className="pk-input pk-st-qty"
                                aria-label={`${t('pk.voorraad.suppliers.minCity', { city: l.city })} · ${name(p.id)}`}
                                value={d.min[l.id]}
                                onChange={(e) => setMin(p.id, l.id, Number(e.target.value) || 0)}
                              />
                            </td>
                          ))}
                          <td className="end pk-num" data-label={t('pk.voorraad.suppliers.margin')}>
                            {net > 0 ? pct((net - d.purchase) / net) : '–'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </TableWrap>
              ) : null}
            </section>
          );
        })}
      </div>

      {editing ? (
        <EditSupplier
          supplier={editing}
          onClose={() => setEditing(null)}
          onSave={(next) => {
            if (next.id) setSuppliers((list) => list.map((s) => (s.id === next.id ? next : s)));
            else {
              setSuppliers((list) => [...list, { ...next, id: `sup-${Date.now()}` }]);
              demo(t('pk.voorraad.suppliers.added', { name: next.name }));
            }
            setEditing(null);
            if (next.id) demo(t('pk.common.demoSaved'));
          }}
        />
      ) : null}
    </Card>
  );
}

function EditSupplier({ supplier, onClose, onSave }: { supplier: Supplier; onClose: () => void; onSave: (s: Supplier) => void }) {
  const { t } = useI18n();
  const [form, setForm] = useState(supplier);
  const text = (key: 'name' | 'contact' | 'email' | 'phone', label: string) => (
    <Field label={label}>
      <input className="pk-input" value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} />
    </Field>
  );
  return (
    <Modal
      open
      title={supplier.id ? t('pk.voorraad.suppliers.edit') : t('pk.voorraad.suppliers.add')}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>
            {t('pk.common.cancel')}
          </button>
          <button className="btn btn-primary" disabled={!form.name.trim() || !form.email.includes('@')} onClick={() => onSave(form)}>
            {t('pk.common.save')}
          </button>
        </>
      }
    >
      <div className="pk-form">
        {text('name', t('pk.voorraad.suppliers.name'))}
        {text('contact', t('pk.voorraad.suppliers.contact'))}
        {text('email', t('pk.voorraad.suppliers.email'))}
        {text('phone', t('pk.voorraad.suppliers.phone'))}
        <Field label={t('pk.voorraad.suppliers.lead')}>
          <input
            type="number"
            min={1}
            max={20}
            className="pk-input"
            value={form.leadDays}
            onChange={(e) => setForm({ ...form, leadDays: Math.max(1, Math.round(Number(e.target.value) || 1)) })}
          />
        </Field>
      </div>
      <Toggle checked={form.auto} onChange={(auto) => setForm({ ...form, auto })} label={t('pk.voorraad.mode.toggle')} hint={t('pk.voorraad.mode.toggleHint')} />
      {supplier.id ? null : <p className="pk-muted pk-small">{t('pk.voorraad.suppliers.addHint')}</p>}
    </Modal>
  );
}
