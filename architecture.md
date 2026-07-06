# Ghost.ma — Architecture

## IMPORTANT FOR AI CODING AGENTS

This document describes the **CURRENT implemented architecture** of Ghost.ma.

Before modifying, replacing, removing, or rebuilding any existing feature:

1. Inspect the actual current implementation.
2. Inspect the database schema and migrations.
3. Inspect all related API routes, server actions, components, and shared helpers.
4. Preserve existing working behavior unless the task explicitly requests changing it.
5. Never treat the omission of a feature from this document as evidence that the feature does not exist.
6. Never remove functionality merely to make the code match this document.
7. If this document conflicts with the current codebase, report the discrepancy before making destructive or architectural changes.

Labels used throughout: **IMPLEMENTED** (built and wired end-to-end) · **PARTIAL** (real but incomplete/stubbed in places) · **PLANNED** (not built) · **DEPRECATED** (present but superseded/unused) · **DO NOT USE** (present but should not be relied on).

Where the real behavior was not fully confirmed during this audit, this document says **"Needs verification"** instead of guessing.

---

## 1. Overview

Ghost.ma is a Next.js digital-goods storefront + admin back office. Customers buy digital codes/keys (products with variants), pay via bank transfer / USDT / PayPal / card, upload manual payment proof, and receive codes by email once an admin confirms payment and fulfills the order. There is a French-language UI throughout (labels, emails, admin copy).

There is a single combined codebase: public storefront, customer account, and admin dashboard all live under one Next.js App Router app, backed by one Postgres database via Prisma.

## 2. Tech stack

From `package.json`, `next.config.ts`, `tsconfig.json`, `tailwind.config.ts`:

- **Next.js 15.1.6** (App Router), **React 19**, **TypeScript 5** (strict mode, `@/*` → `src/*`)
- **Prisma 6.19.3** ORM → **PostgreSQL** (Supabase in production; datasource in `prisma/schema.prisma` is hardcoded to `postgresql`)
- **Resend 6.16.0** — transactional email provider (`src/lib/email/send-email.ts`)
- **Tailwind CSS 3.4.17**, custom dark theme (`tailwind.config.ts`)
- **No auth library** (no NextAuth/Auth.js/Passport) — auth is hand-rolled (§4)
- **No form library** (no react-hook-form/zod in dependencies) — plain server actions with manual validation
- `server-only` package marks server-only modules (e.g. `src/lib/auth.ts`, `src/lib/db/prisma.ts`)

`next.config.ts` sets `serverExternalPackages: ["better-sqlite3"]` and the root `.env` has a local dev fallback `DATABASE_URL="file:./dev.db"` (SQLite) — this is a **local-dev-only leftover**; the real schema and production database are Postgres. DO NOT assume SQLite is used anywhere in production logic.

No `README.md`, no `vercel.json`, and no `.github/workflows/` exist in this repo — there is no checked-in CI/CD pipeline.

## 3. Database and Prisma

Source of truth: `prisma/schema.prisma`. Models (one line each):

| Model | Purpose |
|---|---|
| `Product` | Parent catalog item (name, slug, category, description, price MAD, region string, featured/active flags) |
| `Category` | Flat product category — **no `parentId`, no nesting** (confirmed absent from schema and from `CategoriesPanel.tsx`) |
| `ProductMedia` | Ordered image gallery per product |
| `ProductVariant` | Sellable SKU under a product (price, face value/currency, `stockMode` auto/manual, `stockControl`, supplier cost, featured flag) |
| `DigitalCode` | Inventory of redeemable codes per product/variant; string status `unused\|reserved\|used\|disabled` |
| `Order` | Customer order; string status state machine (§8); `customerId` nullable (guest orders) |
| `Customer` | End-user account; `role` string (`CUSTOMER`/`ADMIN`); supports password (`passwordHash`) and Google (`googleId`, `authProvider`) auth; email verification fields |
| `AuthToken` | Single-use token for `email_verification` / `password_reset`, stores only a SHA-256 `tokenHash`, never the raw token |
| `OrderItem` | Line item linking Order ↔ Product/Variant |
| `DeliveredCode` | Fulfillment record per order item — links to a `DigitalCode` or stores a free-text manual code |
| `EmailLog` | Audit log of every transactional email attempt (provider, status, subject, html/text body, template key) |
| `PaymentProof` | Customer-uploaded proof file, one per order, `data` stored as a string (base64 by default; some code paths also tolerate a URL/data-URI — see §9) |
| `PaymentEvent` | Audit trail of order/payment status transitions (`status_change` / `proof_uploaded` / `admin_note` / `admin_status_change`) |
| `Bank`, `CryptoWallet` | Payment-method configuration data (bank accounts, crypto wallets) |
| `PaymentMethodConfig` | Per-method config: `method` (`bank\|usdt\|paypal\|card`), `enabled`, `proofRequired` |
| `SupportConfig` | Global support contact info |
| `StoreSetting` | Single-row (`id: "default"`) arbitrary `Json` blob — **the mechanism behind almost every "settings" feature** (see §14) |

