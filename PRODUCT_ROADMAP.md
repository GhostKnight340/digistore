# Ghost.ma Product Roadmap

> **Single source of truth for the evolution of Ghost.ma.**
> Ghost.ma is a Moroccan digital-goods store (gift cards, licences, subscriptions).
> The platform, catalogue, checkout, payments, fulfilment, auth, email, Discord,
> and admin operations already exist and work. This document is **not** a status
> report of what is done — the [`architecture.md`](./architecture.md) covers that.
> It only records **what is left to do**: unfinished work, improvements, and
> future ideas.

## How to read and use this roadmap

- **This document evolves.** It is expected to change after every major release.
  Items move between sections; completed items are archived (see §7).
- **Launch comes before perfection.** Section 1 is intentionally small. If an
  item does not stop Ghost.ma from operating reliably for real, paying customers,
  it does **not** belong in Launch.
- **Every new idea is evaluated against this roadmap.** Before building anything
  new, decide where it fits — Launch, After Launch, or Future Ideas — using the
  Product Principles in §6. If it does not earn a place, it waits.
- Scope is grounded in the **real current state** of the codebase. Nothing here
  is invented; every item is either an already-identified limitation, a natural
  extension of a shipped feature, or an explicit "not yet" in the code.

---

# SECTION 1 — 🚀 LAUNCH — MUST HAVE

> Only what is genuinely required before accepting real customers.
> Guiding question: *"What would prevent Ghost.ma from operating reliably?"*
> Sorted by priority within each category.

## Payments & Providers

- **Take PayPal live** — *High priority*
  - PayPal runs in **sandbox by default**; it is unusable at checkout until
    `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_WEBHOOK_ID`, and the
    public client id are all set with live credentials and `PAYPAL_ENV=live`.
  - *Why before launch:* automated card/PayPal payment is a primary, self-serve
    revenue path. Without it, every non-bank customer is blocked.
  - *Complexity:* **Low** (configuration + verification; code is done).

- **Take Reloadly live** — *High priority*
  - Reloadly **fails closed to sandbox**; automated gift-card fulfilment needs
    separate live credentials and `RELOADLY_ENV=live`, plus a funded wallet.
  - *Why before launch:* without live Reloadly, every API-sourced product must be
    fulfilled manually, which does not scale and delays delivery.
  - *Complexity:* **Low** (configuration + funded-wallet verification).

- **Reloadly fulfilment idempotency ledger** — *High priority*
  - Multi-Reloadly-item orders have **no persisted idempotency ledger**;
    re-clicking "Livrer" after a mid-way failure can **re-purchase** earlier
    items (real money).
  - *Why before launch:* this is the main correctness/financial risk in the
    fulfilment path. Even if rare, a double-spend on a real order erodes trust and
    costs money.
  - *Complexity:* **Medium**.

- **Confirm crypto (USDT) manual flow is acceptable for launch** — *Medium priority*
  - Crypto is configured as a manual method with **no on-chain verification** —
    an admin confirms the proof by hand.
  - *Why before launch:* acceptable to launch as manual, but the operational
    expectation (admin verifies every crypto payment) must be explicit, or the
    method should be hidden until verification exists.
  - *Complexity:* **Low** (decision + optional method visibility toggle).

## Delivery & Orders

- **Discord auto-DM retry for admins** — *Medium priority*
  - Admins can **see** a failed Discord delivery status but cannot re-trigger a
    failed automatic DM from the admin UI (the customer-facing manual resend does
    exist; a UI seam is already reserved in `OrderDetailPage`).
  - *Why before launch:* Discord DM is an **additive** channel — email + delivery
    page always deliver the codes — so this is a convenience, not a blocker.
    Include only if Discord delivery is promoted as a headline channel at launch.
  - *Complexity:* **Low**.

## Infrastructure & Data

