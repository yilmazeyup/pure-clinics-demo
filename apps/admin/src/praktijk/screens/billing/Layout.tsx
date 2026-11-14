import { useI18n } from '../../../i18n';
import { usePraktijk } from '../../context';
import { ACCENTS, DEFAULT_LAYOUT, type InvoiceLayout } from '../../data/billing';
import { PkIcon } from '../../icons';
import { Card, Field, Seg, Toggle } from '../../kit';
import { InvoiceDoc } from './InvoiceDoc';
import type { Billing } from './state';

/** The look of every invoice: where the wordmark sits, the accent, the closing line and which registrations show. */
export function LayoutTab({ billing }: { billing: Billing }) {
  const { t } = useI18n();
  const { demo } = usePraktijk();
  const { layout, setLayout } = billing;
  const set = (change: Partial<InvoiceLayout>) => setLayout((l) => ({ ...l, ...change }));
  // The preview shows a recent invoice with a product on it, so every part of the layout is visible.
  const sample =
    [...billing.invoices].reverse().find((i) => i.status === 'paid' && i.kind === 'invoice' && i.lines.length > 1) ??
    [...billing.invoices].reverse().find((i) => i.status === 'paid')!;

  return (
    <div className="pk-grid">
      <Card className="span-5" eyebrow={t('pk.facturen.layout.eyebrow')} title={t('pk.facturen.layout.title')} help={t('pk.facturen.layout.help')} feature="i.layout">
        <div className="pk-stack">
          <Field label={t('pk.facturen.layout.logo')}>
            <Seg
              value={layout.logo}
              onChange={(logo) => set({ logo })}
              label={t('pk.facturen.layout.logo')}
              options={[
                { value: 'start', label: t('pk.facturen.layout.start') },
                { value: 'center', label: t('pk.facturen.layout.center') },
                { value: 'end', label: t('pk.facturen.layout.end') },
              ]}
            />
          </Field>
          <div className="pk-field">
            <span className="pk-field-label">{t('pk.facturen.layout.accent')}</span>
            <div className="pk-row" role="radiogroup" aria-label={t('pk.facturen.layout.accent')}>
              {ACCENTS.map((c) => (
                <button
                  key={c}
                  type="button"
                  role="radio"
                  aria-checked={layout.accent === c}
                  aria-label={c}
                  className="pk-bi-swatch"
                  style={{ background: c }}
                  onClick={() => set({ accent: c })}
                />
              ))}
            </div>
          </div>
          <Field label={t('pk.facturen.layout.footer')} hint={t('pk.facturen.layout.footerHint')}>
            <textarea
              className="pk-input"
              rows={3}
              value={layout.footer ?? t('pk.facturen.doc.footer', { term: layout.term })}
              onChange={(e) => set({ footer: e.target.value })}
            />
          </Field>
          <Field label={t('pk.facturen.layout.term')}>
            <select className="pk-input" value={layout.term} onChange={(e) => set({ term: Number(e.target.value) })}>
              {[7, 14, 30].map((d) => (
                <option key={d} value={d}>
                  {t('pk.facturen.layout.days', { n: d })}
                </option>
              ))}
            </select>
          </Field>
          <div>
            <Toggle checked={layout.showAgb} onChange={(showAgb) => set({ showAgb })} label={t('pk.facturen.layout.agb')} />
            <Toggle checked={layout.showKvk} onChange={(showKvk) => set({ showKvk })} label={t('pk.facturen.layout.kvk')} />
            <Toggle checked={layout.showIban} onChange={(showIban) => set({ showIban })} label={t('pk.facturen.layout.iban')} />
          </div>
          <div className="pk-row">
            <button type="button" className="btn btn-primary" onClick={() => demo(t('pk.common.demoSaved'))}>
              <PkIcon name="check" size={16} />
              {t('pk.common.save')}
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => setLayout(DEFAULT_LAYOUT)}>
              <PkIcon name="undo" size={16} />
              {t('pk.facturen.layout.reset')}
            </button>
          </div>
        </div>
      </Card>
      <div className="span-7 pk-bi-layoutpreview">
        <span className="eyebrow">{t('pk.facturen.layout.preview')}</span>
        {sample ? <InvoiceDoc invoice={sample} layout={layout} /> : null}
      </div>
    </div>
  );
}