**No dedicated `Session` model** — sessions are stateless signed cookies (§4). **No `Refund` model** — refunds are a status string + audit trail, not a structured entity (§10). **No `EmailTemplate` model** — templates live inside the `StoreSetting` JSON blob (§11).

### Migrations
`prisma/migrations/` has 14 sequential, dated migrations (`20260624203358_init` → `20260702120000_add_customer_admin_role`), forming a consistent, gap-free history. Migration SQL uses `CREATE TABLE IF NOT EXISTS` rather than plain `CREATE TABLE` — an intentionally defensive/idempotent style.

`package.json` scripts: `prisma:generate` (`prisma generate`, also runs on `postinstall`), `prisma:migrate` (`prisma migrate dev`, dev-only), `prisma:seed` (`tsx prisma/seed.ts`). **No `db push` script.** `docs/production-env.md` recommends running `npx prisma migrate deploy` manually before/at deploy time — **this is not wired into any checked-in build/CI script**; it is a manual operator step. Needs verification whether the hosting platform (Vercel, per docs) runs this automatically via a build hook.

### Runtime DDL
No `$executeRaw`, `$queryRaw`, or inline `CREATE TABLE`/`ALTER TABLE` exist anywhere in `src/` — all real schema DDL comes from Prisma migrations only.

There **is** a runtime safety net: `ensureDatabaseReady()` in `src/lib/db/prisma.ts`, called from nearly every data-access entry point (e.g. `src/lib/auth.ts`, `src/app/auth/google/callback/route.ts`). On first invocation per process it **upserts** baseline `Category` rows and a default `StoreSetting` row — this is idempotent data seeding, **not table creation**. `docs/production-env.md`'s note about "creating missing tables on first DB access" refers to this upsert behavior, not raw DDL.

## 4. Authentication and roles — IMPLEMENTED

**Session mechanism** (`src/lib/auth.ts`): a signed, stateless cookie (`ghost_customer_session`) storing `{customerId, exp}`, base64url-encoded and HMAC-SHA256-signed using a secret from `AUTH_SECRET` / `NEXTAUTH_SECRET` / `SESSION_SECRET`. **No server-side session store** — validity is purely cryptographic + expiry check. Cookie is `httpOnly`, `sameSite: lax`, `secure` in production; 1-day or 30-day expiry depending on "remember me". `getCurrentCustomer()` decodes the cookie and loads the `Customer` row, rejecting if neither `passwordHash` nor `googleId` is set.

**Password auth**: hashing via Node's built-in `crypto.scrypt` (custom format `scrypt:<salt>:<key>`) — **not bcrypt/argon2**. Login (`loginCustomerAction`, `src/app/actions/auth.ts`) is rate-limited, verifies the password, updates `lastLoginAt`, sets the session cookie. Both login and registration are exposed from the same page (`src/app/login/page.tsx`) via a tab toggle.

**Google OAuth**: `src/app/auth/google/route.ts` builds the Google OAuth URL with a CSRF `state` stored in a short-lived cookie; `src/app/auth/google/callback/route.ts` exchanges the code, fetches the Google profile, and upserts a `Customer` by `googleId` or `email` (account-linking: sets `authProvider: "password_google"` if a `passwordHash` already exists on that email, else `"google"`), sets `emailVerified`/`emailVerifiedAt` from Google's claim, then logs the user in via the same session mechanism.