- **Object storage for proofs & admin images** — *Medium priority*
  - Payment proofs and admin-uploaded images are stored as **base64 / `data:`
    URIs inside Postgres**. This inflates DB rows and is flagged in-code as a
    pending migration.
  - *Why before launch:* fine at current scale; becomes a reliability/cost concern
    as volume grows. Launch-blocking only if early volume is expected to be high.
  - *Complexity:* **Medium** (introduce S3/Blob + migrate read/write paths).

- **Production DB & deploy configuration verified** — *High priority*
  - Confirm `DATABASE_URL` (pooled) and `DIRECT_URL` (direct, required for
    migrations) are set on the host, and that the Discord DM worker is actually
    running on its always-on host (`ghost.ma#9303`).
  - *Why before launch:* a missing `DIRECT_URL` **fails the build**; a stopped DM
    worker silently breaks Discord activation.
  - *Complexity:* **Low** (verification/checklist).

- **Migration runbook discipline** — *Medium priority*
  - `prisma migrate deploy` applies **all pending migrations in one run**;
    multi-migration releases with data steps must follow the existing runbook
    rather than the plain automatic deploy.
  - *Why before launch:* a data-losing or ordering-sensitive migration shipped via
    the automatic path can corrupt production.
  - *Complexity:* **Low** (process, not code).

## Monitoring & Security

- **Error monitoring / alerting** — *High priority*
  - There is **no error-tracking service** (no Sentry/Datadog). Failures surface
    only through admin Discord notifications for specific events (e.g. email
    failure), not as a general error feed.
  - *Why before launch:* without centralized error visibility, silent production
    failures (failed fulfilment, payment edge cases) can go unnoticed.
  - *Complexity:* **Medium**.

- **Rate limiting on sensitive endpoints** — *High priority*
  - No application-level rate limiting on auth (login/register/reset), proof
    upload, order lookup (`/find-order`, enumerable public order numbers), or
    activation-code generation.
  - *Why before launch:* protects against credential stuffing, order-number
    enumeration, and abuse of email/code generation.
  - *Complexity:* **Medium**.

- **Payment reconciliation review** — *Medium priority*
  - PayPal captures are verified against the locked-in snapshot; confirm the
    manual bank/crypto path has a clear admin reconciliation habit (amounts,
    duplicates) before real money flows.
  - *Why before launch:* prevents under/over-payment slipping through manual
    review.
  - *Complexity:* **Low** (process + light UI surfacing).

## Admin Operations

- **Payment-review queue at launch scale** — *Medium priority*
  - Manual bank/crypto proofs require an admin to review each order. Confirm the
    overview review queue is sufficient for expected daily volume (oldest-first,
    visible aging).
  - *Why before launch:* delivery speed depends entirely on how fast proofs are
    reviewed; a slow queue directly hurts the customer experience.
  - *Complexity:* **Low** (validation; escalate to Medium if a dedicated queue
    page is needed).

---

# 🗺️ LAUNCH MILESTONES

> A concise, operational bridge between the Launch must-haves and the growth
> roadmap. Phased checkpoints, not features. **Launch comes before perfection:**
> do not scale until each phase's exit is met.

### Pre-launch
- Complete all Launch Must-Haves (§1).
- Verify **live PayPal** end-to-end.
- Verify **funded/live provider** (Reloadly) fulfilment.
- Run an **end-to-end real-order test** (pay → confirm → fulfil → deliver).
- Verify transactional emails render and send.
- Verify monitoring and alerts fire.
- Define the **initial reliable catalogue**.
- Prepare first ad creatives and brand assets.
- Prepare support coverage (who answers, how fast).

### Launch week
- Run **low-budget Meta campaigns** only.
- Watch **every order manually**.
- Review the funnel **daily**.
- Pause campaigns immediately if payment or fulfilment reliability degrades.

### First 30 days
- Identify top products and no-result searches.
- Measure conversion and customer acquisition cost (CAC).
- Collect real customer feedback.
- Fix the highest-friction issues first.
- **Do not scale spend** until unit economics and operations are understood.

