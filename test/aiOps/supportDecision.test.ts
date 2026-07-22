// AI Operations — support assistant decision parser. Pure, fail-safe. Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";

import { parseSupportDecision } from "../../src/lib/ai-ops/support/decision";

test("parses a clean draft_reply", () => {
  const d = parseSupportDecision(
    JSON.stringify({
      outcome: "draft_reply",
      issueType: "order_status",
      confidence: "high",
      reply: "Bonjour, votre commande est en cours de livraison.",
      internalNote: "Verified delivered status in order context.",
    }),
  );
  assert.equal(d.outcome, "draft_reply");
  assert.equal(d.issueType, "order_status");
  assert.equal(d.confidence, "high");
  assert.match(d.reply, /votre commande/);
});

test("extracts JSON even when wrapped in prose / code fences", () => {
  const raw = 'Here is my decision:\n```json\n{"outcome":"draft_reply","issueType":"faq","confidence":"medium","reply":"Voici la réponse.","internalNote":"n"}\n```\nThanks!';
  const d = parseSupportDecision(raw);
  assert.equal(d.outcome, "draft_reply");
  assert.equal(d.reply, "Voici la réponse.");
});

test("escalate outcome never carries a customer reply", () => {
  const d = parseSupportDecision(
    JSON.stringify({ outcome: "escalate", issueType: "refund_request", confidence: "low", reply: "ignored", internalNote: "Refund needs a human." }),
  );
  assert.equal(d.outcome, "escalate");
  assert.equal(d.reply, "");
  assert.match(d.internalNote, /human/);
});

test("FAIL SAFE: non-JSON output becomes an escalation, not a reply", () => {
  const d = parseSupportDecision("Sure! Your order shipped yesterday, no worries.");
  assert.equal(d.outcome, "escalate");
  assert.equal(d.reply, "");
  assert.equal(d.confidence, "low");
});

test("FAIL SAFE: draft_reply with an empty reply becomes an escalation", () => {
  const d = parseSupportDecision(
    JSON.stringify({ outcome: "draft_reply", issueType: "x", confidence: "high", reply: "   ", internalNote: "" }),
  );
  assert.equal(d.outcome, "escalate");
  assert.equal(d.reply, "");
});

test("FAIL SAFE: unknown outcome / bad confidence are coerced safely", () => {
  const d = parseSupportDecision(
    JSON.stringify({ outcome: "auto_send", issueType: "y", confidence: "certain", reply: "hi", internalNote: "n" }),
  );
  assert.equal(d.outcome, "escalate");
  assert.equal(d.confidence, "low");
});
