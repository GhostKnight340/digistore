/**
 * Ghost Credit — TRUE Postgres concurrency integration tests.
 *
 * These exercise the real wallet code paths (grantCreditTx / debitCreditTx /
 * expireWalletIfDue / expireAbandonedOrders / grantMilestonesForCompletedOrder)
 * over REAL concurrent Postgres connections — not mocks — to prove the
 * `SELECT … FOR UPDATE` per-wallet serialization and the append-only idempotency
 * keys hold under contention.
 *
 * ── Safety ───────────────────────────────────────────────────────────────────
 * The suite is GATED behind WALLET_INTEGRATION_TEST_DATABASE_URL and does NOTHING
 * unless that env var is set. It hard-refuses to run when that URL equals the
 * app's DATABASE_URL or a declared PRODUCTION_DATABASE_URL, and (unless
 * WALLET_INTEGRATION_TEST_ALLOW_ANY=1) requires the URL to look like a
 * test/staging database. It never truncates tables: every test creates its own
 * uniquely-named rows (email prefix "wallet-itest+…") and deletes only those in
 * teardown, so an isolated schema on the staging server is untouched elsewhere.
 *
 * ── How to run (staging) ──────────────────────────────────────────────────────
 *   export WALLET_INTEGRATION_TEST_DATABASE_URL='postgresql://…/ghost_staging_test'
 *   # optional, only if the DB name doesn't contain "test"/"staging":
 *   #   export WALLET_INTEGRATION_TEST_ALLOW_ANY=1
 *   npx prisma migrate deploy   # ensure the test DB schema is current
 *   npm run test:integration
 *
 * The `test:integration` script (package.json) runs this file with
 * `--conditions=react-server` (required by the "server-only" imports).
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

const TEST_URL = process.env.WALLET_INTEGRATION_TEST_DATABASE_URL?.trim();

if (!TEST_URL) {
  test("wallet concurrency suite (SKIPPED — set WALLET_INTEGRATION_TEST_DATABASE_URL to run)", {
    skip: "WALLET_INTEGRATION_TEST_DATABASE_URL is not set",
  }, () => {});
} else {
  registerSuite(TEST_URL);
}

function assertSafeTarget(url: string) {
  const prod = process.env.DATABASE_URL?.trim();
  const declaredProd = process.env.PRODUCTION_DATABASE_URL?.trim();
  if (prod && url === prod) {
    throw new Error("REFUSING TO RUN: WALLET_INTEGRATION_TEST_DATABASE_URL == DATABASE_URL (production).");
  }
  if (declaredProd && url === declaredProd) {
    throw new Error("REFUSING TO RUN: target matches PRODUCTION_DATABASE_URL.");
  }
  const looksLikeTest = /test|staging|localhost|127\.0\.0\.1/i.test(url);
  if (!looksLikeTest && process.env.WALLET_INTEGRATION_TEST_ALLOW_ANY !== "1") {
    throw new Error(
      "REFUSING TO RUN: target does not look like a test/staging database. " +
        "Set WALLET_INTEGRATION_TEST_ALLOW_ANY=1 to override.",
    );
  }
}

function registerSuite(url: string) {
  assertSafeTarget(url);
  // Point the shared singleton at the test DB BEFORE the db modules load, so the
  // functions that open their own $transaction (expireAbandonedOrders,
  // grantMilestonesForCompletedOrder) hit the test database too.
  process.env.DATABASE_URL = url;

  // Populated in before().
  let db: import("@prisma/client").PrismaClient;
  let ghostCredit: typeof import("../../src/lib/db/ghostCredit");
  let orderExpiry: typeof import("../../src/lib/db/orderExpiry");
  let milestones: typeof import("../../src/lib/db/milestones");

  const createdCustomerIds: string[] = [];
  const createdOrderIds: string[] = [];
  const createdMilestoneIds: string[] = [];

  before(async () => {
    const { PrismaClient } = await import("@prisma/client");
    db = new PrismaClient({ datasources: { db: { url } } });
    (globalThis as unknown as { prisma?: unknown }).prisma = db;
    ghostCredit = await import("../../src/lib/db/ghostCredit");
    orderExpiry = await import("../../src/lib/db/orderExpiry");
    milestones = await import("../../src/lib/db/milestones");
  });

  after(async () => {
    if (!db) return;
    // Clean up ONLY the rows this suite created. Never a table-wide truncate.
    if (createdOrderIds.length) {
      await db.paymentEvent.deleteMany({ where: { orderId: { in: createdOrderIds } } });
    }
    if (createdCustomerIds.length) {
      await db.ghostCreditTransaction.deleteMany({ where: { customerId: { in: createdCustomerIds } } });
      await db.spendingMilestoneGrant.deleteMany({ where: { customerId: { in: createdCustomerIds } } });
    }
    if (createdOrderIds.length) {
      await db.order.deleteMany({ where: { id: { in: createdOrderIds } } });
    }
    if (createdMilestoneIds.length) {
      await db.spendingMilestone.deleteMany({ where: { id: { in: createdMilestoneIds } } });
    }
    if (createdCustomerIds.length) {
      await db.customer.deleteMany({ where: { id: { in: createdCustomerIds } } });
    }
    await db.$disconnect();
  });

  // ── helpers ────────────────────────────────────────────────────────────────
  async function seedWallet(opts: { balanceMad: number; expiresAt?: Date | null } = { balanceMad: 0 }) {
    const email = `wallet-itest+${randomUUID()}@example.test`;
    const customer = await db.customer.create({
      data: {
        name: "Wallet ITest",
        email,
        ghostCreditBalanceMad: opts.balanceMad,
        ghostCreditExpiresAt: opts.expiresAt ?? null,
      },
      select: { id: true },
    });
    createdCustomerIds.push(customer.id);
    if (opts.balanceMad > 0) {
      // A single active credit row that backs the seeded cached balance, so the
      // ledger and cache start reconciled.
      await db.ghostCreditTransaction.create({
        data: {
          customerId: customer.id,
          amountMad: opts.balanceMad,
          direction: "credit",
          reason: "promo_reward",
          status: "active",
          idempotencyKey: `itest-seed:${customer.id}`,
          source: "test",
        },
      });
    }
    return customer.id;
  }

  async function cached(customerId: string): Promise<number> {
    const c = await db.customer.findUnique({
      where: { id: customerId },
      select: { ghostCreditBalanceMad: true },
    });
    return c?.ghostCreditBalanceMad ?? 0;
  }

  async function derived(customerId: string): Promise<number> {
    const rows = await db.ghostCreditTransaction.findMany({
      where: { customerId, status: "active" },
      select: { direction: true, amountMad: true },
    });
    return rows.reduce((t, r) => t + (r.direction === "credit" ? r.amountMad : -r.amountMad), 0);
  }

  async function assertReconciled(customerId: string) {
    const [c, d] = await Promise.all([cached(customerId), derived(customerId)]);
    assert.equal(c, d, `cache (${c}) must equal ledger-derived balance (${d})`);
    assert.ok(c >= 0, `balance must never be negative (was ${c})`);
  }

  async function countLedger(customerId: string, where: Record<string, unknown>): Promise<number> {
    return db.ghostCreditTransaction.count({ where: { customerId, ...where } });
  }

  function spend(customerId: string, orderId: string, amountMad: number) {
    // Real checkout debit path (order_spend, one per order via orderSpendKey).
    return db.$transaction((tx) =>
      ghostCredit.debitCreditTx(tx, {
        customerId,
        amountMad,
        reason: "order_spend",
        idempotencyKey: `credit-spend:${orderId}`,
        orderId,
        allowNegative: false,
      }),
    );
  }

  async function makeAbandonedOrder(customerId: string, amountMad: number, ageHours: number) {
    const createdAt = new Date(Date.now() - ageHours * 60 * 60 * 1000);
    const order = await db.order.create({
      data: {
        customerId,
        customerName: "Wallet ITest",
        customerEmail: `wallet-itest+${randomUUID()}@example.test`,
        paymentMethod: "bank",
        status: "pending_payment",
        totalMad: 0,
        ghostCreditAppliedMad: amountMad,
        createdAt,
      },
      select: { id: true },
    });
    createdOrderIds.push(order.id);
    // The spend that locked the credit at order creation.
    await spend(customerId, order.id, amountMad);
    return order.id;
  }

  // ── 1. Two simultaneous checkouts spending the same balance ──────────────────
  test("two concurrent spends of the whole balance: exactly one fully applies, no overspend", async () => {
    const id = await seedWallet({ balanceMad: 60 });
    const [a, b] = await Promise.all([
      spend(id, `ord-${randomUUID()}`, 60),
      spend(id, `ord-${randomUUID()}`, 60),
    ]);
    const applied = [a, b].map((r) => r.appliedMad ?? 0).sort((x, y) => y - x);
    // One spend takes the full 60; the other is capped to the (now 0) balance.
    assert.deepEqual(applied, [60, 0]);
    assert.equal(await cached(id), 0);
    await assertReconciled(id);
  });

  // ── 2. Duplicate order creation must not double-debit ────────────────────────
  test("duplicate order spend (same idempotency key) debits once", async () => {
    const id = await seedWallet({ balanceMad: 100 });
    const orderId = `ord-${randomUUID()}`;
    await Promise.all([spend(id, orderId, 40), spend(id, orderId, 40)]);
    assert.equal(await cached(id), 60);
    assert.equal(await countLedger(id, { reason: "order_spend", orderId }), 1);
    await assertReconciled(id);
  });

  // ── 3. Duplicate PayPal webhook must not double-credit ───────────────────────
  test("duplicate webhook credit (same idempotency key) credits once", async () => {
    const id = await seedWallet({ balanceMad: 0 });
    const key = `promo-credit:${randomUUID()}:paypal`;
    const grant = () =>
      db.$transaction((tx) =>
        ghostCredit.grantCreditTx(tx, {
          customerId: id,
          amountMad: 50,
          reason: "promo_reward",
          idempotencyKey: key,
          resetsExpiration: true,
        }),
      );
    await Promise.all([grant(), grant()]);
    assert.equal(await cached(id), 50);
    assert.equal(await countLedger(id, { idempotencyKey: key }), 1);
    await assertReconciled(id);
  });

  // ── 4. Repeated manual confirmation must not double-reward ───────────────────
  test("repeated manual grant (same request id) rewards once", async () => {
    const id = await seedWallet({ balanceMad: 0 });
    const key = `manual-credit:${randomUUID()}`;
    const grant = () =>
      db.$transaction((tx) =>
        ghostCredit.grantCreditTx(tx, {
          customerId: id,
          amountMad: 30,
          reason: "admin_grant",
          idempotencyKey: key,
          resetsExpiration: false,
        }),
      );
    await Promise.all([grant(), grant(), grant()]);
    assert.equal(await cached(id), 30);
    assert.equal(await countLedger(id, { idempotencyKey: key }), 1);
    await assertReconciled(id);
  });

  // ── 5. Expiry job running twice concurrently: restore once, expire once ──────
  test("abandoned-order expiry run twice concurrently restores once (and expires once if lapsed)", async () => {
    const id = await seedWallet({ balanceMad: 20 });
    const orderId = await makeAbandonedOrder(id, 20, 48); // 48h old, past 24h window
    assert.equal(await cached(id), 0); // credit locked by the spend

    const now = new Date();
    await Promise.all([orderExpiry.expireAbandonedOrders(now), orderExpiry.expireAbandonedOrders(now)]);

    assert.equal(await countLedger(id, { reason: "order_refund_restore", orderId }), 1);
    // Restored exactly once → balance back to 20 (wallet had not lapsed).
    assert.equal(await cached(id), 20);
    const order = await db.order.findUnique({ where: { id: orderId }, select: { status: true } });
    assert.equal(order?.status, "expired");
    await assertReconciled(id);
  });

  // ── 5b. Anti-avoidance: credit restored into an already-lapsed wallet ────────
  test("credit restored after the wallet already expired is immediately re-expired (not spendable)", async () => {
    const id = await seedWallet({ balanceMad: 15 });
    const orderId = await makeAbandonedOrder(id, 15, 48);
    // Simulate the wallet's inactivity deadline lapsing while the credit was
    // locked: an EXPIRATION entry dated after the spend.
    await db.ghostCreditTransaction.create({
      data: {
        customerId: id,
        amountMad: 0,
        direction: "debit",
        reason: "expiration",
        status: "expired",
        idempotencyKey: `wallet-expire:${id}:itest`,
        source: "test",
      },
    });

    await orderExpiry.expireAbandonedOrders(new Date());

    assert.equal(await countLedger(id, { reason: "order_refund_restore", orderId }), 1);
    assert.equal(await countLedger(id, { idempotencyKey: `order-expiry-credit-expired:${orderId}` }), 1);
    // Restored then immediately expired → not available again.
    assert.equal(await cached(id), 0);
    await assertReconciled(id);
  });

  // ── 6. Refund reversal racing a grant stays consistent ───────────────────────
  test("a concurrent credit and debit never lose an update; cache stays == ledger", async () => {
    const id = await seedWallet({ balanceMad: 50 });
    await Promise.all([
      db.$transaction((tx) =>
        ghostCredit.grantCreditTx(tx, {
          customerId: id,
          amountMad: 25,
          reason: "promo_reward",
          idempotencyKey: `promo-credit:${randomUUID()}:x`,
          resetsExpiration: true,
        }),
      ),
      db.$transaction((tx) =>
        ghostCredit.debitCreditTx(tx, {
          customerId: id,
          amountMad: 20,
          reason: "promo_reversal",
          idempotencyKey: `promo-reversal:${randomUUID()}:x:1`,
          allowNegative: false,
        }),
      ),
    ]);
    assert.equal(await cached(id), 55); // 50 + 25 - 20
    await assertReconciled(id);
  });

  // ── 7. Two orders crossing the same milestone: awarded once ──────────────────
  test("two orders crossing the same spending milestone award it exactly once", async () => {
    const id = await seedWallet({ balanceMad: 0 });
    const milestone = await db.spendingMilestone.create({
      data: {
        internalName: "ITest 100",
        publicTitle: "ITest 100",
        thresholdMad: 100,
        rewardMad: 10,
        active: true,
      },
      select: { id: true },
    });
    createdMilestoneIds.push(milestone.id);

    // Two revenue orders whose combined qualifying spend crosses 100 DH.
    const mkOrder = async (total: number) => {
      const o = await db.order.create({
        data: {
          customerId: id,
          customerName: "Wallet ITest",
          customerEmail: `wallet-itest+${randomUUID()}@example.test`,
          paymentMethod: "bank",
          status: "payment_confirmed",
          totalMad: total,
          ghostCreditAppliedMad: 0,
        },
        select: { id: true },
      });
      createdOrderIds.push(o.id);
      return o.id;
    };
    const [o1, o2] = await Promise.all([mkOrder(60), mkOrder(60)]);

    await Promise.all([
      milestones.grantMilestonesForCompletedOrder(o1),
      milestones.grantMilestonesForCompletedOrder(o2),
    ]);

    const grants = await db.spendingMilestoneGrant.count({
      where: { customerId: id, milestoneId: milestone.id },
    });
    assert.equal(grants, 1, "milestone granted exactly once across the two orders");
    assert.equal(
      await countLedger(id, { reason: "spending_milestone_reward", milestoneId: milestone.id }),
      1,
    );
    assert.equal(await cached(id), 10);
    await assertReconciled(id);
  });

  // ── 8. Admin adjustment racing a checkout spend: no overspend, no lost entry ──
  test("admin grant racing a checkout spend: balance consistent, never negative", async () => {
    const id = await seedWallet({ balanceMad: 40 });
    const [, spendRes] = await Promise.all([
      db.$transaction((tx) =>
        ghostCredit.grantCreditTx(tx, {
          customerId: id,
          amountMad: 100,
          reason: "admin_grant",
          idempotencyKey: `manual-credit:${randomUUID()}`,
          resetsExpiration: false,
        }),
      ),
      spend(id, `ord-${randomUUID()}`, 40),
    ]);
    // The spend of 40 is fully covered whether it ran before or after the grant.
    assert.equal(spendRes.appliedMad, 40);
    assert.equal(await cached(id), 100); // 40 + 100 - 40
    await assertReconciled(id);
  });
}