### First 90 days
- Decide whether to scale ads.
- Begin creator outreach.
- Introduce referral or loyalty **only when repeat-purchase behaviour justifies it**.
- Expand suppliers/catalogue based on real demand.

---

# SECTION 2 — 📈 AFTER LAUNCH

> The main growth roadmap. Grouped by priority tier, then by category.
> Every item is a realistic extension of something that already exists.

## Priority 1 — Reliability, trust, acquisition, and operating leverage

### Fulfilment & Providers
- **Auto-pricing & auto-publish from Reloadly cost sync**
  - *Description:* the pricing subsystem computes cost → suggested price today, but
    publishing to `priceMad` is a manual admin action. Add rule-based auto-publish
    (guardrailed by margin/deviation checks already in the pricing panel).
  - *Customer benefit:* consistently up-to-date, fair prices.
  - *Business benefit:* removes manual repricing labour; protects margin as
    provider costs move.
  - *Complexity:* **Medium.** *Depends on:* pricing subsystem (shipped).

- **Provider idempotency & partial-failure recovery UI**
  - *Description:* build on the launch idempotency ledger with an admin view of
    which line items purchased vs failed, and safe per-item retry.
  - *Customer benefit:* faster, correct delivery when a multi-item order partially
    fails.
  - *Business benefit:* eliminates manual investigation and double-spend risk.
  - *Complexity:* **Medium.** *Depends on:* launch idempotency ledger.

### Admin & Analytics
- **Internal analytics dashboard**
  - *Description:* analytics today is Google Analytics events only. Add
    first-party dashboards for revenue, conversion, top products, payment-method
    mix, and fulfilment latency, sourced from the existing order/payment data.
  - *Customer benefit:* indirect — better decisions improve catalogue & pricing.
  - *Business benefit:* decisions grounded in owned data, not just GA.
  - *Complexity:* **Medium.**

- **Customer management view**
  - *Description:* admin list/detail for customers with order history and lifetime
    value; the data exists (`Customer`, `Order`), the admin surface does not.
  - *Customer benefit:* faster, more informed support.
  - *Business benefit:* identify high-value customers; support efficiency.
  - *Complexity:* **Medium.**

### Support
- **Support SLA visibility & notifications**
  - *Description:* the support-ticket system exists; add response-time surfacing,
    unanswered-ticket alerts, and clearer customer-facing status.
  - *Customer benefit:* faster, more predictable support.
  - *Business benefit:* fewer dropped tickets; measurable support quality.
  - *Complexity:* **Medium.** *Depends on:* support tickets (shipped).

### Marketing & Customer Acquisition
- **Meta Ads launch and optimisation**
  - *Description:* start with controlled Instagram/Facebook campaigns; track
    impressions → clicks → add-to-cart → checkout → purchase and CAC. Scale only
    after fulfilment and support are proven reliable.
  - *Customer benefit:* more awareness of a relevant Moroccan digital store.
  - *Business benefit:* a repeatable paid acquisition channel.
  - *Complexity:* **Low–Medium.** *Depends on:* purchase tracking, stable
    checkout, live payment flow.

- **Creator and influencer partnerships**
  - *Description:* begin with Moroccan micro-influencers in gaming, tech,
    entertainment, and digital lifestyle; use trackable promo/referral codes and
    campaign links; prefer ongoing partnerships over one-off mentions.
  - *Customer benefit:* trusted local recommendations.
  - *Business benefit:* lower-cost, higher-trust acquisition.
  - *Complexity:* **Medium.** *Depends on:* referral attribution, reliable
    fulfilment, social proof.

- **Instagram content system**
  - *Description:* repeatable content types — product spotlights, Navigator Tips,
    buying guides, customer reviews, promotions, launches — across feed, reels,
    stories, and highlights.
  - *Customer benefit:* useful, consistent content, not just ads.
  - *Business benefit:* organic reach and brand recall.
  - *Complexity:* **Low.** *Depends on:* final brand assets, product media.

