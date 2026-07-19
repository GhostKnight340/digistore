/**
 * FazerCards payload normalization, status vocabulary and snapshot sanitising.
 *
 * The delivered-code extraction is an UNVERIFIED contract (the OpenAPI spec
 * types the order object as additionalProperties:true and no completed-order
 * example is published). These tests therefore pin down the two properties we
 * can guarantee without a real key:
 *
 *   1. Every plausible shape we DO recognise is extracted correctly.
 *   2. An unrecognised shape yields [], so the caller fails loudly instead of
 *      delivering an empty payload to a paying customer.
 *
 * When a real order is captured, add it as a fixture here FIRST, then narrow
 * extractDeliveryFields() to the real shape.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  extractDeliveryFields,
  isTerminalFailureStatus,
  isTerminalSuccessStatus,
  sanitizeProviderSnapshot,
} from "../../src/lib/fazercards/normalize";

test("extracts a list of plain string codes", () => {
  const fields = extractDeliveryFields({
    id: "ord-1",
    status: "completed",
    codes: ["ABC-123", "DEF-456"],
  });
  assert.equal(fields.length, 2);
  assert.equal(fields[0].code, "ABC-123");
  assert.equal(fields[1].code, "DEF-456");
});

test("extracts code + pin objects nested under payload", () => {
  const fields = extractDeliveryFields({
    id: "ord-2",
    status: "completed",
    payload: { cards: [{ code: "CARD-1", pin: "1234" }] },
  });
  assert.equal(fields.length, 1);
  assert.equal(fields[0].code, "CARD-1");
  assert.equal(fields[0].pin, "1234");
});

test("routes URL-shaped values to the url field, not code", () => {
  // The delivery page renders a link differently from a code; misclassifying
  // shows the customer a raw URL in a copy-code box.
  const fields = extractDeliveryFields({
    id: "ord-3",
    status: "completed",
    codes: ["https://redeem.example.com/abc"],
  });
  assert.equal(fields[0].url, "https://redeem.example.com/abc");
  assert.equal(fields[0].code, undefined);
});

test("handles a single-code order with no wrapping list", () => {
  const fields = extractDeliveryFields({ id: "ord-4", status: "completed", code: "SOLO-1" });
  assert.equal(fields.length, 1);
  assert.equal(fields[0].code, "SOLO-1");
});

test("extracts every code for a multi-quantity order", () => {
  // Quantity 3 must deliver 3 codes — silently dropping any is a real loss
  // to the customer.
  const fields = extractDeliveryFields({
    id: "ord-5",
    status: "completed",
    payload: { keys: [{ key: "K1" }, { key: "K2" }, { key: "K3" }] },
  });
  assert.equal(fields.length, 3);
  assert.deepEqual(
    fields.map((f) => f.code),
    ["K1", "K2", "K3"],
  );
});

test("an unrecognised payload yields [] so the caller fails loudly", () => {
  // This is the safety property: never deliver an empty payload silently.
  const fields = extractDeliveryFields({
    id: "ord-6",
    status: "completed",
    some_future_field: { nested: { unexpected: true } },
  });
  assert.equal(fields.length, 0);
});

test("an order with no delivery content at all yields []", () => {
  assert.equal(extractDeliveryFields({ id: "ord-7", status: "completed" }).length, 0);
});

test("terminal success statuses are matched tolerantly", () => {
  for (const status of ["completed", "COMPLETED", "success", "delivered", " done "]) {
    assert.equal(isTerminalSuccessStatus(status), true, status);
  }
});

test("non-terminal and unknown statuses are NOT treated as success", () => {
  // The docs never enumerate the vocabulary, so anything unrecognised must
  // keep polling rather than trigger delivery.
  for (const status of ["processing", "created", "pending", "queued", "weird_new_status", null]) {
    assert.equal(isTerminalSuccessStatus(status), false, String(status));
  }
});

test("terminal failure statuses are recognised", () => {
  for (const status of ["failed", "cancelled", "canceled", "rejected", "refunded"]) {
    assert.equal(isTerminalFailureStatus(status), true, status);
  }
  assert.equal(isTerminalFailureStatus("processing"), false);
});

test("snapshot sanitising masks secrets but preserves shape", () => {
  const snapshot = sanitizeProviderSnapshot({
    id: "ord-8",
    status: "completed",
    codes: ["SECRET-CODE-1"],
    payload: { pin: "9999", name: "Netflix 20 USD" },
  }) as Record<string, unknown>;

  const serialized = JSON.stringify(snapshot);
  assert.ok(!serialized.includes("SECRET-CODE-1"), "delivered code must never be stored");
  assert.ok(!serialized.includes("9999"), "pin must never be stored");
  // Shape is what makes the snapshot useful for diagnosing the parser.
  assert.equal(snapshot.id, "ord-8");
  assert.equal(snapshot.status, "completed");
  assert.ok(String(snapshot.codes).includes("masked"));
  assert.equal((snapshot.payload as Record<string, unknown>).name, "Netflix 20 USD");
});

test("snapshot sanitising masks auth-bearing keys", () => {
  const snapshot = sanitizeProviderSnapshot({
    authorization: "Bearer super-secret",
    api_key: "fzr_live_abc123",
  });
  const serialized = JSON.stringify(snapshot);
  assert.ok(!serialized.includes("super-secret"));
  assert.ok(!serialized.includes("fzr_live_abc123"));
});

test("snapshot sanitising bounds runaway payloads", () => {
  const deep = sanitizeProviderSnapshot({
    a: { b: { c: { d: { e: { f: { g: { h: "too deep" } } } } } } },
  });
  assert.ok(JSON.stringify(deep).includes("depth-limit"));

  const long = sanitizeProviderSnapshot({ note: "x".repeat(500) }) as Record<string, string>;
  assert.ok(long.note.includes("truncated"));
});
