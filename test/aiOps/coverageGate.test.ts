// AI Support Coverage — auth gate + config. Pure, security-critical. Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  canAutoSend,
  effectiveState,
  confidenceMeets,
  isSensitiveIssue,
  coverageCoversTicket,
  type CoverageSessionCore,
} from "../../src/lib/ai-ops/support/coverageState";
import { validateCoverageConfig, resolveSchedule } from "../../src/lib/ai-ops/support/coverageConfig";

function core(over: Partial<CoverageSessionCore> = {}): CoverageSessionCore {
  return {
    state: "ACTIVE_AUTO_REPLY",
    automationMode: "auto_reply",
    draftOnly: false,
    allowAutoReply: true,
    confidenceThreshold: "high",
    channels: ["support_tickets"],
    categories: [],
    scheduledStartAt: null,
    scheduledEndAt: null,
    ...over,
  };
}

const ctx = { channel: "support_tickets", category: "commande", confidence: "high", sensitive: false };

test("gate: fully authorized auto-send passes", () => {
  const s = core();
  assert.equal(canAutoSend(s, "ACTIVE_AUTO_REPLY", ctx).allowed, true);
});

test("gate: draft-only state never sends", () => {
  const r = canAutoSend(core(), "ACTIVE_DRAFT_ONLY", ctx);
  assert.equal(r.allowed, false);
  assert.match(r.reason, /state_ACTIVE_DRAFT_ONLY/);
});

test("gate: sensitive case blocked even at high confidence", () => {
  const r = canAutoSend(core(), "ACTIVE_AUTO_REPLY", { ...ctx, sensitive: true });
  assert.equal(r.allowed, false);
  assert.equal(r.reason, "sensitive_case");
});

test("gate: confidence below threshold blocked", () => {
  const r = canAutoSend(core({ confidenceThreshold: "high" }), "ACTIVE_AUTO_REPLY", { ...ctx, confidence: "medium" });
  assert.equal(r.allowed, false);
  assert.equal(r.reason, "below_confidence_threshold");
});

test("gate: uncovered channel/category blocked", () => {
  assert.equal(canAutoSend(core({ channels: ["other"] }), "ACTIVE_AUTO_REPLY", ctx).reason, "channel_not_covered");
  assert.equal(
    canAutoSend(core({ categories: ["paiement"] }), "ACTIVE_AUTO_REPLY", ctx).reason,
    "category_not_covered",
  );
});

test("gate: allowAutoReply=false forces draft (never sends)", () => {
  const r = canAutoSend(core({ allowAutoReply: false, draftOnly: true, automationMode: "draft_only" }), "ACTIVE_AUTO_REPLY", ctx);
  assert.equal(r.allowed, false);
  assert.equal(r.reason, "automation_draft_only");
});

test("effectiveState: lazy expiry when past scheduled end", () => {
  const now = new Date("2026-07-22T20:00:00Z");
  const s = core({ scheduledEndAt: new Date("2026-07-22T19:00:00Z") });
  assert.equal(effectiveState(s, now), "EXPIRED");
});

test("effectiveState: scheduled in the future", () => {
  const now = new Date("2026-07-22T20:00:00Z");
  const s = core({ scheduledStartAt: new Date("2026-07-22T21:00:00Z") });
  assert.equal(effectiveState(s, now), "SCHEDULED");
});

test("effectiveState: terminal + paused respected", () => {
  const now = new Date("2026-07-22T20:00:00Z");
  assert.equal(effectiveState(core({ state: "DEACTIVATED" }), now), "DEACTIVATED");
  assert.equal(effectiveState(core({ state: "PAUSED" }), now), "PAUSED");
});

test("confidenceMeets ordering", () => {
  assert.equal(confidenceMeets("high", "high"), true);
  assert.equal(confidenceMeets("high", "medium"), false);
  assert.equal(confidenceMeets("medium", "high"), true);
  assert.equal(confidenceMeets("low", "low"), true);
});

test("isSensitiveIssue covers refunds/payment/codes/account", () => {
  assert.equal(isSensitiveIssue("refund_request", "commande"), true);
  assert.equal(isSensitiveIssue("payment_proof", "commande"), true);
  assert.equal(isSensitiveIssue("order_status", "commande"), false);
  assert.equal(isSensitiveIssue("anything", "compte"), true);
});

test("coverageCoversTicket only drafts in live active states", () => {
  const s = core({ categories: ["commande"] });
  assert.equal(coverageCoversTicket(s, "ACTIVE_DRAFT_ONLY", "support_tickets", "commande"), true);
  assert.equal(coverageCoversTicket(s, "SCHEDULED", "support_tickets", "commande"), false);
  assert.equal(coverageCoversTicket(s, "ACTIVE_AUTO_REPLY", "support_tickets", "paiement"), false);
});

test("config: 1h duration resolves a one-hour window", () => {
  const now = new Date("2026-07-22T20:00:00Z");
  const r = resolveSchedule({ duration: "1h" }, now);
  assert.ok(!("error" in r));
  if (!("error" in r)) assert.equal(r.end!.getTime() - r.start.getTime(), 3_600_000);
});

test("config: until_time requires a future end", () => {
  const now = new Date("2026-07-22T20:00:00Z");
  assert.ok("error" in resolveSchedule({ duration: "until_time" }, now));
  assert.ok("error" in resolveSchedule({ duration: "until_time", endAt: "2026-07-22T19:00:00Z" }, now));
});

test("config: auto_reply without explicit allow is forced to draft_only", () => {
  const now = new Date("2026-07-22T20:00:00Z");
  const r = validateCoverageConfig({ duration: "1h", channels: ["support_tickets"], automationMode: "auto_reply", allowAutoReply: false }, now);
  assert.ok(r.ok);
  if (r.ok) {
    assert.equal(r.value.automationMode, "draft_only");
    assert.equal(r.value.allowAutoReply, false);
  }
});

test("config: auto_reply WITH explicit allow stays auto_reply", () => {
  const now = new Date("2026-07-22T20:00:00Z");
  const r = validateCoverageConfig({ duration: "1h", channels: ["support_tickets"], automationMode: "auto_reply", allowAutoReply: true }, now);
  assert.ok(r.ok);
  if (r.ok) assert.equal(r.value.automationMode, "auto_reply");
});

test("config: at least one channel required", () => {
  const now = new Date("2026-07-22T20:00:00Z");
  const r = validateCoverageConfig({ duration: "1h", channels: [] }, now);
  assert.equal(r.ok, false);
});