- **Launch campaign plan**
  - *Description:* soft launch, controlled ad spend, a limited reliable catalogue,
    daily order/funnel review, and clear go/no-go criteria for scaling.
  - *Customer benefit:* a stable first experience.
  - *Business benefit:* de-risked launch; spend tied to proven reliability.
  - *Complexity:* **Low.** *Depends on:* Launch Must-Haves complete.

- **Email marketing foundation**
  - *Description:* permission-based campaigns only — product launches, win-back,
    reminders, seasonal offers. Avoid spammy broadcasting.
  - *Customer benefit:* relevant, opt-in updates.
  - *Business benefit:* owned channel independent of ad platforms.
  - *Complexity:* **Medium.** *Depends on:* consent management, customer
    segmentation.

### Trust & Reputation
- **Verified customer reviews**
  - *Description:* only customers with completed orders can review; moderate abuse
    without suppressing legitimate criticism.
  - *Customer benefit:* honest signal before buying.
  - *Business benefit:* conversion lift from credible social proof.
  - *Complexity:* **Medium.** *Depends on:* completed-order data.

- **Customer testimonials & social proof**
  - *Description:* use real, consented feedback; never fabricate order counts or
    satisfaction claims.
  - *Customer benefit:* reassurance from real buyers.
  - *Business benefit:* trust-driven conversion.
  - *Complexity:* **Low.**

- **"Pourquoi Ghost.ma ?" trust page/section**
  - *Description:* explain payment methods, support, delivery process, official
    sourcing where applicable, and regional-compatibility guidance.
  - *Customer benefit:* clear answers to "can I trust this store?".
  - *Business benefit:* fewer pre-purchase drop-offs.
  - *Complexity:* **Low.**

- **Transparent service-status communication**
  - *Description:* communicate maintenance, provider outages, delayed fulfilment,
    and payment delays honestly.
  - *Customer benefit:* no silent failures; managed expectations.
  - *Business benefit:* trust retained during incidents.
  - *Complexity:* **Low–Medium.**

- **Public-facing trust metrics**
  - *Description:* surface metrics such as delivered orders, support response time,
    and fulfilment success rate — **only once real data exists; never synthetic**.
  - *Customer benefit:* verifiable proof of reliability.
  - *Business benefit:* credibility as a moat.
  - *Complexity:* **Medium.** *Depends on:* first-party analytics.

## Priority 2 — Growth, conversion, and merchandising

### Catalogue & Collections
- **Richer collections & merchandising**
  - *Description:* collections and featured/grouped search exist; extend with
    scheduled collections, seasonal placement, and homepage block editing depth.
  - *Customer benefit:* easier discovery of relevant products.
  - *Business benefit:* higher conversion via merchandising control.
  - *Complexity:* **Medium.** *Depends on:* collections + homepage editor (shipped).

- **Bulk code import & low-stock thresholds**
  - *Description:* add bulk paste/upload of local codes mapped to variants, and
    per-variant low-stock thresholds feeding the existing stock alerts.
  - *Customer benefit:* fewer out-of-stock disappointments.
  - *Business benefit:* less manual inventory work; proactive restocking.
  - *Complexity:* **Medium.** *Depends on:* inventory model (shipped).

### Search & SEO
- **Search relevance & filters**
  - *Description:* grouped customer-facing search exists; add faceted filters
    (brand, region, price) and relevance tuning.
  - *Customer benefit:* find the right product faster.
  - *Business benefit:* higher search-to-purchase conversion.
  - *Complexity:* **Medium.** *Depends on:* search (shipped).

- **SEO depth**
  - *Description:* sitemap, robots, and per-page metadata/OpenGraph exist on key
    pages; extend structured data (product/offer JSON-LD), canonical coverage, and
    metadata to all catalogue pages.
  - *Customer benefit:* better-quality entry from search engines.
  - *Business benefit:* organic acquisition without ad spend.
  - *Complexity:* **Medium.** *Depends on:* existing SEO scaffolding.

