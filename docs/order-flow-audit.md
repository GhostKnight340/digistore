# Ghost.ma — Order & Payment Flow Audit (second pass)

_Date: 2026-07-16 · Branch: `staging` · Scope: the complete customer order/payment/
fulfilment flow and its admin side. Complements [`pre-launch-audit.md`](pre-launch-audit.md)._

Method: three read-only audit sweeps (checkout & live updates; digital-code
exposure & fulfilment; email templates & triggers) followed by targeted fixes.
`npx tsc --noEmit` ✅, `npm test` ✅ 240/240, `next build` ✅, no migrations.

---

## Findings & disposition

### Critical — FIXED

| ID | Finding | Fix |
|---|---|---|
| C1 | **Order IDOR** — `submitPayment`/`cancel`/`changeMethod`/PayPal actions took an `orderId` with no ownership check; the enumerable public number + DTO-leaked cuid let anyone act on any order. | Per-order `deliveryToken` minted at creation; new `authorizeOrderAccess()` authorizes by token / internal-id / logged-in owner on every customer order action. |
| C2 | **PII enumeration** — DTO returned name/email/cuid for any order resolved by its sequential public number. | `buildCustomerDTO` strips identity fields + id unless owner/token/internal-id; checkout redirect and all customer e-mail links now use the token. |
| C3 | **Guest checkout overwrote existing accounts** — `customer.upsert` on guest checkout rewrote a registered customer's name/phone by e-mail alone. | Upsert `update: {}` — existing profiles are never mutated by an unauthenticated checkout. |

### High — FIXED

| ID | Finding | Fix |
|---|---|---|
| H1 | **Wrong e-mail template for payment issues** — `markPaymentIssue` and PayPal capture-denied fell through to `new_proof_requested` ("add a justificatif"), wrong for a PayPal customer. | New dedicated `payment_issue` template (key, shell CTA, defaults, admin editor entry); both paths now use it. |
| H2 | **Proof re-request silently dropped** — requesting a new proof when the order was already `payment_issue` short-circuited before sending; admin saw success, customer got nothing. | `applyPaymentStatusWithEmail` now detects a same-status "resend", skips the transition but still sends the e-mail and records an `email` timeline event. |
| H3 | **Internal notes leaked as customer "Motif"** — quick reject/issue passed the internal timeline note as the customer-visible reason. | Quick actions render an empty reason; customer-visible reasons come only from the review-email modal. |
| H4 | **All checkout failures → generic error** — promo-race / unavailable-item / invalid-phone all collapsed to "réessayer", so a promo-race customer retried forever. | `createOrder` returns a typed `{ error }` with a customer-safe French message; checkout shows it. |
| H5 | **Silent partial orders** — a cart line deactivated between browse and submit was dropped, creating an order with a different total than shown. | `createOrder` refuses when any requested line fails to resolve. |
| H6 | **USDT amount hardcoded at 10 MAD/USDT** — a drifting rate makes every crypto customer under/over-pay. | Admin-configurable `cryptoExchangeRate` per method (editor field added); falls back to 10. |

### Medium — FIXED

| ID | Finding | Fix |
|---|---|---|
| M1 | **Delivery/confirm races** — `confirmPayment` and `deliverOrder` used pre-read checks + unguarded `update`; concurrent calls double-sent e-mails / duplicated delivered codes + Reloadly spend. | Atomic `updateMany` from-status guards in both (mirrors the PayPal path). |
| M2 | **Manual code reuse** — no uniqueness on `manualCode`, so a copy/paste typo could deliver the same code to two orders. | In-transaction duplicate check against existing `DeliveredCode` for the product. |
| M3 | **Multi-item Reloadly double-purchase** — a partial failure across several Reloadly purchases lost paid codes and re-purchased on retry (no idempotency ledger). | Interim guard: refuse >1 Reloadly code per delivery (fulfil extras manually) until a persisted ledger exists. |
| M4 | **Unconfigured PayPal shown to customers** — method visibility ignored env; customers hit a dead "PayPal n'est pas configuré". | `isUsable` hides a PayPal method unless server creds + `NEXT_PUBLIC_PAYPAL_CLIENT_ID` are present (admin still sees it). |
| M5 | **Fake CSS "QR code"** for crypto — customers tried to scan a decorative stripe pattern. | Removed; copy-paste address is the supported flow (render a real QR later). |
| M6 | **Live-update gaps** — customer payment page stopped polling on `rejected`/`payment_issue`; admin PaymentsPanel / FulfillmentPanel / OrderDetail didn't poll for inbound changes. | Poll all non-terminal states on the customer page; 15s inbound polling on the three admin surfaces (OrderDetail refresh is no-op-safe so it won't wipe codes the admin is typing). |
| M7 | **Quantity bounds** — no server-side integer/upper-bound check. | `createOrder` rejects non-integer or >100 quantities. |

