// Feedback shared logic: validation, reference, support-heuristic, safe context.
// Pure — no DB. Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  validateFeedback,
  deriveFeedbackTitle,
  formatFeedbackReference,
  parseFeedbackReference,
  looksLikeSupportIssue,
  isFeedbackType,
  isFeedbackStatus,
  isFeedbackPriority,
  summarizeUserAgent,
  capturePageContext,
  FEEDBACK_LIMITS,
} from "../../src/lib/feedback";

test("single-field feedback: required, no minimum length (test 4)", () => {
  // Valid.
  assert.equal(
    validateFeedback({
      type: "suggestion",
      message: "Ajoutez plus de moyens de paiement svp.",
      contactAllowed: false,
      effectiveEmail: "",
    }),
    null,
  );
  // Empty feedback fails.
  assert.ok(validateFeedback({ type: "suggestion", message: "   ", contactAllowed: false, effectiveEmail: "" }));
  // No minimum length — a very short message is accepted.
  assert.equal(validateFeedback({ type: "suggestion", message: "ok", contactAllowed: false, effectiveEmail: "" }), null);
  // Invalid type (bug is no longer a valid feedback type).
  assert.ok(validateFeedback({ type: "bug", message: "un message", contactAllowed: false, effectiveEmail: "" }));
});

test("contact permission requires a valid email (test 3)", () => {
  assert.ok(
    validateFeedback({ type: "suggestion", message: "une idée", contactAllowed: true, effectiveEmail: "" }),
    "empty email + contact permission must fail",
  );
  assert.equal(
    validateFeedback({ type: "suggestion", message: "une idée", contactAllowed: true, effectiveEmail: "a@b.co" }),
    null,
  );
});

test("message maximum is enforced", () => {
  const long = "x".repeat(FEEDBACK_LIMITS.messageMax + 1);
  assert.ok(validateFeedback({ type: "other", message: long, contactAllowed: false, effectiveEmail: "" }));
});

test("derived title is the first line, capped", () => {
  assert.equal(deriveFeedbackTitle("Mode sombre\nplus de détails ici"), "Mode sombre");
  assert.equal(deriveFeedbackTitle("  une seule ligne  "), "une seule ligne");
  assert.equal(deriveFeedbackTitle("x".repeat(200)).length, FEEDBACK_LIMITS.subjectMax);
});

test("reference formats and parses round-trip", () => {
  assert.equal(formatFeedbackReference(123), "FB-000123");
  assert.equal(parseFeedbackReference("FB-000123"), 123);
  assert.equal(parseFeedbackReference("123"), 123);
  assert.equal(parseFeedbackReference("fb-42"), 42);
  assert.equal(parseFeedbackReference("nope"), null);
});

test("support-issue heuristic flags order/payment content only", () => {
  assert.ok(looksLikeSupportIssue("Problème", "Je n'ai pas reçu ma commande payée"));
  assert.ok(looksLikeSupportIssue("Remboursement", "je veux un refund"));
  assert.ok(!looksLikeSupportIssue("Suggestion", "Ajoutez un mode sombre au catalogue"));
});

test("type/status/priority guards reject unknown values", () => {
  assert.ok(isFeedbackType("suggestion") && !isFeedbackType("bug"));
  assert.ok(isFeedbackStatus("planned") && !isFeedbackStatus("open"));
  assert.ok(isFeedbackPriority("critical") && !isFeedbackPriority("urgent"));
});

test("user-agent summary is compact and non-empty", () => {
  const s = summarizeUserAgent(
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605 Version/17.0 Mobile Safari/604",
  );
  assert.match(s, /Safari/);
  assert.match(s, /iOS/);
});

test("captured page context strips the query string (test 5)", () => {
  (globalThis as unknown as { window: unknown; document: unknown }).window = {
    location: { origin: "https://ghost.ma", pathname: "/products/steam-100" },
    innerWidth: 390,
    innerHeight: 800,
    // capturePageContext reads document.title / navigator.userAgent off window
    // via the globals below.
  };
  (globalThis as unknown as { document: unknown }).document = { title: "Steam 100" };
  // navigator is a read-only global in Node — override via defineProperty.
  Object.defineProperty(globalThis, "navigator", {
    value: { userAgent: "Chrome/120 Windows" },
    configurable: true,
  });

  const ctx = capturePageContext();
  // No query string, no sensitive params.
  assert.equal(ctx.relatedUrl, "https://ghost.ma/products/steam-100");
  assert.ok(!ctx.relatedUrl.includes("?"));
  assert.equal(ctx.relatedRoute, "/products/steam-100");
  assert.equal(ctx.deviceType, "mobile");
  assert.equal(ctx.viewport, "390×800");
});
