// Operations dashboard pure logic — health roll-up + warning engine. Run: npm test
//
// These cover the decision layer behind the Operations control center without
// any DB/Next: the overall-status aggregation and the deterministic warning
// generation (which is what makes warnings auto-resolve — same inputs, same
// output, so a cleared condition simply stops producing its warning).
import { test } from "node:test";
import assert from "node:assert/strict";

import { rollUpHealth, sortWarnings, type HealthResult } from "../../src/lib/ops/types";
import {
  computeWarnings,
  DEFAULT_BALANCE_THRESHOLDS,
  type WarningInputs,
} from "../../src/lib/ops/warnings";

function health(status: HealthResult["status"]): { status: HealthResult["status"] } {
  return { status };
}

test("rollUpHealth picks the worst status present", () => {
  assert.equal(rollUpHealth([health("healthy"), health("healthy")]), "healthy");
  assert.equal(rollUpHealth([health("healthy"), health("warning")]), "warning");
  assert.equal(rollUpHealth([health("warning"), health("offline")]), "offline");
  assert.equal(rollUpHealth([health("healthy"), health("unknown")]), "unknown");
  assert.equal(rollUpHealth([]), "unknown");
});

function baseInputs(overrides: Partial<WarningInputs> = {}): WarningInputs {
  return {
    detectedAt: "2026-07-17T10:00:00.000Z",
    health: [],
    suppliers: [],
    orders: { waitingTooLong: 0, paymentIssue: 0, recentFailedPurchases: 0 },
    payments: { rejectedToday: 0, confirmedToday: 0, misconfiguredCount: 0 },
    products: { missingSupplyRoute: 0, incompleteMapping: 0 },
    notifications: { emailFailures24h: 0, discordFailures24h: 0 },
    ...overrides,
  };
}

test("a healthy system produces zero warnings", () => {
  assert.deepEqual(computeWarnings(baseInputs()), []);
});

test("an offline database yields a critical warning", () => {
  const warnings = computeWarnings(
    baseInputs({
      health: [
        {
          key: "database",
          label: "Base de données",
          status: "offline",
          message: "Injoignable.",
          checkedAt: "x",
          responseTimeMs: null,
        },
      ],
    }),
  );
  assert.equal(warnings.length, 1);
  assert.equal(warnings[0].severity, "critical");
  assert.match(warnings[0].title, /Base de données/);
});

test("supplier offline + low balance escalate correctly", () => {
  const supplier = {
    slug: "reloadly",
    name: "Reloadly",
    enabled: true,
    configured: true,
    health: "offline" as const,
    balanceAmount: "15",
    balanceCurrency: "USD",
    lastFailureMessage: "Auth échouée.",
  };
  const warnings = computeWarnings(baseInputs({ suppliers: [supplier] }));
  const offline = warnings.find((w) => w.id === "supplier-offline:reloadly");
  const balance = warnings.find((w) => w.id === "supplier-balance:reloadly");
  assert.equal(offline?.severity, "critical");
  // 15 <= critical(20) → critical balance warning
  assert.equal(balance?.severity, "critical");
});

test("balance thresholds map amount → severity", () => {
  const make = (amount: string) =>
    computeWarnings(
      baseInputs({
        suppliers: [
          {
            slug: "fazercards",
            name: "FazerCards",
            enabled: true,
            configured: true,
            health: "healthy",
            balanceAmount: amount,
            balanceCurrency: "USD",
            lastFailureMessage: null,
          },
        ],
      }),
    ).find((w) => w.id === "supplier-balance:fazercards");

  assert.equal(make("10")?.severity, "critical"); // <= 20
  assert.equal(make("40")?.severity, "warning"); // <= 50
  assert.equal(make("80")?.severity, "info"); // <= 100
  assert.equal(make("500"), undefined); // above info threshold → no warning
  assert.equal(DEFAULT_BALANCE_THRESHOLDS.critical, 20);
});

test("a disabled or unconfigured supplier does not raise offline/balance warnings", () => {
  const warnings = computeWarnings(
    baseInputs({
      suppliers: [
        {
          slug: "reloadly",
          name: "Reloadly",
          enabled: false,
          configured: true,
          health: "warning",
          balanceAmount: "5",
          balanceCurrency: "USD",
          lastFailureMessage: null,
        },
      ],
    }),
  );
  // enabled=false → balance warning suppressed; health!=offline → no offline warning
  assert.equal(warnings.length, 0);
});

test("orders stuck, high rejection, and missing supply routes each warn", () => {
  const warnings = computeWarnings(
    baseInputs({
      orders: { waitingTooLong: 3, paymentIssue: 0, recentFailedPurchases: 0 },
      payments: { rejectedToday: 4, confirmedToday: 4, misconfiguredCount: 0 },
      products: { missingSupplyRoute: 2, incompleteMapping: 0 },
    }),
  );
  const ids = warnings.map((w) => w.id);
  assert.ok(ids.includes("orders-stuck"));
  assert.ok(ids.includes("payments-high-rejection")); // 4/8 = 50% >= 40%
  assert.ok(ids.includes("products-no-route"));
});

test("rejection ratio below the sample floor does not warn", () => {
  const warnings = computeWarnings(
    baseInputs({ payments: { rejectedToday: 2, confirmedToday: 1, misconfiguredCount: 0 } }),
  );
  assert.equal(
    warnings.find((w) => w.id === "payments-high-rejection"),
    undefined,
  );
});

test("warnings are sorted critical → warning → info", () => {
  const sorted = sortWarnings([
    { id: "a", severity: "info", title: "", description: "", detectedAt: "2026-01-01T00:00:00Z" },
    { id: "b", severity: "critical", title: "", description: "", detectedAt: "2026-01-01T00:00:00Z" },
    { id: "c", severity: "warning", title: "", description: "", detectedAt: "2026-01-01T00:00:00Z" },
  ]);
  assert.deepEqual(sorted.map((w) => w.severity), ["critical", "warning", "info"]);
});
