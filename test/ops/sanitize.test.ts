/**
 * The shared redaction rules.
 *
 * These moved out of the Sentry integration because Sentry was the only channel
 * they protected — and the worst real leak found in the audit (FazerCards
 * writing gift-card codes to Vercel logs) was a plain `console.error` that no
 * Sentry hook could ever have seen. The logger and the alert layer now share
 * this module, so these cases pin the guarantee for all three.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  REDACTED,
  redactFreeText,
  safeErrorInfo,
  sanitizeTree,
} from "../../src/lib/monitoring/sanitize";

test("secret-looking keys are redacted anywhere in the tree", () => {
  const out = sanitizeTree({
    ok: "visible",
    nested: { deep: { giftCode: "ABCD-1234", authorization: "Bearer xyz" } },
    list: [{ password: "hunter2" }],
  }) as Record<string, never>;

  const json = JSON.stringify(out);
  assert.ok(json.includes("visible"), "non-sensitive values must survive");
  assert.ok(!json.includes("ABCD-1234"));
  assert.ok(!json.includes("hunter2"));
  assert.ok(!json.includes("Bearer xyz"));
});

test("ordinary debugging fields stay readable", () => {
  // Over-redaction makes logs useless, which is its own failure mode.
  const out = sanitizeTree({
    statusCode: 500,
    orderStatus: "payment_confirmed",
    productId: "prod_1",
    quantity: 3,
  }) as Record<string, unknown>;

  assert.equal(out.statusCode, 500);
  assert.equal(out.orderStatus, "payment_confirmed");
  assert.equal(out.productId, "prod_1");
  assert.equal(out.quantity, 3);
});

test("inline base64 blobs are redacted even under an innocuous key", () => {
  const out = sanitizeTree({ note: "data:image/png;base64,AAAABBBBCCCC" }) as Record<string, string>;
  assert.equal(out.note, REDACTED);
});

test("a cyclic structure neither hangs nor throws", () => {
  const cyclic: Record<string, unknown> = { name: "root" };
  cyclic.self = cyclic;
  assert.doesNotThrow(() => sanitizeTree(cyclic));
});

test("free text loses embedded secrets and is length-capped", () => {
  const withToken = redactFreeText("failed with Bearer abcdefghijklmnopqrstuvwxyz012345");
  assert.ok(!withToken.includes("abcdefghijklmnopqrstuvwxyz012345"));

  // A long unbroken run is a key or a gift-card code far more often than a word.
  const withKey = redactFreeText(`supplier said ${"A".repeat(40)} is invalid`);
  assert.ok(!withKey.includes("A".repeat(40)));

  const long = redactFreeText("x".repeat(1000));
  assert.ok(long.length <= 301, `expected a capped string, got ${long.length}`);
});

test("safeErrorInfo never returns a raw provider body", () => {
  // The exact shape that motivated this: an SDK putting the response in message.
  const error = new Error('{"codes":["GIFT-CARD-CODE-1234567890ABCDEF"],"status":"ok"}');
  const info = safeErrorInfo(error);
  assert.equal(info.name, "Error");
  assert.ok(!info.message.includes("GIFT-CARD-CODE-1234567890ABCDEF"));
});

test("a non-Error throw degrades safely rather than being stringified blindly", () => {
  assert.deepEqual(safeErrorInfo({ secret: "value" }), {
    name: "UnknownError",
    message: REDACTED,
  });
});
