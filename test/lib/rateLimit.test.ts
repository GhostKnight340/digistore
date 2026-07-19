// Sliding-window rate-limit core. Run: npm test
//
// Exercises the pure decision layer (no Next/DB needed): budget enforcement,
// window expiry, independent keying across dimensions, the all-or-nothing
// charging rule in consumeAll, and the sweep that bounds store growth.
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  check,
  consumeAll,
  createStore,
  record,
  sweep,
  type RateLimitPolicy,
} from "../../src/lib/rateLimitCore";

const POLICY: RateLimitPolicy = { limit: 3, windowMs: 60_000 };
const T0 = 1_000_000;

test("allows up to the budget then denies", () => {
  const store = createStore();
  for (let i = 0; i < POLICY.limit; i++) {
    assert.equal(check(store, "ip:1.2.3.4", POLICY, T0).allowed, true);
    record(store, "ip:1.2.3.4", POLICY, T0);
  }
  assert.equal(check(store, "ip:1.2.3.4", POLICY, T0).allowed, false);
});

test("reports remaining budget as it is consumed", () => {
  const store = createStore();
  assert.equal(check(store, "k", POLICY, T0).remaining, 2);
  record(store, "k", POLICY, T0);
  assert.equal(check(store, "k", POLICY, T0).remaining, 1);
  record(store, "k", POLICY, T0);
  assert.equal(check(store, "k", POLICY, T0).remaining, 0);
});

test("events falling out of the window free up budget", () => {
  const store = createStore();
  for (let i = 0; i < POLICY.limit; i++) record(store, "k", POLICY, T0);
  assert.equal(check(store, "k", POLICY, T0).allowed, false);

  // Still inside the window: one millisecond short of expiry.
  assert.equal(check(store, "k", POLICY, T0 + POLICY.windowMs - 1).allowed, false);
  // Window has now slid past every recorded event.
  assert.equal(check(store, "k", POLICY, T0 + POLICY.windowMs).allowed, true);
});

test("the window slides rather than resetting in fixed blocks", () => {
  const store = createStore();
  record(store, "k", POLICY, T0);
  record(store, "k", POLICY, T0 + 30_000);
  record(store, "k", POLICY, T0 + 40_000);
  assert.equal(check(store, "k", POLICY, T0 + 40_000).allowed, false);

  // Only the first event has aged out here, so exactly one slot frees up.
  const later = T0 + 60_000;
  assert.equal(check(store, "k", POLICY, later).allowed, true);
  record(store, "k", POLICY, later);
  assert.equal(check(store, "k", POLICY, later).allowed, false);
});

test("retryAfterMs points at the expiry of the oldest event", () => {
  const store = createStore();
  for (let i = 0; i < POLICY.limit; i++) record(store, "k", POLICY, T0);
  const denied = check(store, "k", POLICY, T0 + 10_000);
  assert.equal(denied.allowed, false);
  assert.equal(denied.retryAfterMs, POLICY.windowMs - 10_000);
});

test("keys are independent: exhausting one IP does not affect another", () => {
  const store = createStore();
  for (let i = 0; i < POLICY.limit; i++) record(store, "ip:1.1.1.1", POLICY, T0);
  assert.equal(check(store, "ip:1.1.1.1", POLICY, T0).allowed, false);
  assert.equal(check(store, "ip:2.2.2.2", POLICY, T0).allowed, true);
});

test("keys are independent across dimensions: IP budget is separate from email", () => {
  const store = createStore();
  for (let i = 0; i < POLICY.limit; i++) record(store, "ip:1.1.1.1", POLICY, T0);
  assert.equal(check(store, "email:a@b.co", POLICY, T0).allowed, true);
});

test("namespacing keeps the same value distinct per action", () => {
  const store = createStore();
  for (let i = 0; i < POLICY.limit; i++) record(store, "login:ip:1.1.1.1", POLICY, T0);
  assert.equal(check(store, "login:ip:1.1.1.1", POLICY, T0).allowed, false);
  assert.equal(check(store, "search:ip:1.1.1.1", POLICY, T0).allowed, true);
});

test("consumeAll denies when ANY dimension is exhausted", () => {
  const store = createStore();
  const dims = [
    { key: "ip:1.1.1.1", policy: POLICY },
    { key: "email:a@b.co", policy: { limit: 1, windowMs: 60_000 } },
  ];
  assert.equal(consumeAll(store, dims, T0).allowed, true);
  // The e-mail dimension has a budget of 1 and is now spent.
  assert.equal(consumeAll(store, dims, T0).allowed, false);
});

test("consumeAll charges every dimension when it allows", () => {
  const store = createStore();
  const dims = [
    { key: "ip:1.1.1.1", policy: POLICY },
    { key: "email:a@b.co", policy: POLICY },
  ];
  consumeAll(store, dims, T0);
  assert.equal(check(store, "ip:1.1.1.1", POLICY, T0).remaining, 1);
  assert.equal(check(store, "email:a@b.co", POLICY, T0).remaining, 1);
});

test("a denied consumeAll charges nothing, so one dimension cannot drain another", () => {
  const store = createStore();
  const strict = { limit: 1, windowMs: 60_000 };
  const dims = [
    { key: "ip:1.1.1.1", policy: POLICY },
    { key: "email:a@b.co", policy: strict },
  ];
  consumeAll(store, dims, T0); // allowed; both charged once
  consumeAll(store, dims, T0); // denied by the e-mail dimension
  consumeAll(store, dims, T0); // denied again

  // The IP dimension must still show exactly ONE recorded event: the denied
  // attempts must not have burned its budget.
  assert.equal(check(store, "ip:1.1.1.1", POLICY, T0).remaining, 1);
});

test("consumeAll surfaces the longest wait among the denied dimensions", () => {
  const store = createStore();
  record(store, "short", { limit: 1, windowMs: 10_000 }, T0);
  record(store, "long", { limit: 1, windowMs: 90_000 }, T0);
  const result = consumeAll(
    store,
    [
      { key: "short", policy: { limit: 1, windowMs: 10_000 } },
      { key: "long", policy: { limit: 1, windowMs: 90_000 } },
    ],
    T0,
  );
  assert.equal(result.allowed, false);
  assert.equal(result.retryAfterMs, 90_000);
});

test("sweep drops fully-expired keys and keeps live ones", () => {
  const store = createStore();
  record(store, "old", POLICY, T0);
  record(store, "fresh", POLICY, T0 + 59_000);
  sweep(store, POLICY.windowMs, T0 + 60_000);
  assert.equal(store.has("old"), false);
  assert.equal(store.has("fresh"), true);
});

test("an empty store allows the first request", () => {
  assert.equal(check(createStore(), "anything", POLICY, T0).allowed, true);
});