**Password reset**: `requestPasswordResetAction` / `resetPasswordAction` (`src/app/actions/auth.ts`) use `AuthToken` rows (45-minute TTL) created by `createToken()`. Only the SHA-256 hash of the token is persisted; the raw token is emailed and never stored. Pages: `src/app/forgot-password/page.tsx`, `src/app/reset-password/page.tsx`.

**Email verification**: `verifyEmailAction` consumes an `email_verification` token (24h TTL) via `consumeAuthToken()`, which marks `usedAt` to prevent reuse. Page: `src/app/verify-email/page.tsx`. Resend-verification is available from the customer's security page.

**Admin authorization**: `src/app/admin/layout.tsx` calls `requireAdminCustomer()`, which redirects unauthenticated users to `/login?next=/admin` and non-admins to `/403`. The **sole** authorization check is `customer.role === "ADMIN"` (`isAdminCustomer()` in `src/lib/auth.ts`) — there is no separate roles/permissions table, no middleware-based protection. **`src/middleware.ts` performs no auth logic at all** — it only sets an `x-current-path` header on every request. DO NOT assume middleware protects `/admin`; all access control is in the server-component/server-action layer.

## 5. Public storefront — IMPLEMENTED

`src/app/page.tsx` is a server component driven entirely by `StoreSetting` data: `getCatalogData()` + `getStoreSettings()` (`src/lib/db/catalog.ts`). Every homepage section (hero, categories, featured products, how-it-works, trust strip, CTA) is gated by `settings.homepage.show*` boolean flags, with copy from `settings.branding.*` / `settings.homepage.*Title/*Subtitle`.

`src/lib/products.ts` is a **DEPRECATED / DO NOT USE** static fixture (hardcoded categories/products arrays) — it is not used by the live storefront. The real catalog path is `src/lib/db/catalog.ts`:
- `getCatalogPage()` — queries `Category`/`Product` with `active`/`categoryRecord.active`/"has active variants" filters, flattens each product's active variants into individually sellable "products" (`toVariantProduct`), computes stock status from `DigitalCode` counts unless `stockMode` forces a state.
- `getProductBySlug()` — powers `src/app/products/[id]/page.tsx` (variant picker, related products from the same category).
- `src/app/products/page.tsx` — search/category/pagination via `getCatalogPage({category, query, page, take: 24})`.

**Homepage editor** (`src/app/admin/editor/page.tsx`, admin-only, full-screen mode) — an in-place WYSIWYG editor over the live homepage markup, built on `EditorProvider` (`src/lib/editor/EditorContext.tsx`, undo/redo history reducer, Ctrl+Z/Y/S shortcuts), `EditableText.tsx`/`SectionWrapper.tsx`/`EditorToolbar.tsx`. Saves call `saveStoreSettings()` (`src/lib/db/catalog.ts`) — an upsert of the single `StoreSetting` row (`id: "default"`) with the whole config as one JSON blob. Saving also syncs `ProductVariant.featured` flags to match the editor's `featuredProductIds` list, so featured-product selection here writes back into real `Product`/`ProductVariant` rows.

## 6. Customer account — IMPLEMENTED (partial editing)

- `src/app/account/page.tsx` — server component, read-only summary (name/email/status) + last-5-orders list + `AccountProfileForm`.
- **Editable fields are limited to phone number.** `AccountProfileForm.tsx` calls `updateCustomerPhoneAction` (`src/app/actions/auth.ts`), which normalizes/validates and updates `Customer.phone`. **Name and email are not editable anywhere in the customer UI** — needs verification if this is intentional or a gap.
- **Password change**: `src/app/account/security/SecurityClient.tsx` → `changePasswordAction`, verifies `currentPassword` against the stored hash, updates `passwordHash` + `lastPasswordChangeAt`, sends a "password changed" email. Same page exposes `resendVerificationAction()`.
- **Orders list**: `src/app/account/orders/page.tsx` calls `getAccountOrders(customer.id)` (`src/lib/auth.ts`) — orders linked strictly by `customerId` for logged-in accounts.
- **Guest order lookup**: `src/app/find-order/page.tsx` — order-number + email form, calls `findOrderAction` (`src/app/actions/orders.ts`) → `findOrderByEmailAndId()` (`src/lib/db/orders.ts`), matching on `order.customerEmail` (case-insensitive) — independent of any `Customer` record, supporting fully guest purchases.

