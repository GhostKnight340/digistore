import assert from "node:assert/strict";
import test from "node:test";

import {
  computeCandidates,
  materialFactsHash,
  pickTopCandidate,
  sortCandidates,
} from "../../../src/lib/ops/ceoBriefing/candidates";
import { fallbackBriefingFromCandidates, briefingFromSnapshot } from "../../../src/lib/ops/ceoBriefing/fallback";
import { validateAiDecision, assembleFromDecision, extractJsonObject } from "../../../src/lib/ops/ceoBriefing/ai";
import { resolveActions } from "../../../src/lib/ops/ceoBriefing/actions";
import { buildAiPayload } from "../../../src/lib/ops/ceoBriefing/snapshot";
import type { CandidateIssue } from "../../../src/lib/ops/ceoBriefing/types";
import type { OperationsSnapshotDTO } from "../../../src/lib/dto";

// ── Minimal snapshot factory (only the fields the pipeline reads) ─────────────

interface SnapOverrides {
  ordersEnabled?: boolean;
  readyForFulfillment?: number;
  recentFailedPurchases?: number;
  paymentIssue?: number;
  waitingTooLong?: number;
  awaitingReview?: number;
  misconfigured?: number;
  emailFailures?: number;
  missingSupplyRoute?: number;
  reloadlyBalance?: number | null;
  reloadlyHealth?: string;
  paymentsHealth?: string;
  revenueTone?: string;
}

function makeSnapshot(o: SnapOverrides = {}): OperationsSnapshotDTO {
  const snap = {
    generatedAt: "2026-07-22T17:00:00.000Z",
    greetingName: "Zakariya",
    environmentLabel: "staging",
    version: "test",
    maintenanceEnabled: false,
    ordersEnabled: o.ordersEnabled ?? true,
    overallStatus: "healthy",
    announcement: null,
    systemStatus: { headline: "", overall: "healthy", chips: [] },
    kpi: {
      range: "7d",
      tiles: [{ label: "Revenu · 7 j", value: "120", unit: "MAD", trendLabel: "+10% vs 7 j précédents", tone: o.revenueTone ?? "neutral" }],
    },
    pipeline: [],
    recentOrders: [],
    wallets: [],
    jobs: [],
    health: [
      { key: "database", label: "Base de données", status: "healthy", message: "", checkedAt: "", responseTimeMs: 1 },
      { key: "payments", label: "Paiements", status: o.paymentsHealth ?? "healthy", message: o.paymentsHealth === "warning" ? "PAYPAL_ENV=live hors production" : "", checkedAt: "", responseTimeMs: 1 },
      { key: "email", label: "E-mail", status: "healthy", message: "", checkedAt: "", responseTimeMs: 1 },
    ],
    suppliers: [
      {
        slug: "reloadly",
        name: "Reloadly",
        description: "",
        accentColor: "#000",
        initials: "RL",
        enabled: true,
        configured: true,
        environment: "live",
        supportsBalance: true,
        health: o.reloadlyHealth ?? "healthy",
        balance: o.reloadlyBalance === null ? null : { amount: String(o.reloadlyBalance ?? 500), currency: "EUR", updatedAt: "" },
        lastSuccessAt: null,
        lastFailureAt: null,
        lastFailureMessage: null,
        lastCheckedAt: null,
        lastSyncAt: null,
        recentPurchases: { ok: 5, failed: 0 },
      },
    ],
    orders: {
      pendingPayment: 0,
      paymentSubmitted: 0,
      readyForFulfillment: o.readyForFulfillment ?? 0,
      paymentIssue: o.paymentIssue ?? 0,
      deliveredToday: 0,
      cancelledToday: 0,
      rejectedToday: 0,
      waitingTooLong: o.waitingTooLong ?? 0,
      recentFailedPurchases: o.recentFailedPurchases ?? 0,
      newest: [],
    },
    payments: {
      activeMethods: 2,
      disabledMethods: 0,
      awaitingReview: o.awaitingReview ?? 0,
      confirmedToday: 0,
      rejectedToday: 0,
      avgConfirmationMinutes: null,
      misconfiguredMethods: Array.from({ length: o.misconfigured ?? 0 }, (_, i) => ({ id: `m${i}`, name: `Méthode ${i}`, reason: "incomplète" })),
    },
    products: {
      totalParents: 10,
      hidden: 0,
      missingSupplyRoute: o.missingSupplyRoute ?? 0,
      incompleteMapping: 0,
      manualOnly: 0,
      missingImage: 0,
      missingPrice: 0,
      outOfStock: null,
    },
    notifications: {
      emailFailures24h: o.emailFailures ?? 0,
      discordFailures24h: 0,
      supplierFailures24h: 0,
      // Intentional sentinel PII — must NEVER reach the AI payload.
      recentEmailErrors: [{ id: "e1", recipient: "victim@example.com", message: "bounce", at: "" }],
    },
    warnings: [],
    activity: [],
  };
  return snap as unknown as OperationsSnapshotDTO;
}

