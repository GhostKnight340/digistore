# Promo Codes & Ghost Credit

Customer-facing promotional codes with four reward types, plus a Ghost Credit
wallet ledger. Built on the existing checkout, cart, order, payment, and admin
subsystems — no parallel systems introduced.

## Reward types (exactly one per code)

| Type | Effect | Config |
| --- | --- | --- |
| `PERCENT_DISCOUNT` | % off the eligible subtotal, reduces the amount paid now | `percentValue` (+ optional `maxDiscountMad`) |
| `FIXED_DISCOUNT` | Fixed DH off the eligible subtotal | `fixedAmountMad` |
| `FIXED_GHOST_CREDIT` | Fixed DH of Ghost Credit granted **after** payment | `fixedAmountMad` (+ optional expiry) |
| `PERCENT_GHOST_CREDIT` | % of the eligible subtotal as Ghost Credit after payment | `percentValue` (+ optional `maxCreditMad`, expiry) |

A code can never combine an immediate discount **and** Ghost Credit.

## Money

Whole MAD integers everywhere (matching `Order.totalMad`). Percentages are
`Decimal(6,3)`. Rounding is `Math.round` to the nearest dirham (`roundMad`).
Customers see "DH"; internal currency stays MAD.

## Eligibility & mixed carts

- No product and no category links → the code applies to **all** lines.
- With links, a line is eligible if it matches a selected product **OR** a
  selected category (OR semantics; see `computeEligibility`).
- Discounts and percentage Ghost Credit are computed from the **eligible
  subtotal only**, never the full cart. Fixed discounts are clamped to the
  eligible subtotal (never negative) and allocated across eligible lines with a
  deterministic largest-remainder split (`allocateDiscount`), persisted in the
  order snapshot for refund accounting.

## Redemption lifecycle

1. **Reserve** — at order creation (`reservePromoInTx`, inside the order
   transaction). An atomic conditional `UPDATE` on `PromoCode.reservedUses`
   decides the final available use (race-safe). The immutable
   `OrderPromotionSnapshot` and a `reserved` `PromoRedemption` are written, and
   for discount codes `Order.totalMad`/`discountMad` are locked to the
   discounted amount.
2. **Finalize** — when the order reaches its successful paid state
   (`payment_confirmed`, via `applyPromoLifecycleForStatus`). The redemption
   becomes `finalized` and, for Ghost Credit codes, the credit is granted to the
   customer's wallet.
3. **Release** — when the order is cancelled/rejected. The `reserved`
   redemption becomes `released` and the usage slot is freed.

Ghost Credit is **only** granted at finalize — never on order creation. Nothing
is granted for cancelled, rejected, unpaid, expired, or failed orders.

## Idempotency

Every automated grant/reversal carries a unique `idempotencyKey`
(`promo-credit:{orderId}:{promoCodeId}`, `promo-reversal:{orderId}:{promoCodeId}:{seq}`),
so a duplicated PayPal webhook, a retried admin action, or a double completion
run can never double-grant, double-reverse, or double-count usage. All status
transitions are guarded by compare-and-set updates, mirroring the existing
PayPal/webhook idempotency pattern.

## Ghost Credit ledger

`GhostCreditTransaction` is append-only. Balance is derived from active rows
(credits `+`, debits `−`) and cached on `Customer.ghostCreditBalanceMad`, updated
strictly inside the same transaction as the ledger write (`grantCreditTx` /
`debitCreditTx`). Reversals are debits that offset an earlier credit; if part of
the credit was already spent, the case is flagged for admin review via a
`PromoCodeEvent` note rather than writing a negative balance. Ghost Credit
requires a logged-in customer — guest checkout shows a login/create-account
prompt and preserves the cart (localStorage).

## Order totals, payment & refunds

- The discounted total is locked into `Order.totalMad` at creation, so every
  payment surface (PayPal amount, bank/USDT instructions) and payment
  verification automatically use the correct amount — no per-provider changes.
- Ghost Credit never reduces the amount paid now.
- Snapshots are immutable: editing or disabling a code never alters historical
  orders.
- On refund, `reverseOrderPromotionCredit` reverses granted Ghost Credit
  (full by default; proportional to the refunded eligible amount when a partial
  amount is supplied). Immediate-discount refunds use the persisted per-line
  allocation (`refundableLineAmount`), never the undiscounted list price.

## Timezone

Validity windows are absolute instants; the admin enters times in the Ghost.ma
business timezone (Africa/Casablanca) and comparisons use absolute `Date`
instants.

## Key files

- `src/lib/promo/engine.ts` — pure logic (validation, eligibility, amounts,
  allocation, status, redeemability, reversal). Tested in `test/promo/engine.test.ts`.
- `src/lib/db/promoCodes.ts` — admin CRUD, checkout evaluation, in-tx reservation.
- `src/lib/db/promoLifecycle.ts` — finalize / release / reverse dispatch.
- `src/lib/db/ghostCredit.ts` + `ghostCreditAdmin.ts` — ledger + manual corrections.
- `src/components/admin/PromoCodesPanel.tsx` — admin "Codes promo" tab.
- `src/app/checkout/CheckoutClient.tsx` — checkout promo section.
- `src/app/account/wallet/page.tsx` — customer Ghost Credit wallet.