## 7. Checkout — IMPLEMENTED (guest + logged-in)

`src/app/checkout/page.tsx` calls `getCurrentCustomer()` to prefill the form if logged in but **does not require login** — guest checkout is fully supported.

`src/app/checkout/CheckoutClient.tsx` collects `fullName`, `email`, `phone`, and a payment `method` (`bank|usdt|paypal|card`, plus `selectedBankId` for bank transfers). Available methods come from `getPaymentConfigAction()` filtered by `isMethodUsable()` (method must be `enabled` and, for bank/usdt, have at least one configured bank/wallet). Cart state lives in `src/context/StoreContext.tsx`.

Submit calls `createOrderAction` (`src/app/actions/orders.ts`) → `createOrder()` (`src/lib/db/orders.ts`), which **re-resolves product/variant data and price server-side** (does not trust client-submitted prices), creates the `Order` + `OrderItem` rows (`customerId` optional — null for guests), then redirects to `/payment/[order.publicOrderPathSegment]`.

Needs verification: whether `DigitalCode`/stock is reserved synchronously at order-creation time, or only at fulfillment (`deliverOrder`).

## 8. Orders — IMPLEMENTED

Canonical status set (`ORDER_STATUSES` in `src/lib/db/orderManagement.ts`): `pending_payment → payment_submitted → payment_confirmed → delivered`, plus `payment_issue`, `rejected`, `refunded`, `cancelled`. `src/lib/orderStatus.ts` is presentation-only (French labels/badges/boolean helpers) and includes a couple of extra display labels (`processing`, `pending`, `awaiting_payment`) that are **not** part of the enforced enum — DO NOT treat those as real statuses without checking `orderManagement.ts` first.

`src/lib/db/orderManagement.ts` also provides admin-only destructive tools: `deleteOrder` / `clearAllOrders` (full cascade delete across DigitalCode/DeliveredCode/PaymentProof/PaymentEvent/EmailLog/OrderItem/Order, with orphan-Customer pruning), and `changeOrderStatus` (manual admin override; explicitly **rejects** transitioning to `delivered` this way — delivery must go through the dedicated fulfillment flow, §10).

Every status transition writes a `PaymentEvent` row inside the same Prisma transaction — this audit trail is real, not a stub.

**Admin nav counts**: `getAdminNavCounts()` (`src/lib/db/orders.ts`) computes exactly two badges — `activeOrders` (status ≠ `delivered`) and `paymentReview` (status = `payment_submitted`) — exposed via `getAdminNavCountsAction`. **Refresh is not polled**: `AdminDashboard.tsx` only refetches nav counts on tab switch (`useEffect` keyed on `activeTab`), no `setInterval`. The customer-facing `/payment/[id]` page does poll every 5 seconds while the order is in a non-terminal status.

**`revalidatePath`** is used in `src/app/actions/admin.ts` for catalog/category/product mutations and for `changeOrderStatusAction`/`deleteOrderAction`/`clearAllOrdersAction`. Notably, `confirmPaymentAction` and `deliverOrderAction` do **not** call `revalidatePath` — they rely on the admin UI re-fetching client-side after the action resolves. `revalidateTag` is not used anywhere.

## 9. Payments — IMPLEMENTED

`src/lib/db/payments.ts`:
- `submitPayment` — customer proof upload (validates MIME/size, requires proof unless `PaymentMethodConfig.proofRequired = false`), transitions `pending_payment → payment_submitted`, upserts `PaymentProof`, writes a `PaymentEvent`, sends a `proof_received` email.
- `approvePayment` / `rejectPayment` / `markPaymentIssue` — thin wrappers around `setPaymentStatus`.
- `applyPaymentStatusWithEmail` — generic status+email setter, also used for the refund-update path (§10).
- `getPaymentProof` — reads `PaymentProof.data`; tolerates both raw base64 and a URL/data-URI (`source: "url"` vs `"base64"`) — the field is used somewhat loosely rather than a strict single-format contract. **Needs verification** of the exact intended contract.

Customer upload: `src/app/payment/[id]/page.tsx` → `submitPaymentAction` (`src/app/actions/payments.ts`) base64-encodes the uploaded file and calls `submitPayment`.

