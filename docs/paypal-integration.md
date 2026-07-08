# PayPal Integration

Status: **live as an automated payment method.** A `PaymentMethod` row of
type `"paypal"` renders a real PayPal JS SDK button at checkout instead of
manual "send money and upload proof" instructions. Payment is only marked
confirmed after a server-side capture verified against PayPal's API, or a
signature-verified webhook — never from the browser redirect alone. Bank
transfer, crypto, and every other manual payment method are unaffected.

## Env vars

| Var | Required | Notes |
| --- | --- | --- |
| `PAYPAL_CLIENT_ID` | Yes, to enable PayPal | REST app client id from the PayPal Developer Dashboard. |
| `PAYPAL_CLIENT_SECRET` | Yes, to enable PayPal | Same app. Treat like a password — never logged, never sent to the client. |
| `PAYPAL_WEBHOOK_ID` | Yes, to enable PayPal | Id of the webhook subscription (see below). Required for signature verification — without it, incoming webhooks are rejected. |
| `PAYPAL_ENV` | No | `sandbox` (default) or `live`. Anything other than exactly `live` is treated as sandbox. |
| `NEXT_PUBLIC_PAYPAL_CLIENT_ID` | Yes, to enable PayPal | Same value as `PAYPAL_CLIENT_ID`, exposed to the browser so the PayPal JS SDK can render the button. This is the only PayPal value that is safe client-side. |

Sandbox and live are **separate credential pairs** in PayPal's dashboard. A
sandbox client id/secret will not authenticate against `PAYPAL_ENV=live` and
vice versa.

Without `PAYPAL_CLIENT_ID`/`PAYPAL_CLIENT_SECRET`/`PAYPAL_WEBHOOK_ID` set,
every function in `src/lib/paypal/client.ts` throws `PayPalConfigError`
immediately, and the checkout button reports "not configured" rather than
silently accepting an order it can never confirm.

## Currency

PayPal does not settle in MAD. Each `paypal`-type `PaymentMethod.details`
carries an optional `paypalCurrency` (default `"USD"`) and
`paypalExchangeRate` (MAD per 1 unit of that currency, default `10`),
editable from the admin payment-method drawer. The converted amount and
currency are locked onto the `Order` row (`paymentProviderAmount`,
`paymentProviderCurrency`) the moment the PayPal order is created, so later
capture/webhook verification always compares against that fixed snapshot —
never a rate that may have changed since.

## Module layout

- `src/lib/paypal/config.ts` — reads env vars, resolves sandbox vs live base URLs. Only module allowed to read `process.env.PAYPAL_*` (server-side vars).
- `src/lib/paypal/client.ts` — OAuth2 client-credentials token fetch + in-memory cache, `createPayPalOrder`, `capturePayPalOrder`, `getPayPalOrder`, `getPayPalCapture`, `verifyPayPalWebhookSignature`. Only module allowed to build the `Authorization` header. Never logs the client secret, an access token, or a raw webhook payload.
- `src/lib/paypal/amount.ts` — MAD → PayPal-currency conversion using the method's `paypalCurrency`/`paypalExchangeRate`.
- `src/lib/paypal/operations.ts` — domain functions: `createPaypalOrderForGhostOrder`, `capturePaypalOrderForGhostOrder`, `applyVerifiedPaypalOrder` (shared by the capture action and the webhook), refund/lookup helpers. Every status change re-fetches trusted state from PayPal before writing to the DB.
- `src/lib/db/payments.ts` — `savePaypalOrderCreated`, `confirmPaypalPayment`, `markPaypalCaptureDenied`, `markPaypalRefunded`: idempotent, transactional Order status transitions that reuse the existing email/Discord/fulfillment-notification pipeline.
- `src/app/actions/paypal.ts` — server actions the checkout page calls (`createPaypalOrderAction`, `capturePaypalOrderAction`). The browser never talks to PayPal directly.
- `src/app/api/webhooks/paypal/route.ts` — webhook receiver.
- `src/components/PayPalButton.tsx` — loads the PayPal JS SDK client-side and renders the button.

## Flow

1. Customer selects PayPal at checkout → Ghost creates a local `Order` with `paymentMethod` pointing at the PayPal `PaymentMethod` row and status `pending_payment` (unchanged from every other method).
2. On the payment page, `PayPalButton` calls `createPaypalOrderAction(orderId)`, which creates a PayPal Orders API v2 order and stores `paymentProviderOrderId`/`paymentProviderAmount`/`paymentProviderCurrency` on the Order (idempotent — re-clicking or refreshing reuses the still-open PayPal order).
3. Customer approves in the PayPal popup. The SDK's `onApprove` callback calls `capturePaypalOrderAction(orderId, paypalOrderId)`, which captures server-side and verifies the returned capture's amount/currency against the snapshot from step 2 before calling `confirmPaypalPayment` (transactional, idempotent → `payment_confirmed`, triggers the same email/Discord/fulfillment-needed notifications as a manual admin approval).
4. If capture fails, or the customer abandons the popup, the order stays `pending_payment` and nothing is marked paid.
5. PayPal also sends webhooks (`PAYMENT.CAPTURE.COMPLETED`, `PAYMENT.CAPTURE.DENIED`, `PAYMENT.CAPTURE.REFUNDED`, `PAYMENT.CAPTURE.REVERSED`) to `/api/webhooks/paypal`. Each is signature-verified via `verifyPayPalWebhookSignature` before anything is trusted, deduped via the `PaymentWebhookEvent` table (unique `eventId`), and re-fetched from PayPal's API — never taken from the payload — before changing the Order. This covers the case where the webhook arrives before (or instead of) the browser's capture call, and makes duplicate/replayed webhooks a no-op.
6. Admin fulfillment (code assignment/delivery) is untouched — a PayPal `payment_confirmed` order shows up in the admin payments queue exactly like a manually-approved one and still requires the admin to deliver codes.

## Webhook setup (PayPal dashboard)

1. Developer Dashboard → your REST app → Webhooks → Add Webhook.
2. URL: `https://<your-domain>/api/webhooks/paypal`.
3. Subscribe to: `CHECKOUT.ORDER.APPROVED`, `PAYMENT.CAPTURE.COMPLETED`, `PAYMENT.CAPTURE.DENIED`, `PAYMENT.CAPTURE.REFUNDED`, `PAYMENT.CAPTURE.REVERSED`.
4. Copy the generated Webhook ID into `PAYPAL_WEBHOOK_ID`.
5. Repeat for both the Sandbox and Live apps — they have separate webhook ids.
