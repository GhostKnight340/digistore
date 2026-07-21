// AI Operations — Discord assistant conversation memory (spec §7).
// Pure, deterministic (time injected), no DB. Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";

import { ConversationStore } from "../../src/lib/ai-ops/discord/conversation";

test("history is empty for an unknown thread", () => {
  const store = new ConversationStore();
  assert.deepEqual(store.history("t1", 1000), []);
});

test("turns accumulate within a thread", () => {
  const store = new ConversationStore();
  store.append("t1", { role: "user", content: "sales?" }, 1000);
  store.append("t1", { role: "assistant", content: "123 MAD" }, 1001);
  assert.deepEqual(store.history("t1", 1002), [
    { role: "user", content: "sales?" },
    { role: "assistant", content: "123 MAD" },
  ]);
});

test("threads are isolated — no context bleeds across threads/users", () => {
  const store = new ConversationStore();
  store.append("t1", { role: "user", content: "secret A" }, 1000);
  store.append("t2", { role: "user", content: "secret B" }, 1000);
  assert.deepEqual(store.history("t1", 1000), [{ role: "user", content: "secret A" }]);
  assert.deepEqual(store.history("t2", 1000), [{ role: "user", content: "secret B" }]);
});

test("inactive threads expire after the TTL", () => {
  const store = new ConversationStore({ ttlMs: 1000 });
  store.append("t1", { role: "user", content: "hi" }, 0);
  assert.equal(store.has("t1", 500), true); // within TTL
  assert.deepEqual(store.history("t1", 2000), []); // past TTL → forgotten
});

test("a new turn after expiry does not resurrect old turns", () => {
  const store = new ConversationStore({ ttlMs: 1000 });
  store.append("t1", { role: "user", content: "old" }, 0);
  store.append("t1", { role: "user", content: "new" }, 5000); // after expiry
  assert.deepEqual(store.history("t1", 5001), [{ role: "user", content: "new" }]);
});

test("history is capped to the most recent maxTurns", () => {
  const store = new ConversationStore({ maxTurns: 2 });
  store.append("t1", { role: "user", content: "1" }, 1);
  store.append("t1", { role: "assistant", content: "2" }, 2);
  store.append("t1", { role: "user", content: "3" }, 3);
  assert.deepEqual(store.history("t1", 4), [
    { role: "assistant", content: "2" },
    { role: "user", content: "3" },
  ]);
});

test("prune/size drop expired threads", () => {
  const store = new ConversationStore({ ttlMs: 1000 });
  store.append("t1", { role: "user", content: "a" }, 0);
  store.append("t2", { role: "user", content: "b" }, 3000);
  assert.equal(store.size(3000), 1); // t1 expired, t2 live
});