Admin review UI: `src/components/admin/PaymentsPanel.tsx` — tabbed table (submitted/confirmed/issue/rejected/delivered/all), each row linking to `src/components/admin/orders/OrderDetailPage.tsx`, which holds the actual approve/reject/deliver actions plus "review email" intents (reject / request new proof / refund update) via `sendPaymentReviewEmailAction` and a preview via `getPaymentEmailPreviewAction`.

**Payment methods & badges**: `Bank`, `CryptoWallet`, `PaymentMethodConfig` configured in `src/components/admin/PaymentSettingsPanel.tsx` (enable/disable, `proofRequired`, plus **display branding** — `displayName`, `subtitle`, `logoUrl`, `initials`, `accentColor` — stored under `settings.paymentDisplay` in the `StoreSetting` blob). `src/lib/paymentDisplay.ts`'s `resolvePaymentDisplay()` merges the admin override with a hardcoded fallback. Actual badge rendering is `src/components/PaymentBrandMark.tsx`, used both at checkout and in the admin preview.

`src/app/refunds/page.tsx` is a **customer-facing static legal page** (renders `settings.legalPages.refunds`) — unrelated to the admin refunds feature; do not confuse the two.

## 10. Fulfillment — IMPLEMENTED

`src/lib/db/fulfillment.ts`:
- `confirmPayment` — `payment_confirmed`, guarded against re-confirming.
- `deliverOrder` — validates one code entry per item quantity; for each item, either atomically claims a `DigitalCode` (`unused → used` guarded update, sets `assignedOrderId`) or accepts a free-text manual code; always writes a `DeliveredCode` row; sets order status to `delivered`; sends the `order_delivered` email with the codes.

Admin UI: `src/components/admin/orders/OrderDetailPage.tsx` builds a per-item assignment table (dropdown of available `DigitalCode`s, disabling ones already chosen for another slot, or a manual-code text field), then calls `deliverOrderAction`. `DevOrderDetailTools.tsx` is a dev-only "Delete Order" utility with an explicit confirm dialog — not a customer-facing feature.

Customer-facing: `src/app/order/[id]/page.tsx` and `src/app/delivery/[id]/page.tsx` are both **trivial redirects** to `/payment/[id]` — there is no separate order-status or code-reveal page. Delivered codes are exposed on the payment page only once `status === "delivered"`.

## 11. Email system — IMPLEMENTED

`src/lib/emailTemplates.ts` — pure rendering module (no I/O). 12 template keys: `welcome`, `email_verification`, `email_confirmation`, `password_reset`, `password_changed`, `order_received`, `awaiting_payment`, `proof_received`, `new_proof_requested`, `payment_rejected`, `payment_confirmed`, `order_delivered`, `refund_update`. `renderEmailTemplate(settings, key, variables)` builds branded HTML from a per-key config (title/intro/CTA) plus the admin-editable `subject`/`body` text (`{{var}}` placeholder substitution). `order_delivered` and `password_changed` have hardcoded bodies that bypass the editable template text.

**Template storage**: templates live in `StoreSettings.emailTemplates` (part of the same `StoreSetting` JSON blob) — **there is no dedicated `EmailTemplate` Prisma model**. `EmailLog.templateKey` is only the audit-log reference to which key was used, not the template store itself.

`src/lib/email/send-email.ts` — sends via **Resend**. `shouldSendRealEmail()` gates real sends: only when `NODE_ENV === "production"` OR `ENABLE_REAL_EMAILS === "true"`, otherwise every send is simulated (writes `EmailLog` with `status: "simulated"`, no Resend call). `sendTransactionalEmail()` always writes an `EmailLog` row first, then updates it to `"sent"`/`"failed"` after the real Resend call. Auth-critical templates (`email_verification`, `welcome`, `password_reset`, `password_changed`) always use the generated branded template and reject admin HTML overrides — non-auth templates may accept an admin HTML override if it passes an `isBrandedHtml()` check. Note: `send-email.ts` currently `console.log`s the full rendered HTML on every real send — a debug leftover, not a feature.

**Preview** — `src/components/admin/EmailTemplatesPanel.tsx` has only a **client-side plain-text preview** (simple `{{var}}` substitution against hardcoded sample values), **not** a rendered-HTML/iframe preview of the actual branded email that would be sent. Treat "email preview" as PARTIAL, not a true WYSIWYG preview.

