// AI Operations — provider hardening (spec §6): status classification, retry
// eligibility, Retry-After parsing, backoff, and the Discord error replies.
// Pure, no network. Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  mapOpenRouterStatus,
  isRetryableStatus,
  parseRetryAfterMs,
  backoffDelayMs,
} from "../../src/lib/ai-ops/providers/openrouterCore";
import { assistantErrorReply } from "../../src/lib/ai-ops/discord/replyMessages";

test("status → normalized error code (incl. insufficient credit)", () => {
  assert.equal(mapOpenRouterStatus(401), "not_configured");
  assert.equal(mapOpenRouterStatus(403), "not_configured");
  assert.equal(mapOpenRouterStatus(402), "insufficient_credit");
  assert.equal(mapOpenRouterStatus(400), "invalid_response");
  assert.equal(mapOpenRouterStatus(422), "invalid_response");
  assert.equal(mapOpenRouterStatus(408), "timeout");
  assert.equal(mapOpenRouterStatus(504), "timeout");
  assert.equal(mapOpenRouterStatus(429), "rate_limited");
  assert.equal(mapOpenRouterStatus(500), "unknown");
});

test("only 429 and 5xx (bar 501) are retryable — never auth/invalid/credit", () => {
  assert.equal(isRetryableStatus(429), true);
  assert.equal(isRetryableStatus(500), true);
  assert.equal(isRetryableStatus(503), true);
  assert.equal(isRetryableStatus(501), false);
  assert.equal(isRetryableStatus(402), false); // insufficient credit
  assert.equal(isRetryableStatus(401), false); // auth
  assert.equal(isRetryableStatus(400), false); // invalid request
});

test("Retry-After parses delta-seconds and HTTP dates; null otherwise", () => {
  assert.equal(parseRetryAfterMs("5"), 5000);
  assert.equal(parseRetryAfterMs("0"), 0);
  assert.equal(parseRetryAfterMs(null), null);
  assert.equal(parseRetryAfterMs("soon"), null);
  const now = Date.UTC(2026, 6, 21, 12, 0, 0);
  const inTen = new Date(now + 10_000).toUTCString();
  assert.equal(parseRetryAfterMs(inTen, now), 10_000);
  // A past date clamps to 0, never negative.
  assert.equal(parseRetryAfterMs(new Date(now - 5000).toUTCString(), now), 0);
});

test("backoff is exponential and capped", () => {
  assert.equal(backoffDelayMs(0, 500), 500);
  assert.equal(backoffDelayMs(1, 500), 1000);
  assert.equal(backoffDelayMs(2, 500), 2000);
  assert.equal(backoffDelayMs(10, 500, 8000), 8000); // capped
});

test("error replies are specific and never leak internals", () => {
  assert.match(assistantErrorReply("provider_insufficient_credit"), /credit/i);
  assert.match(assistantErrorReply("provider_rate_limited"), /rate-limited|try again/i);
  assert.match(assistantErrorReply("provider_timeout"), /too long|retry/i);
  assert.match(assistantErrorReply("provider_not_configured"), /model/i);
  assert.match(assistantErrorReply("global_disabled"), /turned off/i);
  assert.match(assistantErrorReply("module_daily_executions"), /limit/i);
  // Unknown reason → safe generic, and no reply ever contains a key/token word.
  const generic = assistantErrorReply("something_odd");
  assert.match(generic, /something went wrong/i);
  for (const r of [
    "provider_insufficient_credit",
    "provider_rate_limited",
    "provider_not_configured",
    undefined,
  ]) {
    assert.doesNotMatch(assistantErrorReply(r), /api[_ ]?key|token|sk-/i);
  }
});