### Storefront
- **Real-time order status feedback**
  - *Description:* status updates rely on server actions + refresh; add lighter
    polling or push so customers see payment/delivery transitions without manual
    refresh.
  - *Customer benefit:* reassurance during the wait between pay and delivery.
  - *Business benefit:* fewer "where is my order" support tickets.
  - *Complexity:* **Medium.**

### Customer Retention
- **Loyalty points system**
  - *Description:* reward repeat purchases with clear earning/redemption rules;
    prefer **store credit** over cash-equivalent withdrawals.
  - *Customer benefit:* tangible value for coming back.
  - *Business benefit:* higher repeat-purchase rate and LTV.
  - *Complexity:* **Medium.** *Depends on:* customer accounts, completed-order
    tracking.

- **Referral system**
  - *Description:* reward both referrer and new customer **only after a valid
    completed first order**; include abuse prevention and trackable codes/links.
  - *Customer benefit:* rewarded word-of-mouth.
  - *Business benefit:* low-cost acquisition through existing customers.
  - *Complexity:* **Medium–High.** *Depends on:* customer accounts, promo system,
    attribution.

- **Occasional promo codes & scheduled promotions**
  - *Description:* avoid permanent discounting; support expiry, usage limits,
    campaign attribution, product/category restrictions, and minimum spend.
  - *Customer benefit:* timely, meaningful offers.
  - *Business benefit:* controlled, measurable discounting.
  - *Complexity:* **Medium.** *Depends on:* checkout discount support.

- **Abandoned-cart recovery**
  - *Description:* only when consent and customer identity are available; do not
    send repeated reminders.
  - *Customer benefit:* a helpful nudge, not spam.
  - *Business benefit:* recovered conversions.
  - *Complexity:* **Medium.** *Depends on:* analytics, email consent, cart
    persistence.

- **Win-back campaigns**
  - *Description:* re-engage customers who have not purchased for a meaningful
    period.
  - *Customer benefit:* relevant return offers.
  - *Business benefit:* reactivated lapsed customers.
  - *Complexity:* **Medium.** *Depends on:* customer history, email consent.

- **Customer levels / tiers**
  - *Description:* lower priority than loyalty and referral; progression can be
    defined later. **Not a launch requirement.**
  - *Customer benefit:* status and escalating perks.
  - *Business benefit:* incentivised spend concentration.
  - *Complexity:* **Medium.** *Depends on:* loyalty system.

### Customer Education & Content
- **Activation guides**
  - *Description:* Steam, PlayStation, Xbox, Nintendo, Apple, Google Play, Netflix,
    software licences, and other relevant products.
  - *Customer benefit:* confident, self-serve redemption.
  - *Business benefit:* fewer support tickets; higher satisfaction.
  - *Complexity:* **Low.**

- **Region & compatibility guides**
  - *Description:* explain FR, EU, US, Global, account country, billing currency,
    and platform restrictions.
  - *Customer benefit:* fewer wrong-region purchases.
  - *Business benefit:* fewer refunds/disputes.
  - *Complexity:* **Low.**

- **Navigator Tips expansion**
  - *Description:* use the approved Navigator as a **contextual** guide across
    category, product, checkout, payment, and support surfaces. Keep tips concise
    and useful — do not make the mascot decorative everywhere.
  - *Customer benefit:* in-context help at decision points.
  - *Business benefit:* smoother funnel, stronger brand.
  - *Complexity:* **Low–Medium.**

- **Category & platform landing pages**
  - *Description:* rich landing pages with hero, products, FAQs, trust points, and
    guides. Where partly shipped, only the unfinished depth is roadmap work.
  - *Customer benefit:* a focused entry point per platform.
  - *Business benefit:* SEO and conversion.
  - *Complexity:* **Medium.** *Depends on:* category landing scaffolding (partly
    shipped).

- **Buying guides & comparisons**
  - *Description:* e.g. Steam Wallet vs direct game purchase, Netflix EUR
    compatibility, choosing the correct PlayStation region.
  - *Customer benefit:* better-informed choices.
  - *Business benefit:* organic traffic and trust.
  - *Complexity:* **Low.**

