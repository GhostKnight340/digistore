# Email event mapping

Which code path sends which template. Keep this in sync when you add a sender —
a template with no sender is copy an admin can tune that will never ship.

Base URL for every link comes from `appBaseUrl()` (`src/lib/orderNumber.ts`),
which resolves per environment (production domain / `VERCEL_URL` on preview /
localhost). Sending is gated by `shouldSendRealEmail()`
(`src/lib/email/send-email.ts`): real sends only on `VERCEL_ENV=production`,
otherwise `ENABLE_REAL_EMAILS=true` **and** the recipient in
`EMAIL_TEST_ALLOWLIST`; everything else is simulated and logged.

## Account

| Event | Template | Trigger |
|---|---|---|
| Account verification | `email_verification` | `src/app/actions/auth.ts` — registration |
| Checkout email verification | `checkout_email_verification` | `src/lib/checkout/emailVerification.ts` — inline checkout account creation |
| Welcome | `welcome` | first successful verification (`src/app/verify-email/page.tsx`, `src/app/actions/auth.ts`) |
| Password reset | `password_reset` | `requestPasswordResetAction` |
| Password changed | `password_changed` | password update |

Auth templates carry live secrets (the 6-digit code, the `?token=` URL). Their
rendered `body`/`text`/`html` is deliberately **not** persisted to `EmailLog` —
see `AUTH_TEMPLATE_KEYS` in `send-email.ts`. The log row itself is kept for
delivery status and forensics.

## Order lifecycle

| Event | Template | Trigger |
|---|---|---|
| Order received | `order_received` | `createOrder` (`src/lib/db/orders.ts`) |
| Proof received | `proof_received` | customer submits a payment proof (`src/lib/db/payments.ts`) |
| More proof requested | `new_proof_requested` | admin requests another proof |
| Payment issue | `payment_issue` | admin moves the order to `payment_issue` |
| Payment rejected | `payment_rejected` | admin moves the order to `rejected` |
| Payment confirmed | `payment_confirmed` | `src/lib/db/fulfillment.ts` — confirm transition |
| Code delivered | `order_delivered` | `deliverOrder` — links to `/delivery/{deliveryToken}`, **never contains the code itself** |
| Order cancelled | `order_cancelled` | `cancelOrder` (`src/lib/db/payments.ts`) |
| Refund update | `refund_update` | admin refund action (covers initiated **and** completed) |

## Support

| Event | Template | Trigger |
|---|---|---|
| Request received | `support_received` | ticket created |
| Reply sent | `support_reply` | admin replies |
| Request closed | `support_closed` | ticket closed |
| Credit expiry reminder | `ghost_credit_expiry_reminder` | wallet expiry cron |

## Defined but never sent

These templates exist and are admin-editable but have **no sender**. Either wire
them or remove them — an operator editing them is wasting effort:

- `email_confirmation` — no call site.
- `awaiting_payment` — no call site. Note this means there is currently **no
  payment-reminder email** for an order left unpaid.

## Rules

- Digital codes never appear in any template. `order_delivered` deliberately
  says so in the body and links to the token-gated delivery page.
- Currency is rendered as `DH` in customer copy (`MAD` only appears in internal
  field names such as `totalMad`).
- Delivery and status transitions are idempotent (atomic `updateMany` with a
  from-status guard), so a double click cannot double-send.
- Send failures are caught, logged to `EmailLog` as `failed`, and pinged to
  Discord via `notifyEmailFailure`. **There is no retry queue** — see the
  backlog.
