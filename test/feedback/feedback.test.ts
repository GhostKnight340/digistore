// Feedback shared logic: validation, reference, support-heuristic, safe context.
// Pure — no DB. Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  validateFeedback,
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

test("valid feedback passes; required fields fail safely (test 4)", () => {
  assert.equal(
    validateFeedback({
      type: "suggestion",
      subject: "Idée",
      message: "Ajoutez plus de moyens de paiement svp.",
      contactAllowed: false,
      effectiveEmail: "",
    }),
    null,
  );
  // Missing subject.
  assert.ok(validateFeedback({ type: "suggestion", subject: "  ", message: "message assez long", contactAllowed: false, effectiveEmail: "" }));
  // Too-short message.
  assert.ok(validateFeedback({ type: "suggestion", subject: "S", message: "court", contactAllowed: false, effectiveEmail: "" }));
  // Invalid type.
  assert.ok(validateFeedback({ type: "payment_problem", subject: "S", message: "message assez long", contactAllowed: false, effectiveEmail: "" }));
});

test("contact permission requires a valid email (test 3)", () => {
  const err = validateFeedback({
    type: "suggestion",
    subject: "Sujet",
    message: "un message suffisamment long",
    contactAllowed: true,
    effectiveEmail: "",
  });
  assert.ok(err, "empty email + contact permission must fail");
  assert.equal(
    validateFeedback({
      type: "suggestion",
      subject: "Sujet",
      message: "un message suffisamment long",
      contactAllowed: true,
      effectiveEmail: "a@b.co",
    }),
    null,
  );
});

test("message length bounds are enforced", () => {
  const long = "x".repeat(FEEDBACK_LIMITS.messageMax + 1);
  assert.ok(validateFeedback({ type: "other", subject: "S", message: long, contactAllowed: false, effectiveEmail: "" }));
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
  assert.ok(isFeedbackType("bug") && !isFeedbackType("refund"));
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