### Verified already-correct (no change)

- **Digital-code exposure is clean**: codes never appear in admin list views, logs, Discord channel notifications, or any e-mail (delivery is a token link only). Delivered codes are gated behind token/owner + `status==="delivered"`. Stock-code allocation is race-safe (`updateMany where status:"unused"` + `@@unique`).
- **Payment proofs**: DB base64, served only via admin-gated `getPaymentProofAction`; no `/api` route exposes them.
- **Server-side money math**: totals/promo/Ghost-Credit all recomputed server-side; client never trusted.
- **Method change already blocked after `payment_submitted`/confirmed**, with a `method_change` timeline event and a confirmation modal (sidebar flow).
- **"Renvoyer un justificatif"** after rejection/issue opens the real upload flow (WhatsApp is secondary).
- **Emails send after commit**, in try/catch — a failed e-mail never corrupts order state.
- **Logged-in checkout** prefills read-only name/e-mail and links the order to the account.

---

## Files changed (second pass)

- `src/lib/db/orders.ts` — token at creation; `authorizeOrderAccess()`; DTO identity stripping; typed `{error}` returns; quantity/partial-order validation; guest-upsert no-mutate; token e-mail links.
- `src/app/actions/orders.ts` — `createOrder` result type; `findOrderAction` routes via token.
- `src/app/actions/payments.ts` — `authorizeOrderAccess()` on submit/cancel/change actions.
- `src/app/actions/paypal.ts` — `authorizeOrderAccess()` on create/capture.
- `src/lib/db/payments.ts` — `payment_issue` template mapping; quick-action reason no longer leaks internal note; resend-email path; token links.
- `src/lib/db/fulfillment.ts` — atomic confirm/deliver guards; manual-code duplicate check; multi-Reloadly guard; token reuse at delivery; token e-mail link.
- `src/lib/db/paymentMethods.ts` — hide unconfigured PayPal from customers.
- `src/lib/emailTemplates.ts`, `src/lib/storeSettings.ts` — `payment_issue` template + defaults.
- `src/lib/dto.ts` — `cryptoExchangeRate`.
- `src/app/checkout/CheckoutClient.tsx` — token redirect; show server error message.
- `src/app/payment/[id]/page.tsx` — poll rejected/issue; configurable USDT rate; remove fake QR.
- `src/components/admin/PaymentsPanel.tsx`, `FulfillmentPanel.tsx`, `orders/OrderDetailPage.tsx` — inbound polling.
- `src/components/admin/payment-methods/MethodEditorDrawer.tsx` — crypto exchange-rate field.
- `test/email/greeting.test.ts` — new `payment_issue` template tests (the order-authorization helpers are DB-backed/server-only and are covered by the manual checklist below, not the DB-free unit harness).

## Database changes

**None.** No schema/migration changes. `deliveryToken` already existed on `Order`
(`@unique`, nullable) — it is now populated at creation instead of only at
delivery. Existing rows without a token keep working via the public-number
fallback everywhere the token is used.

## Remaining launch blockers / follow-ups

1. **Vercel `staging` env-var scoping** (C-ENV-1) — set `RELOADLY_ENV=sandbox`, `PAYPAL_ENV=sandbox`, `EMAIL_TEST_ALLOWLIST`. Config, not code.
2. **Reloadly per-entry idempotency ledger** — replace the interim >1-code guard (M3) with a persisted ledger for true multi-item supplier fulfilment.
3. **Admin "resend delivery e-mail"** action from `EmailLog` (a failed `order_delivered` currently needs manual intervention).
4. **Cancellation e-mail** — no `order_cancelled` template is sent today (Discord only).
5. Wire or remove the dead `awaiting_payment` template.
6. Carry-overs from the first pass: Sentry monitoring, auth rate limiting, product-page SEO/JSON-LD, unpaid-order expiry cron, guides content.
