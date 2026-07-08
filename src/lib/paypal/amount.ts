import type { PaymentMethodDetails } from "@/lib/dto";

/** PayPal does not settle in MAD, so the store's PayPal method config
 * carries a fixed conversion (currency + MAD-per-unit rate). Defaults match
 * the same rough peg already used for the crypto/USDT display. */
const DEFAULT_PAYPAL_CURRENCY = "USD";
const DEFAULT_PAYPAL_EXCHANGE_RATE = 10; // MAD per 1 unit of currency

export interface PayPalAmount {
  value: string; // decimal string, e.g. "19.99"
  currency: string; // ISO 4217
}

/** Converts an order's MAD total into the PayPal method's settlement currency. */
export function computePayPalAmount(
  totalMad: number,
  details: PaymentMethodDetails,
): PayPalAmount {
  const currency = (details.paypalCurrency || DEFAULT_PAYPAL_CURRENCY).toUpperCase();
  const rate =
    details.paypalExchangeRate && details.paypalExchangeRate > 0
      ? details.paypalExchangeRate
      : DEFAULT_PAYPAL_EXCHANGE_RATE;
  const amount = Math.max(totalMad / rate, 0.01);
  return { value: amount.toFixed(2), currency };
}

/** Tolerant equality for amounts round-tripped through PayPal's decimal strings. */
export function amountsRoughlyEqual(a: PayPalAmount, b: PayPalAmount): boolean {
  if (a.currency.toUpperCase() !== b.currency.toUpperCase()) return false;
  return Math.abs(Number(a.value) - Number(b.value)) < 0.01;
}
