# Ghost.ma Pricing Architecture (Phase 1)

Status: **live (cost + suggestion layer only).** This phase builds the provider-cost
synchronization layer and the suggested-price engine. It does **not** import the
catalog, does **not** auto-publish prices, and does **not** change any
customer-facing pricing behavior. The storefront keeps reading only
`ProductVariant.priceMad`.

## Core invariants

1. **`ProductVariant.priceMad` is the storefront source of truth.** Nothing here
   reads Reloadly at customer request time.
2. **Sync never changes `priceMad`.** It writes only the `ReloadlyProviderCost`
   cost layer + a `PricingSyncRun` audit row. Verified end-to-end (sync upserts
   costs; the mapped variant's `priceMad` is unchanged).
3. **Suggested prices are not customer-visible until explicitly published.**
   Publishing (`publishSuggestedPrice`) is the only function that writes
   `priceMad`, and it is admin-triggered.
4. **Supplier costs are never exposed to customers** — cost data lives in
   admin-only tables and DTOs.
5. **Sandbox and production cost data stay distinguishable** — every cost row is
   stamped with `environment`; the unique key is
   `(environment, reloadlyProductId, recipientFaceValue)`.
6. **Manual/local products remain first-class**; Reloadly is optional per
   variant (`stockControl` = `manual` | `api` | `reloadly`).

## Reloadly cost inputs

Every pricing field is **already returned** by `GET /products` — the app type
previously discarded it. Widened in `src/lib/reloadly/operations.ts`
(`ReloadlyGiftCardProduct`). Currency model:

- `recipient*` — the card's face currency (what the buyer redeems).
- `sender*` — **your wallet currency (EUR** on the ghost.ma account); what you
  actually pay. **Provider cost is always computed in sender currency.**

Fields used for cost: `senderFee`, `senderFeePercentage`, `discountPercentage`,
`fixedRecipientToSenderDenominationsMap`, `fixedSenderDenominations`,
`recipientCurrencyToSenderCurrencyExchangeRate`, `min/maxSenderDenomination`.

## Provider cost formula

Single source of truth: `src/lib/pricing/cost.ts` (`computeProviderCost`). Pure,
Decimal-based (never floating point). All figures in sender currency:

```
discount      = senderBase × discountPercentage / 100
percentageFee = senderBase × senderFeePercentage / 100
providerCost  = senderBase + senderFee + percentageFee − discount
```

`senderBase` is resolved by `buildReloadlyCostInputs`:

- **FIXED**: exact figure from `fixedRecipientToSenderDenominationsMap[faceValue]`
  (fallback: `faceValue × exchangeRate` only if the map lacks the key).
- **RANGE**: `faceValue × recipientCurrencyToSenderCurrencyExchangeRate`.

A face value that isn't offered / is out of range yields no inputs (the sync
skips it rather than guessing).

Worked example (Netflix US, verified sandbox): 20 USD → base 18.29 EUR, 8% fee
⇒ **19.7532 EUR**.

## FIXED vs RANGE denomination handling

- **FIXED**: the sync prices the mapped face values **plus** the product's
  offered `fixedRecipientDenominations` (bounded, small).
- **RANGE**: the sync prices **only** the face values actually mapped by a
  ghost.ma variant — never an arbitrary explosion of denominations.

## Synchronization flow

`src/lib/db/pricing.ts` → `syncReloadlyProviderCosts()`; CLI entry point
`scripts/reloadly-cost-sync.ts` (`npm run reloadly:cost-sync`).

1. Open a `PricingSyncRun` (status `failed` until proven otherwise).
2. Load mapped variants (`stockControl="reloadly"`, `reloadlyProductId` set),
   group face values per Reloadly product.
3. Fetch each product once; compute cost per target face value via
   `computeProviderCost`; upsert `ReloadlyProviderCost`
   (`environment, reloadlyProductId, recipientFaceValue`).
4. Never touches `priceMad`. Close the run with `success` | `partial` | `failed`
   and counts, so a failed/partial sync is visible and can't be mistaken for
   fresh data.

**Safe run:** `RELOADLY_ENV` fails closed to `sandbox`. A live sync additionally
requires `CONFIRM_LIVE=1`.

## Ghost.ma internal FX rates & policy

Admin-controlled, stored as a keyed `StoreSetting` row (`id="pricing"`);
`src/lib/db/pricing-settings.ts`. **No automatic FX feed in this phase.**

- `fxRatesToMad` — MAD per 1 unit of a supplier currency, e.g.
  `{ EUR: 10.9, USD: 10.2 }`. Extensible: add a currency = add a key.
- `defaultMarginPct`, `roundingIncrement` (1 | 5 | 10), `roundingMode`
  (`nearest` | `up`).

## Margin hierarchy (most specific wins)

`src/lib/pricing/suggested-price.ts` → `resolveMargin`:

1. variant fixed-price override (`ProductVariant.fixedSuggestedPriceMad`)
2. variant margin % (`ProductVariant.marginPctOverride`)
3. product margin % (`Product.marginPctOverride`)
4. category margin % (`Category.marginPctOverride`)
5. global default margin %