- **FAQ content governance**
  - *Description:* keep answers current and linked to real policies.
  - *Customer benefit:* accurate, trustworthy answers.
  - *Business benefit:* fewer tickets from stale content.
  - *Complexity:* **Low.**

### Pricing & Commercial Strategy
- **Competitor price monitoring**
  - *Description:* compare **final customer-facing prices only**; do not assume
    competitor margins or supplier costs.
  - *Customer benefit:* competitive prices.
  - *Business benefit:* informed positioning.
  - *Complexity:* **Medium.**

- **Margin guardrails**
  - *Description:* minimum and target margin by category/provider; warn before
    publishing loss-making prices.
  - *Customer benefit:* sustainable store that stays open.
  - *Business benefit:* protected profitability.
  - *Complexity:* **Medium.** *Depends on:* existing pricing subsystem.

- **Promotion impact tracking**
  - *Description:* measure whether discounts improve conversion or only reduce
    margin.
  - *Customer benefit:* better-targeted offers.
  - *Business benefit:* discounting spent where it pays back.
  - *Complexity:* **Medium.**

- **Scheduled promotions**
  - *Description:* support start/end dates and campaign scope.
  - *Customer benefit:* clear, time-bound deals.
  - *Business benefit:* planned campaign execution.
  - *Complexity:* **Medium.** *Depends on:* checkout discount support.

- **Bundle pricing**
  - *Description:* explore only when multiple products combine safely without
    fulfilment ambiguity.
  - *Customer benefit:* better value on combined buys.
  - *Business benefit:* higher average order value.
  - *Complexity:* **Medium–High.**

- **Product profitability reporting**
  - *Description:* revenue, provider cost, payment fees, discount cost, refunds,
    and gross contribution per product. **Never show provider cost or margin to
    customers.**
  - *Customer benefit:* none (internal).
  - *Business benefit:* know what actually makes money.
  - *Complexity:* **Medium.** *Depends on:* first-party analytics and expense data.

### Brand & Navigator
- **Complete Navigator rollout**
  - *Description:* website, emails, Discord, social media, and
    loading/success/support states.
  - *Customer benefit:* a coherent, recognisable experience.
  - *Business benefit:* stronger brand recall.
  - *Complexity:* **Medium.**

- **Navigator brand page**
  - *Description:* present the mascot and its role.
  - *Customer benefit:* a friendly brand anchor.
  - *Business benefit:* brand differentiation.
  - *Complexity:* **Low.**

- **Brand consistency guide**
  - *Description:* logo, typography, product media, tone of voice, seasonal usage.
  - *Customer benefit:* a polished, trustworthy feel.
  - *Business benefit:* consistent execution across channels.
  - *Complexity:* **Low–Medium.**

- **Social media template system**
  - *Description:* consistent, reusable layouts for posts, reels covers, stories,
    and highlights.
  - *Customer benefit:* recognisable content.
  - *Business benefit:* faster, on-brand content production.
  - *Complexity:* **Low.**

- **Seasonal Navigator variants** *(below core rollout in priority)*
  - *Description:* Ramadan, Eid, New Year, Halloween, and Ghost.ma anniversary
    variants — **core identity unchanged**.
  - *Customer benefit:* timely, delightful moments.
  - *Business benefit:* seasonal engagement.
  - *Complexity:* **Low–Medium.** *Depends on:* Navigator rollout + brand guide.

### Partnerships & Supplier Strategy
- **Additional B2B supplier onboarding**
  - *Description:* Relograde / Rewarble, Eneba B2B (if eligible), local Moroccan
    suppliers, and direct publisher/distributor relationships.
  - *Customer benefit:* wider, better-priced catalogue.
  - *Business benefit:* supply resilience and margin options.
  - *Complexity:* **Medium–High.**