## 12. Admin dashboard — IMPLEMENTED (SPA-style, not file-route-per-screen)

`src/app/admin/page.tsx` (+ `layout.tsx` for auth) renders a single client component, `src/components/admin/AdminDashboard.tsx`, which tab-switches (via `?tab=` query param, not real routes) between lazily-loaded panels in `src/components/admin/`:

`SettingsPanel`, `ProductsPanel`, `CategoriesPanel`, `FeaturedProductsPanel`, `InventoryPanel`, `PaymentsPanel`, `PaymentSettingsPanel`, `EmailTemplatesPanel`, `LegalPagesPanel`, `MaintenancePanel`, `FulfillmentPanel` (also handles the "orders" tab), `CustomersPanel`. Two tabs (`suppliers`, `refunds`) render a generic `RestoredPanel` placeholder with static copy and no data — these are **PARTIAL/PLANNED**, not implemented.

`src/app/admin/orders/[id]/page.tsx` is the one real file-based admin sub-route (order detail), reached from Payments/Fulfillment panel rows and linked back via `?tab=` deep links.

`src/app/admin/editor/page.tsx` is the separate full-screen Homepage Editor (§5), launched from the topbar, not from the sidebar tabs.

**Admin global search — PARTIAL / DO NOT rely on it.** `AdminShell.tsx` has a topbar search `<input>` with a "⌘K" visual badge, but **no `onChange` handler, no keyboard-shortcut listener, no results dropdown, and no command-palette library** anywhere in the codebase. It is decorative only.

**Admin alerts / notifications**: the only real alert surface is a low-stock strip inside `InventoryPanel.tsx` (client-computed, threshold `LOW_STOCK_MAX = 5`). There is **no admin-facing notification system** (no email/push/webhook alert to the admin when a payment is submitted, stock runs out, etc.) — all transactional emails target the *customer*, not the admin. Treat "admin alerts beyond low-stock" as PLANNED, not implemented.

## 13. Products and catalog — IMPLEMENTED

Full CRUD admin UI exists (contrary to any assumption that only seed scripts manage the catalog):
- `ProductsPanel.tsx` — parent product + nested variant editor (tabs: details/content/variants/media), backed by server actions in `src/app/actions/admin.ts` (`saveParentProductAction`, `duplicateParentProductAction`, `archiveParentProductAction`, `deleteParentProductAction`, `convertProductToVariantAction`, `saveVariantAction`, `deleteVariantAction`, `duplicateVariantAction`).
- `CategoriesPanel.tsx` — manages flat `Category` rows (name/slug/gradient/icon/accentColor/sortOrder/active). **Confirmed: no nesting/parentId anywhere** — categories are flat by design today; nesting would require a schema migration.
- `FeaturedProductsPanel.tsx` (+ the featured manager embedded in the Homepage Editor) — both drive `settings.featuredProductIds`, which also syncs `ProductVariant.featured` on save.
- `InventoryPanel.tsx` — code-pool/stock management over `DigitalCode` (filters, low-stock threshold, bulk code paste-in via `addCodesBulkAction`, `disableCodeAction`).

**"Region"** is a plain free-text field (`Product.region`) — there is **no structured region-grouping concept** (no region entity, no `groupBy region` anywhere). Treat "region groups/listings" as PLANNED, not implemented, if requested.

## 14. Footer / settings / legal pages — IMPLEMENTED

All of these are driven by the single `StoreSetting` JSON blob (`saveStoreSettings()` in `src/lib/db/catalog.ts`), edited via panels in `src/components/admin/SettingsPanel.tsx` unless noted:

- **Footer** (`src/components/Footer.tsx`): hidden entirely if `settings.homepage.showFooter` is false. Shows brand/support text, contact email/WhatsApp, **payment badges** (`getEnabledFooterPaymentBadges`), **social links** (`getFooterSocialLinks`, `src/lib/footerConfig.ts`), and a **"Produits" link group built from live `Category` data** (first 4 active categories, linking to `/products?category=<id>`) — these product/category links are **not manually configurable**; they auto-derive from the catalog, not from admin settings. "Aide"/"Légal" link groups are static hrefs.
- **Legal pages editor** (`src/components/admin/LegalPagesPanel.tsx`): a dedicated rich-text editor (contenteditable, sanitized via `src/lib/legalHtml.ts`) for 5 pages stored in `StoreSettings.legalPages` (terms/privacy/refunds/legal/support), rendered publicly via `src/lib/legalPages.ts` + `src/components/legal/LegalContent.tsx`, and consumed by `src/app/terms`, `src/app/privacy`, `src/app/refunds`, `src/app/legal`, `src/app/conditions`. This is a **separate system** from the Homepage Editor's `EditorContext`/`EditableText` — do not conflate the two.
- **Payment method configuration and display** — see §9.
- **Support config** — `SupportConfig` model + `settings.footer`/branding fields for contact email/WhatsApp.

## 15. Maintenance mode — IMPLEMENTED

`StoreSettings.maintenance { enabled, message }`, toggled via `src/components/admin/MaintenancePanel.tsx`, enforced globally in `src/app/layout.tsx` (`showMaintenance = settings.maintenance.enabled && !maintenanceAllowed`) — renders a maintenance interstitial for non-exempt visitors. Existing order-tracking links remain accessible per the configured message copy. Needs verification of exactly what `maintenanceAllowed` exempts (e.g. admins, specific paths).

## 16. Deployment and migrations

See §3 for the migration mechanics. Summary:
- Production DB: Postgres via Supabase, `DATABASE_URL`/`DIRECT_URL`.
- Deploy-time migration: `npx prisma migrate deploy`, documented in `docs/production-env.md` as a manual/expected step — **not automated in any checked-in script**.
- No CI/CD config, no `vercel.json`, no root `README.md`.
- Env vars referenced in code (names only, not values): `ADMIN_EMAIL`, `APP_URL`, `AUTH_SECRET`, `EMAIL_FROM_ADDRESS`, `EMAIL_FROM_NAME`, `ENABLE_REAL_EMAILS`, `GHOST_ADMIN_EMAIL`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `NEXTAUTH_SECRET`, `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_SUPPORT_EMAIL`, `RESEND_API_KEY`, `SESSION_SECRET`, `SITE_URL`, `SUPPORT_EMAIL`, `DATABASE_URL`, `DIRECT_URL`, `NODE_ENV`.

## 17. Known caveats

- `src/lib/products.ts` is dead/static fixture code — **DO NOT USE** or extend it; the live catalog path is `src/lib/db/catalog.ts`.
- `src/middleware.ts` does not perform auth — do not add security assumptions there without checking `src/lib/auth.ts`.
- `send-email.ts` logs full rendered HTML to the server console on every real send — a debug leftover worth flagging if touching that file.
- Email template preview in the admin is plain-text only, not a true rendered-HTML preview.
- Admin "⌘K" search is a visual affordance with no functionality behind it.
- `PaymentProof.data` is used somewhat loosely (base64 vs URL/data-URI) — confirm the exact contract before changing upload/read logic.
- `orderStatus.ts` contains a few display-only status labels (`processing`, `pending`, `awaiting_payment`) that are not part of the enforced `ORDER_STATUSES` enum in `orderManagement.ts` — don't treat them as real transitions.
- `docs/admin-handoff/` and `design/*/Developer Handoff/` contain a **speculative admin redesign spec** written before this codebase existed. Several of its "missing/assumed" items (legal pages editor, maintenance mode, email templates, payment methods, footer settings) are **already fully implemented** in the current admin. Do not treat those documents as an accurate picture of current functionality — this document (`architecture.md`) supersedes them for "what currently exists."

## 18. Planned / future systems (not implemented)

- **Admin global search / command palette** — UI placeholder only, no logic.
- **Structured refunds** — no `Refund` model; only `Order.status = "refunded"` + a `refund_update` email/audit-event pathway. No refund amount/method tracking, no automatic reversal of delivered codes.
- **Admin-facing alerts/notifications** beyond the inventory low-stock strip (e.g., notify admin on new payment submission, stock exhaustion).
- **Nested/hierarchical categories** — `Category` has no `parentId`; would require a schema migration.
- **Structured region grouping** — `Product.region` is free text only.
- **Supplier API integration** — `AdminDashboard.tsx`'s "suppliers" tab is a static placeholder.
- **Automated migration deploy in CI** — currently a manual operator step.