A `0` override is a real value (not "unset"). The variant **fixed-price
override** pins the *suggestion* to a MAD amount and bypasses cost/FX/margin/
rounding — but it is still a suggestion; it never silently overwrites `priceMad`.

## Suggested vs published price

`computeSuggestedPrice` pipeline:

```
provider cost (sender currency)
  → × internal FX rate            → cost in MAD
  → × (1 + margin/100)            → raw MAD price
  → rounding rule                 → suggested MAD price (integer)
```

The breakdown exposes: provider cost, supplier currency, FX rate, cost in MAD,
margin source + %, raw price, rounding rule, suggested price, published price,
and the MAD/percent delta. If the supplier currency has no configured FX rate,
it returns a typed `missing_fx_rate` failure instead of inventing a price.

Verified example (Netflix US 20 USD): cost 19.7532 EUR × 10.9 = 215.31 MAD,
+15% default margin → round up to 5 → **250 MAD suggested** vs 210 published
(status `changed`).

## Explicit publishing workflow

Admin → **Tarification** panel (`src/components/admin/PricingPanel.tsx`):

- **Synchroniser les coûts** — runs a sync (cost layer only).
- Global settings (FX rates, default margin, rounding) + category / product /
  variant margin overrides + variant fixed-price override.
- Per-variant table: provider cost, converted MAD cost, suggested price,
  published price, expected gross profit/margin, last sync time, status.
- **Recalculer** (refresh) and **Publier ce prix** (explicit single publish);
  **Publier les prix sélectionnés** (explicit bulk publish).

`publishSuggestedPrice` recomputes server-side (never trusts a client number)
and refuses rows without a computable suggestion. **No automatic publishing.**

## Price drift visibility

Row status: `up_to_date`, `changed` (suggested ≠ published — a warning is shown
with the MAD delta), `missing_cost`, `missing_fx`, `invalid_mapping`. Filterable
in the admin panel. Drift never modifies the published price.

## Fulfillment cost reconciliation

`src/lib/db/pricing.ts` → `recordReloadlyCostReconciliation`, called
(non-blocking) from `deliverOrder` after a successful Reloadly order. It compares
the **estimated** cost (synced catalog data for the same
environment/product/face value) against the **actual** cost
(`balanceInfo.cost`), and appends a `ReloadlyCostReconciliation` row
(estimated, actual, difference, currency, timestamp). Append-only audit — it
never feeds back into any customer price and is never shown to customers.

## Why storefront pricing never depends on a live Reloadly request

Customer prices are read from `ProductVariant.priceMad` only. Reloadly is reached
solely by (a) the admin-triggered cost sync and (b) fulfillment. This keeps the
storefront fast and available even if Reloadly is down, prevents live FX/discount
drift from silently moving customer prices, and makes every published price the
result of an explicit human decision.

## Schema (Phase 1 additions)

- `Product.marginPctOverride`, `Category.marginPctOverride` — `Decimal?`
  suggestion-only margin overrides.
- `ProductVariant.marginPctOverride` (`Decimal?`), `fixedSuggestedPriceMad`
  (`Int?`) — suggestion-only overrides.
- `ReloadlyProviderCost` — the cost layer (Decimal money; env-stamped; unique on
  `environment, reloadlyProductId, recipientFaceValue`).
- `PricingSyncRun` — sync audit.
- `ReloadlyCostReconciliation` — estimated-vs-actual fulfillment cost audit.

Migration: `prisma/migrations/20260709160000_add_pricing_subsystem/`.

## Catalog importer (Phase 2)

`docs` cross-ref: `architecture.md` §7b. Route
`/admin/catalog/import-reloadly` (**Catalogue → Importer Reloadly**). Search
Reloadly products, choose region + denominations, review cost/suggested price,
then **Ajouter au catalogue** creates the Ghost product/variants.

- Server: `src/lib/db/catalog-import.ts`; actions
  `src/app/actions/catalog-import.ts`; UI `src/components/admin/ReloadlyImporter.tsx`.
- Per-denomination preview reuses the exact Phase 1 engine, so the importer
  preview equals what the pricing panel later shows.
- FIXED = all offered denominations; RANGE = only admin-chosen denominations,
  validated against Reloadly min/max.
- Region mapped from Reloadly country (`reloadlyCountryToRegion`), unknown → ""
  (admin completes). Published price defaults to suggested but is editable
  before import; nothing auto-publishes. Places **no** Reloadly order.
- Dedup: existing slug reused (variants appended); an existing
  `(product, faceValue, faceCurrency)` variant is skipped ("Déjà ajouté").
- Import also upserts `ReloadlyProviderCost` for imported denominations so the
  pricing panel is immediately accurate. Manual/local products (e.g. Valorant)
  remain first-class and unaffected.

## Tests

`test/pricing/*.test.ts` (`npm test`): FIXED/RANGE cost, flat/percentage fee,
discount, fee+discount, non-EUR recipient, margin precedence, FX conversion,
nearest/always-up rounding, fixed override, missing-FX handling, and the
Reloadly-country→region mapping. The sync-never-changes-`priceMad`,
sandbox/live-separation, and importer flows (search, FIXED/RANGE import,
duplicate prevention, storefront visibility, mapping validity, manual products
unaffected) are additionally verified end-to-end against the sandbox + a Neon
dev branch with cleanup.
