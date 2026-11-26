import { productById, type Product } from '@pure-clinics/shared';

/**
 * One line in the cart, in the same shape as on Pure's website (key pure-web-cart), so a cart started on the site
 * is still there in the app: a care product, or a gift card with what you pay (`amount`), what it is worth in the
 * clinic (`value`), and optionally for whom and a short message.
 */
export type CartLine = {
  kind: 'product' | 'giftcard';
  id: string;
  qty: number;
  amount?: number;
  value?: number;
  to?: string;
  message?: string;
};

export const sameLine = (a: CartLine, b: CartLine) =>
  a.kind === b.kind && a.id === b.id && (a.amount ?? 0) === (b.amount ?? 0) && (a.to ?? '') === (b.to ?? '') && (a.message ?? '') === (b.message ?? '');

/** Prices as Huidly sells them right now, when known; otherwise the app's own catalogue. */
export type PriceList = Record<string, number>;

export function lineProduct(line: CartLine): Product | undefined {
  return line.kind === 'product' ? productById(line.id) : undefined;
}

/** The price of one item on a line, in euros. */
export function linePrice(line: CartLine, prices?: PriceList): number {
  if (line.kind === 'giftcard') return line.amount ?? 0;
  return prices?.[line.id] ?? productById(line.id)?.price ?? 0;
}

const cents = (amount: number) => Math.round(amount * 100) / 100;

export function cartTotals(lines: CartLine[], shippingFee: number, prices?: PriceList) {
  const subtotal = cents(lines.reduce((sum, l) => sum + linePrice(l, prices) * l.qty, 0));
  return { subtotal, shipping: shippingFee, total: cents(subtotal + shippingFee), count: lines.reduce((n, l) => n + l.qty, 0) };
}

/** What a gift card adds on top: its value in the clinic minus what you pay. */
export const lineBonus = (line: CartLine) => (line.kind === 'giftcard' && line.value != null && line.amount != null ? Math.max(0, line.value - line.amount) : 0);
