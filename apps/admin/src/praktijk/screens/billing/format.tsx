import { LASER_ZONES, PRODUCTS, treatmentById } from '@pure-clinics/shared';

import { useI18n, type MessageKey } from '../../../i18n';
import { Chip, type Tone } from '../../kit';
import type { ClaimStatus, Invoice, InvoiceKind, LineRef, PayMethod } from '../../data/billing';

/** The words on an invoice line, in the reader's language; brands and codes stay as they are. */
export function useLineLabel() {
  const { t, text } = useI18n();
  return (ref: LineRef): string => {
    switch (ref.type) {
      case 'treatment':
        return text(treatmentById(ref.id).name);
      case 'product': {
        const p = PRODUCTS.find((x) => x.id === ref.id);
        return p ? (p.brand ? `${p.brand} ${text(p.name)}` : text(p.name)) : '';
      }
      case 'package': {
        const zone = LASER_ZONES.find((z) => z.id === ref.zone);
        return t('pk.facturen.line.package', { zone: zone ? text(zone.name) : ref.zone });
      }
      case 'giftcard':
        return t('pk.facturen.line.giftcard', { code: ref.code });
      case 'strip':
        return t('pk.facturen.line.strip', { treatment: { treatment: ref.id }, n: ref.strips, paid: ref.strips - 1 });
    }
  };
}

export const METHOD_KEY: Record<PayMethod, MessageKey> = {
  pin: 'pk.facturen.pay.pin',
  cash: 'pk.facturen.pay.cash',
  account: 'pk.facturen.pay.account',
  debit: 'pk.facturen.pay.debit',
  credit: 'pk.facturen.pay.credit',
  ideal: 'pk.facturen.pay.ideal',
  gift: 'pk.facturen.pay.gift',
};

export const KIND_KEY: Record<InvoiceKind, MessageKey> = {
  invoice: 'pk.facturen.kind.invoice',
  restitutie: 'pk.facturen.kind.restitutie',
  credit: 'pk.facturen.kind.credit',
  restnota: 'pk.facturen.kind.restnota',
  products: 'pk.facturen.kind.products',
};

const STATUS: Record<Invoice['status'], [MessageKey, Tone]> = {
  concept: ['pk.facturen.status.concept', 'outline'],
  open: ['pk.facturen.status.open', 'warn'],
  paid: ['pk.facturen.status.paid', 'good'],
  insurer: ['pk.facturen.status.insurer', 'brand'],
  credited: ['pk.facturen.status.credited', 'neutral'],
  writtenOff: ['pk.facturen.status.writtenOff', 'neutral'],
};

export function InvoiceStatus({ invoice }: { invoice: Invoice }) {
  const { t } = useI18n();
  const [key, tone] = invoice.kind === 'credit' ? (['pk.facturen.status.creditDone', 'neutral'] as [MessageKey, Tone]) : STATUS[invoice.status];
  return <Chip tone={tone}>{t(key)}</Chip>;
}

export const CLAIM_STATUS: Record<ClaimStatus, [MessageKey, Tone]> = {
  ready: ['pk.declaraties.status.ready', 'outline'],
  sent: ['pk.declaraties.status.sent', 'brand'],
  approved: ['pk.declaraties.status.approved', 'good'],
  partial: ['pk.declaraties.status.partial', 'warn'],
  rejected: ['pk.declaraties.status.rejected', 'bad'],
  credited: ['pk.declaraties.status.credited', 'neutral'],
  resubmitted: ['pk.declaraties.status.resubmitted', 'neutral'],
};

export function ClaimStatusChip({ status, side }: { status: ClaimStatus; side: 'debit' | 'credit' }) {
  const { t } = useI18n();
  if (side === 'credit' && status === 'approved') return <Chip tone="good">{t('pk.declaraties.status.processed')}</Chip>;
  const [key, tone] = CLAIM_STATUS[status];
  return <Chip tone={tone}>{t(key)}</Chip>;
}