- **Supplier reliability scorecard**
  - *Description:* track fulfilment success, replacement rate, response time, price
    stability, and stock availability.
  - *Customer benefit:* fewer failed deliveries.
  - *Business benefit:* route spend to reliable suppliers.
  - *Complexity:* **Medium.**

- **Local business partnerships**
  - *Description:* cybercafés, gaming shops, streamers, tournament organisers.
  - *Customer benefit:* local presence and trust.
  - *Business benefit:* offline acquisition channels.
  - *Complexity:* **Medium.**

- **Creator affiliate programme**
  - *Description:* trackable links/codes, transparent payout rules, fraud controls.
  - *Customer benefit:* trusted creator recommendations.
  - *Business benefit:* performance-based acquisition.
  - *Complexity:* **Medium–High.** *Depends on:* referral attribution.

- **B2B bulk sales** *(later-stage growth option, not launch work)*
  - *Description:* bulk purchasing for businesses/resellers.
  - *Customer benefit:* volume purchasing for business buyers.
  - *Business benefit:* higher-value orders.
  - *Complexity:* **Medium–High.**

## Priority 3 — Operational polish & automation

### Automation & Business Operations
- **Auto-expire unverified payments**
  - *Description:* automatically flag/cancel pending orders whose proof never
    arrives after a configured window.
  - *Customer benefit:* clearer state; no zombie orders.
  - *Business benefit:* cleaner queue; accurate stock reservation.
  - *Complexity:* **Medium.**

- **Extend business-ops (expenses) automation**
  - *Description:* the recurring-expense + monthly-review + Discord-notification
    subsystem exists (with cron jobs). Extend reporting, FX handling, and receipt
    storage.
  - *Customer benefit:* none (internal).
  - *Business benefit:* better cost visibility and financial discipline.
  - *Complexity:* **Medium.** *Depends on:* expenses subsystem (shipped).

### Admin
- **Cross-entity command palette / global search**
  - *Description:* fast admin jump-to for orders, products, and customers.
  - *Customer benefit:* indirect — faster ops.
  - *Business benefit:* operator speed at higher volume.
  - *Complexity:* **Hard.** *Depends on:* customer management view.

- **Performance: reduce forced-dynamic admin rendering**
  - *Description:* admin reads force `dynamic` rendering, trading caching for
    freshness. Introduce targeted caching/revalidation where staleness is safe.
  - *Customer benefit:* none directly.
  - *Business benefit:* lower serverless cost, faster admin.
  - *Complexity:* **Medium.**

---

# SECTION 3 — 💡 FUTURE IDEAS

> Ideas worth exploring later. **Not planned, not launch blockers.** Listed to
> capture direction, not commitment. (Referral, loyalty, creator partnerships,
> affiliate, and seasonal branding have been **promoted into After Launch** and
> now live there only.)

- **AI operations** — support-reply drafting, anomaly detection on orders/payments,
  demand forecasting.
- **Wishlist** — save products for later, notify on restock/price drop.
- **Gift purchases** — buy a code as a gift, deliver to a recipient.
- **Live chat** — real-time support beyond the ticket system.
- **Advanced analytics** — cohort/LTV/funnel dashboards beyond the P1 basics.
- **Saved payment methods** — provider-side vaulting/tokenization (never storing
  PANs) for returning customers.
- **On-chain crypto verification** — automatic confirmation of USDT payments.
- **B2B expansion** — bulk purchasing, invoicing, business accounts.
- **International expansion** — multi-currency display, non-MAD regions,
  localisation beyond French.

### Low priority / exploratory
- **Recommendation engine** — "customers also bought", personalised homepage.
- **Native mobile app** — native wrapper (a PWA manifest already exists as a
  foundation).
- **Community features** — Discord-integrated community perks, roles for buyers.
- **Gamification** — badges, streaks, launch-day drops.

---

# SECTION 4 — 📊 BUSINESS KPIs

> Measurable outcomes, not features. These define what "working" means for the
> business. **Revenue is not profit** — track contribution and margin, not just
> top line. Where no baseline exists yet, targets are marked *to be established
> after launch baseline*; do not hardcode unrealistic numbers.