const NO_EXTRAS = { supportOpen: 0 };

// ── Priority / severity ──────────────────────────────────────────────────────

test("critical supplier balance outranks a healthy/opportunity picture", () => {
  const snap = makeSnapshot({ reloadlyBalance: 0, readyForFulfillment: 1, revenueTone: "good" });
  const top = pickTopCandidate(computeCandidates(snap, NO_EXTRAS));
  assert.equal(top.type, "SUPPLIER_BALANCE_CRITICAL");
  assert.equal(top.severity, "critical");
});

test("blocked paid order (failed purchase) outranks a payment-config warning", () => {
  const snap = makeSnapshot({ recentFailedPurchases: 2, misconfigured: 1 });
  const sorted = sortCandidates(computeCandidates(snap, NO_EXTRAS));
  assert.equal(sorted[0].type, "FAILED_PURCHASES");
  assert.ok(sorted.some((c) => c.type === "PAYMENT_MISCONFIGURED"));
  assert.ok(
    sorted.findIndex((c) => c.type === "FAILED_PURCHASES") < sorted.findIndex((c) => c.type === "PAYMENT_MISCONFIGURED"),
  );
});

test("healthy when nothing is wrong", () => {
  const top = pickTopCandidate(computeCandidates(makeSnapshot(), NO_EXTRAS));
  assert.equal(top.type, "HEALTHY");
  assert.equal(top.severity, "healthy");
});

// ── Hashing / cache invalidation ─────────────────────────────────────────────

test("material hash is stable for the same snapshot and changes with a material fact", () => {
  const a = materialFactsHash(computeCandidates(makeSnapshot({ misconfigured: 1 }), NO_EXTRAS));
  const b = materialFactsHash(computeCandidates(makeSnapshot({ misconfigured: 1 }), NO_EXTRAS));
  const c = materialFactsHash(computeCandidates(makeSnapshot({ misconfigured: 2 }), NO_EXTRAS));
  assert.equal(a, b);
  assert.notEqual(a, c);
});

test("support-only change does not change the hash (client can't see it)", () => {
  const snap = makeSnapshot({ misconfigured: 1 });
  const a = materialFactsHash(computeCandidates(snap, { supportOpen: 0 }));
  const b = materialFactsHash(computeCandidates(snap, { supportOpen: 5 }));
  assert.equal(a, b);
});

// ── Deterministic fallback ───────────────────────────────────────────────────

test("fallback always yields a valid, non-empty briefing with a real CTA", () => {
  const b = briefingFromSnapshot(makeSnapshot({ reloadlyBalance: 0, readyForFulfillment: 3 }));
  assert.equal(b.source, "fallback");
  assert.equal(b.state, "critical");
  assert.ok(b.title.length > 0 && b.title.length <= 70);
  assert.ok(b.summary.length > 0 && b.summary.length <= 180);
  assert.ok(b.actions.length >= 1);
  for (const a of b.actions) assert.ok(a.href.startsWith("/admin"));
});

test("fallback combines related facts (mentions affected orders)", () => {
  const b = briefingFromSnapshot(makeSnapshot({ reloadlyBalance: 0, readyForFulfillment: 3 }));
  assert.match(b.context ?? "", /commande/i);
});

test("healthy snapshot renders a calm (non-critical) fallback", () => {
  const b = briefingFromSnapshot(makeSnapshot());
  assert.equal(b.state, "healthy");
});

// ── AI response validation ───────────────────────────────────────────────────

const criticalCandidate: CandidateIssue = {
  type: "SUPPLIER_BALANCE_CRITICAL",
  severity: "critical",
  title: "Solde Reloadly critique",
  description: "Solde 0 EUR sous le seuil.",
  count: 1,
  allowedActionIds: ["OPEN_SUPPLIER_DETAIL", "OPEN_ORDERS"],
  supplierSlug: "reloadly",
};
const healthyCandidate: CandidateIssue = {
  type: "HEALTHY",
  severity: "healthy",
  title: "Tout fonctionne",
  description: "RAS.",
  count: 0,
  allowedActionIds: ["OPEN_ACTIVITY"],
};

function validDecision(over: Record<string, unknown> = {}) {
  return {
    state: "critical",
    eyebrow: "Fournisseurs",
    title: "Rechargez Reloadly",
    summary: "Le solde est à 0 EUR et une commande attend une livraison.",
    context: null,
    primaryIssueType: "SUPPLIER_BALANCE_CRITICAL",
    primaryActionId: "OPEN_SUPPLIER_DETAIL",
    secondaryActionId: "OPEN_ORDERS",
    reasoningSummary: "Solde sous le seuil critique.",
    confidence: 0.9,
    ...over,
  };
}

