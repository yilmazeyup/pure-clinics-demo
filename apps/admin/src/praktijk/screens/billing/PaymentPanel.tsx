import { useState } from 'react';

import { useI18n } from '../../../i18n';
import { usePraktijk, useShared } from '../../context';
import { groupCode, PAY_METHODS, round2, type PayMethod, type Payment } from '../../data/billing';
import { seedGiftCards, type GiftCard } from '../../data/shared';
import { PkIcon, type PkIconName } from '../../icons';
import { Chip, Toggle, useMoney } from '../../kit';
import { METHOD_KEY } from './format';

const ICON: Record<PayMethod, PkIconName> = {
  pin: 'card',
  cash: 'cash',
  account: 'file',
  debit: 'refresh',
  credit: 'card',
  ideal: 'phone',
  gift: 'gift',
};

/** "12,50", "12.50" or "12" as a number of euros. */
export const parseAmount = (text: string) => {
  const n = Number(text.replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
};

/**
 * How an amount is paid at the desk: one of six methods, a gift card by its code, or split over two methods. "On
 * account" leaves the invoice open for a bank transfer.
 */
export function PaymentPanel({ amount, onPay, disabled }: { amount: number; onPay: (payments: Payment[], onAccount: boolean) => void; disabled?: boolean }) {
  const { t } = useI18n();
  const { today, now } = usePraktijk();
  const money = useMoney();
  const [cards] = useShared<GiftCard[]>('giftcards', () => seedGiftCards(today));
  const [method, setMethod] = useState<PayMethod>('pin');
  const [split, setSplit] = useState(false);
  const [first, setFirst] = useState('');
  const [second, setSecond] = useState<Exclude<PayMethod, 'gift'>>('cash');
  const [code, setCode] = useState('');
  const [checked, setChecked] = useState<GiftCard | null | 'none'>(null);

  const card = checked && checked !== 'none' ? (cards.find((c) => c.code === checked.code) ?? checked) : null;
  const giftPart = method === 'gift' && card && card.final ? round2(Math.min(card.balance, amount)) : 0;
  const firstPart = method === 'gift' ? giftPart : split ? round2(Math.min(amount, Math.max(0, parseAmount(first || String(amount / 2))))) : amount;
  const rest = round2(amount - firstPart);
  const needsSecond = method === 'gift' ? rest > 0.004 : split;
  const ready = !disabled && amount > 0 && (method !== 'gift' || giftPart > 0);

  const check = () => {
    const found = cards.find((c) => c.code === code.replace(/\D/g, ''));
    setChecked(found ?? 'none');
  };

  const submit = () => {
    const payments: Payment[] = [];
    let onAccount = false;
    if (method === 'account') onAccount = true;
    else if (firstPart > 0) payments.push({ method, amount: firstPart, at: now, code: method === 'gift' ? card?.code : undefined });
    if (needsSecond && rest > 0) {
      if (second === 'account') onAccount = true;
      else payments.push({ method: second, amount: rest, at: now });
    }
    onPay(payments, onAccount);
    setChecked(null);
    setCode('');
    setSplit(false);
    setFirst('');
  };

  return (
    <div className="pk-bi-pay" data-feature="i.methods">
      <span className="pk-field-label">{t('pk.facturen.pay.title')}</span>
      <div className="pk-bi-methods" role="radiogroup" aria-label={t('pk.facturen.pay.title')}>
        {[...PAY_METHODS, 'gift' as const].map((m) => (
          <button
            key={m}
            type="button"
            role="radio"
            aria-checked={method === m}
            data-feature={m === 'gift' ? 'i.giftpay' : undefined}
            onClick={() => {
              setMethod(m);
              if (m === 'gift') setSplit(false);
            }}
          >
            <PkIcon name={ICON[m]} size={16} />
            {t(METHOD_KEY[m])}
          </button>
        ))}
      </div>

      {method === 'gift' ? (
        <div className="pk-bi-gift">
          <div className="pk-row">
            <input
              className="pk-input pk-mono"
              inputMode="numeric"
              maxLength={9}
              placeholder="0000 0000"
              aria-label={t('pk.facturen.gift.code')}
              value={code}
              onChange={(e) => {
                setCode(e.target.value);
                setChecked(null);
              }}
              onKeyDown={(e) => e.key === 'Enter' && check()}
            />
            <button type="button" className="btn btn-ghost btn-small" onClick={check} disabled={code.replace(/\D/g, '').length !== 8}>
              {t('pk.facturen.gift.check')}
            </button>
          </div>
          {checked === 'none' ? (
            <Chip tone="bad">{t('pk.facturen.gift.unknown')}</Chip>
          ) : card ? (
            <div className="pk-row">
              <Chip tone={card.final && card.balance > 0 ? 'good' : 'warn'}>
                {!card.final
                  ? t('pk.facturen.gift.notFinal')
                  : t('pk.facturen.gift.balance', { code: groupCode(card.code), amount: money(card.balance) })}
              </Chip>
              {giftPart > 0 && rest > 0 ? <span className="pk-small pk-muted">{t('pk.facturen.gift.rest', { amount: money(rest) })}</span> : null}
            </div>
          ) : (
            <span className="pk-small pk-muted">{t('pk.facturen.gift.hint')}</span>
          )}
        </div>
      ) : null}

      <div data-feature="i.split">
        {method !== 'gift' ? (
          <Toggle checked={split} onChange={setSplit} label={t('pk.facturen.pay.split')} hint={t('pk.facturen.pay.splitHint')} />
        ) : null}
        {needsSecond ? (
          <div className="pk-bi-split">
            {method !== 'gift' ? (
              <label className="pk-field">
                <span className="pk-field-label">{t(METHOD_KEY[method])}</span>
                <input className="pk-input pk-num" inputMode="decimal" value={first || String(round2(amount / 2)).replace('.', ',')} onChange={(e) => setFirst(e.target.value)} />
              </label>
            ) : (
              <label className="pk-field">
                <span className="pk-field-label">{t(METHOD_KEY.gift)}</span>
                <span className="pk-bi-split-fixed">{money(giftPart)}</span>
              </label>
            )}
            <label className="pk-field">
              <span className="pk-field-label">{t('pk.facturen.pay.second')}</span>
              <select className="pk-input" value={second} onChange={(e) => setSecond(e.target.value as Exclude<PayMethod, 'gift'>)}>
                {PAY_METHODS.filter((m) => m !== method).map((m) => (
                  <option key={m} value={m}>
                    {t(METHOD_KEY[m])}
                  </option>
                ))}
              </select>
            </label>
            <label className="pk-field">
              <span className="pk-field-label">{t('pk.facturen.pay.rest')}</span>
              <span className="pk-bi-split-fixed">{money(rest)}</span>
            </label>
          </div>
        ) : null}
      </div>

      <button type="button" className="btn btn-primary pk-bi-paybtn" disabled={!ready} onClick={submit}>
        <PkIcon name="check" size={16} />
        {method === 'account' ? t('pk.facturen.pay.toAccount', { amount: money(amount) }) : t('pk.facturen.pay.register', { amount: money(amount) })}
      </button>
    </div>
  );
}