## Launch validation
- First order from a non-friend/non-family customer.
- First successful end-to-end **automated** fulfilment.
- First repeat customer.
- First 20 completed orders.
- Zero duplicate provider purchases.
- No unresolved critical production failures.

## Customer acquisition
*(targets to be established after launch baseline)*
- Cost per landing-page view.
- Cost per add-to-cart.
- Cost per completed order.
- Customer acquisition cost (CAC).
- Return on ad spend (ROAS).
- Creator campaign conversion.

## Conversion
*(targets to be established after launch baseline)*
- Product-view → add-to-cart rate.
- Add-to-cart → checkout rate.
- Checkout → payment-completion rate.
- Overall conversion rate.

## Retention
*(targets to be established after launch baseline)*
- Repeat purchase rate.
- 30 / 60 / 90-day returning-customer rate.
- Referral share of new customers.
- Loyalty redemption rate.

## Operations
*(targets to be established after launch baseline)*
- Average payment-review time.
- Average fulfilment time.
- Failed fulfilment rate.
- Replacement / refund rate.
- Support first-response time.
- Support resolution time.

## Financial
*(revenue is not profit — track all of these, not just revenue)*
- Monthly revenue.
- Gross margin.
- Gross profit.
- Marketing spend.
- Contribution after variable costs.
- Average order value (AOV).
- Customer lifetime value (LTV).

---

# SECTION 5 — 🎯 LONG-TERM VISION

Ghost.ma is not "a website that sells gift cards." It is becoming:

- **A trusted digital-commerce platform** for Morocco, where customers buy
  digital goods with confidence in delivery and support.
- **A premium Moroccan experience** — clean, fast, French-first, and locally
  relevant, distinct from generic global resellers.
- **A strong, recognisable brand** — consistent identity across storefront,
  email, and Discord.
- **An automation-first operation** — pricing, fulfilment, and finance run with
  minimal manual work, so the business scales without proportional headcount.
- **A scalable and reliable system** — correct fulfilment, sound payments, and
  observable operations under growing load.
- **Operational excellence with human backup** — automation handles the common
  path; real people handle the exceptions.
- **Customer trust as the moat** — reliable delivery and honest support are the
  product, not just features around it.

---

# SECTION 6 — 📌 PRODUCT PRINCIPLES

Use these to decide whether an idea belongs in Launch, After Launch, or Future
Ideas.

- **Launch before perfection.** Ship the reliable minimum; refine in the open.
- **Reliability over feature count.** A correct, boring flow beats a broad,
  fragile one.
- **Every feature should reduce friction.** If it adds steps without removing
  more, reconsider.
- **Premium over flashy.** Restraint and consistency signal trust better than
  novelty.
- **Automate where it improves operations.** Automation is justified by fewer
  manual errors and less repeat labour — not by being impressive.
- **Human support when automation cannot.** Keep a real fallback for every
  automated path.
- **Consistency before novelty.** A predictable system earns trust; surprises
  spend it.
- **Customer trust above everything.** Never trade delivery reliability, payment
  correctness, or data safety for speed of shipping.
- **Never sacrifice UX for unnecessary complexity.** Complexity must pay for
  itself in customer value.

---

# SECTION 7 — ROADMAP MAINTENANCE

- **Review after every major release.** Re-check Launch and Priority 1 against
  reality; remove what shipped.
- **Move completed items to an archive.** Keep this document about the future;
  the [`architecture.md`](./architecture.md) records what is done.
- **Re-prioritise quarterly.** Tiers are not permanent; shift items as the
  business changes.
- **Validate with customer feedback, not assumptions.** Promote an idea only when
  real demand or a real problem supports it.
- **Do not let Future Ideas become Launch blockers.** Section 3 never gates
  launch; if an idea truly must ship first, justify moving it explicitly.
- **Keep it honest.** Do not inflate the feature count. A short, real roadmap is
  more useful than a long, aspirational one.