test("valid AI decision passes validation", () => {
  const d = validateAiDecision(validDecision(), [criticalCandidate], ["OPEN_SUPPLIER_DETAIL", "OPEN_ORDERS"]);
  assert.equal(d.primaryActionId, "OPEN_SUPPLIER_DETAIL");
  assert.equal(d.confidence, 0.9);
});

test("unknown / invented action id is rejected", () => {
  assert.throws(
    () => validateAiDecision(validDecision({ primaryActionId: "DELETE_ALL_ORDERS" }), [criticalCandidate], ["OPEN_SUPPLIER_DETAIL", "OPEN_ORDERS"]),
    /primaryActionId/,
  );
});

test("action id outside the allowed set (even if a real registry id) is rejected", () => {
  assert.throws(
    () => validateAiDecision(validDecision({ primaryActionId: "OPEN_REFUNDS" }), [criticalCandidate], ["OPEN_SUPPLIER_DETAIL", "OPEN_ORDERS"]),
    /primaryActionId/,
  );
});

test("unknown issue type is rejected", () => {
  assert.throws(
    () => validateAiDecision(validDecision({ primaryIssueType: "MADE_UP" }), [criticalCandidate], ["OPEN_SUPPLIER_DETAIL", "OPEN_ORDERS"]),
    /primaryIssueType/,
  );
});

test("invalid state is rejected", () => {
  assert.throws(() => validateAiDecision(validDecision({ state: "on_fire" }), [criticalCandidate], ["OPEN_SUPPLIER_DETAIL"]), /state/);
});

test("grossly oversized text is rejected", () => {
  assert.throws(() => validateAiDecision(validDecision({ title: "x".repeat(200) }), [criticalCandidate], ["OPEN_SUPPLIER_DETAIL"]), /limits/);
});

test("malformed JSON string falls back (throws for the orchestrator to catch)", () => {
  assert.throws(() => validateAiDecision("not json at all", [criticalCandidate], ["OPEN_SUPPLIER_DETAIL"]));
});

test("AI cannot downgrade a genuine critical to attention", () => {
  assert.throws(
    () => validateAiDecision(validDecision({ state: "attention" }), [criticalCandidate], ["OPEN_SUPPLIER_DETAIL", "OPEN_ORDERS"]),
    /downgraded/,
  );
});

test("AI cannot point away from the critical issue", () => {
  const decision = validDecision({ primaryIssueType: "HEALTHY", primaryActionId: "OPEN_ACTIVITY" });
  assert.throws(
    () => validateAiDecision(decision, [criticalCandidate, healthyCandidate], ["OPEN_SUPPLIER_DETAIL", "OPEN_ORDERS", "OPEN_ACTIVITY"]),
    /ignored the critical/,
  );
});

// ── Action resolution (registry-only, entity hrefs) ──────────────────────────

test("resolveActions ignores unknown ids and resolves only registry hrefs", () => {
  const actions = resolveActions(["OPEN_SUPPLIER_DETAIL", "NONSENSE" as never], criticalCandidate);
  assert.equal(actions.length, 1);
  assert.equal(actions[0].href, "/admin/suppliers/reloadly"); // slug filled deterministically
  assert.equal(actions[0].primary, true);
});

test("assembled AI briefing resolves every CTA through the registry", () => {
  const d = validateAiDecision(validDecision(), [criticalCandidate], ["OPEN_SUPPLIER_DETAIL", "OPEN_ORDERS"]);
  const briefing = assembleFromDecision(d, [criticalCandidate], "2026-07-22T17:00:00.000Z", "hash1");
  assert.equal(briefing.source, "ai");
  assert.ok(briefing.actions.length >= 1 && briefing.actions.length <= 2);
  for (const a of briefing.actions) assert.ok(a.href.startsWith("/admin"));
});

test("extractJsonObject tolerates surrounding prose / code fences", () => {
  const obj = extractJsonObject('```json\n{"state":"healthy","title":"ok"}\n``` trailing text');
  assert.equal(obj?.state, "healthy");
});

// ── PII exclusion from the AI payload ────────────────────────────────────────

test("the AI payload excludes customer PII (emails, order rows, activity)", () => {
  const snap = makeSnapshot({ emailFailures: 5 });
  const candidates = computeCandidates(snap, { supportOpen: 2 });
  const payload = buildAiPayload(snap, { supportOpen: 2 }, candidates, "2026-07-22T17:00:00.000Z");
  const serialized = JSON.stringify(payload);
  assert.ok(!serialized.includes("victim@example.com"), "recipient email leaked into AI payload");
  assert.ok(!serialized.includes("recentEmailErrors"));
  assert.ok(!("recentOrders" in (payload as unknown as Record<string, unknown>)));
  assert.ok(!("activity" in (payload as unknown as Record<string, unknown>)));
  // But it DOES carry the safe aggregates it needs.
  assert.equal(payload.support.open, 2);
  assert.equal(payload.email.recentFailures, 5);
});
