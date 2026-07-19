// Sentry `beforeSend` redaction. Run: npm test
//
// Ghost.ma handles gift-card codes, payment proofs and supplier credentials.
// If any of those reach a third-party error tracker, the breach is the
// monitoring itself — so the scrubber is tested like a security control.
import { test } from "node:test";
import assert from "node:assert/strict";

import { REDACTED, scrubEvent, sentryDsn } from "../../src/lib/monitoring/sentry";

test("redacts credentials, codes and payment proofs anywhere in the tree", () => {
  const event = scrubEvent({
    extra: {
      password: "hunter2",
      accessToken: "tok_live_abc",
      giftCode: "AAAA-BBBB-CCCC",
      activation_code: "1234",
      codes: ["one", "two"],
      clientSecret: "supplier-secret",
      apiKey: "sk_live_x",
      paymentProof: "data:image/png;base64,iVBORw0KGgo=",
      customerEmail: "someone@example.com",
      sessionId: "sess_1",
    },
  } as Record<string, unknown>);

  const extra = event.extra as Record<string, unknown>;
  for (const key of Object.keys(extra)) {
    assert.equal(extra[key], REDACTED, `${key} must be redacted`);
  }
  assert.ok(!JSON.stringify(event).includes("hunter2"));
  assert.ok(!JSON.stringify(event).includes("AAAA-BBBB-CCCC"));
});

test("strips cookies and the Authorization header from the request", () => {
  const event = scrubEvent({
    request: {
      url: "https://ghost.ma/checkout",
      cookies: { ghost_session: "abc" },
      headers: {
        Authorization: "Bearer secret",
        Cookie: "ghost_session=abc",
        "user-agent": "Mozilla/5.0",
      },
    },
  } as Record<string, unknown>);

  const request = event.request as Record<string, unknown>;
  assert.equal(request.cookies, undefined);
  const headers = request.headers as Record<string, unknown>;
  assert.equal(headers.Authorization, REDACTED);
  assert.equal(headers.Cookie, REDACTED);
  // Non-sensitive context survives, or the tracker is useless.
  assert.equal(headers["user-agent"], "Mozilla/5.0");
  assert.equal(request.url, "https://ghost.ma/checkout");
});

test("redacts inline base64 blobs even under an innocuous key", () => {
  const event = scrubEvent({
    extra: { upload: "data:image/jpeg;base64,/9j/4AAQSkZJRg==" },
  } as Record<string, unknown>);
  assert.equal((event.extra as Record<string, unknown>).upload, REDACTED);
});

test("keeps ordinary debugging fields intact", () => {
  const event = scrubEvent({
    extra: { orderStatus: "PAID", statusCode: 500, productId: "p1", count: 3 },
  } as Record<string, unknown>);
  assert.deepEqual(event.extra, {
    orderStatus: "PAID",
    statusCode: 500,
    productId: "p1",
    count: 3,
  });
});

test("survives arrays and deep nesting without throwing", () => {
  const event = scrubEvent({
    breadcrumbs: [{ data: { nested: { deep: { token: "t", ok: "keep" } } } }],
  } as Record<string, unknown>);
  const json = JSON.stringify(event);
  assert.ok(!json.includes('"token":"t"'));
  assert.ok(json.includes("keep"));
});

test("no DSN configured means monitoring is disabled", () => {
  const previous = [process.env.SENTRY_DSN, process.env.NEXT_PUBLIC_SENTRY_DSN];
  delete process.env.SENTRY_DSN;
  delete process.env.NEXT_PUBLIC_SENTRY_DSN;
  try {
    assert.equal(sentryDsn(), undefined);
    process.env.SENTRY_DSN = "https://key@example.ingest.sentry.io/1";
    assert.equal(sentryDsn(), "https://key@example.ingest.sentry.io/1");
  } finally {
    if (previous[0] === undefined) delete process.env.SENTRY_DSN;
    else process.env.SENTRY_DSN = previous[0];
    if (previous[1] === undefined) delete process.env.NEXT_PUBLIC_SENTRY_DSN;
    else process.env.NEXT_PUBLIC_SENTRY_DSN = previous[1];
  }
});
