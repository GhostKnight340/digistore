/**
 * The unrecognized-payload log must never contain a delivered code.
 *
 * FazerCards returns gift-card codes as the order payload itself, so the
 * previous `JSON.stringify(order)` diagnostic wrote live codes into Vercel logs
 * — retained, readable by anyone with project access, and untouched by the
 * Sentry scrubber (a plain console write never reaches it).
 *
 * `describePayloadShape` replaces it with a structural descriptor. The property
 * under test is the security one: given a payload whose every scalar is a
 * secret, no secret may appear anywhere in the output. The shape must still be
 * informative enough to teach the normalizer a new response format, which is
 * why key names are deliberately preserved.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { describePayloadShape } from "../../src/lib/suppliers/providers/fazercards";

const SECRETS = [
  "ABCD-1234-EFGH-5678",
  "9911",
  "https://redeem.example.com/s/tok_live_x1",
  // Deliberately NOT shaped like a real provider key (no `sk_live_` prefix):
  // this is fake test data, and a realistic-looking prefix trips secret scanners
  // and push protection for no benefit.
  "FAKE-SUPPLIER-TOKEN-abc123",
];

test("no scalar value from the payload appears in the output", () => {
  const payload = {
    id: SECRETS[0],
    cards: [{ code: SECRETS[0], pin: SECRETS[1], url: SECRETS[2] }],
    meta: { apiKey: SECRETS[3] },
  };

  const shape = describePayloadShape(payload);

  for (const secret of SECRETS) {
    assert.ok(
      !shape.includes(secret),
      `describePayloadShape leaked ${secret} in: ${shape}`,
    );
  }
});

test("key names and value types survive, so the shape stays diagnostic", () => {
  const shape = describePayloadShape({ code: "ABCD", pin: 1234, ok: true });

  assert.equal(shape, "{code:string,pin:number,ok:boolean}");
});

test("arrays collapse to a count so a 50-code response stays one short line", () => {
  const shape = describePayloadShape({
    cards: Array.from({ length: 50 }, () => ({ code: "SECRET-CODE" })),
  });

  assert.equal(shape, "{cards:[50×{code:string}]}");
  assert.ok(!shape.includes("SECRET-CODE"));
});

test("depth is capped, so a pathological payload cannot produce an unbounded string", () => {
  // 40 levels deep — without the cap this would recurse the whole way down.
  let deep: unknown = { code: "SECRET-CODE" };
  for (let i = 0; i < 40; i += 1) deep = { nested: deep };

  const shape = describePayloadShape(deep);

  assert.ok(shape.length < 100, `expected a short string, got ${shape.length} chars`);
  assert.ok(!shape.includes("SECRET-CODE"));
});

test("null and empty containers are distinguishable from missing data", () => {
  assert.equal(describePayloadShape(null), "null");
  assert.equal(describePayloadShape([]), "[]");
  assert.equal(describePayloadShape({}), "{}");
  assert.equal(describePayloadShape(undefined), "undefined");
});

test("a wide object is truncated but flagged, never silently cut", () => {
  const wide: Record<string, string> = {};
  for (let i = 0; i < 30; i += 1) wide[`k${i}`] = "SECRET-CODE";

  const shape = describePayloadShape(wide);

  assert.ok(shape.endsWith(",…}"), `expected a truncation marker, got: ${shape}`);
  assert.ok(!shape.includes("SECRET-CODE"));
});
