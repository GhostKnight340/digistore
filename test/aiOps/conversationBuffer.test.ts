// AI Operations — conversation memory core (spec §3): identity/isolation, TTL
// expiry, message-cap trim + rolling summary, and redaction. Pure. Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  conversationKey,
  isExpired,
  nextExpiry,
  foldConversation,
  summarize,
  redactText,
  type ConversationIdentity,
  type ConvTurn,
} from "../../src/lib/ai-ops/discord/conversationBuffer";

const base: ConversationIdentity = {
  guildId: "g1",
  channelId: "c1",
  threadId: null,
  discordUserId: "u1",
  module: "discord_assistant",
};

test("distinct identities produce distinct keys — never mix user/channel/thread/dept", () => {
  const k = conversationKey(base);
  assert.notEqual(k, conversationKey({ ...base, discordUserId: "u2" }), "different user");
  assert.notEqual(k, conversationKey({ ...base, channelId: "c2" }), "different channel");
  assert.notEqual(k, conversationKey({ ...base, threadId: "t1" }), "thread vs no-thread");
  assert.notEqual(k, conversationKey({ ...base, module: "support_assistant" }), "different dept");
  // Same identity → same key (stable).
  assert.equal(conversationKey(base), conversationKey({ ...base }));
});

test("expiry is inclusive of the boundary and TTL is bounded", () => {
  const now = new Date(1_000_000);
  const exp = nextExpiry(30, now);
  assert.equal(exp.getTime(), now.getTime() + 30 * 60_000);
  assert.equal(isExpired(exp, new Date(exp.getTime() - 1)), false);
  assert.equal(isExpired(exp, exp), true);
  assert.equal(isExpired(exp, new Date(exp.getTime() + 1)), true);
  // TTL floored to at least 1 minute.
  assert.equal(nextExpiry(0, now).getTime(), now.getTime() + 60_000);
});

test("under the cap, all turns are kept and nothing is summarized", () => {
  const existing = { messages: [] as ConvTurn[], summary: null };
  const r = foldConversation(existing, [{ role: "user", content: "hi" }, { role: "assistant", content: "yo" }], 10);
  assert.equal(r.messages.length, 2);
  assert.equal(r.dropped.length, 0);
  assert.equal(r.summary, null);
});

test("over the cap, oldest turns are dropped and folded into the summary", () => {
  const existing = {
    messages: [
      { role: "user", content: "q1" },
      { role: "assistant", content: "a1" },
      { role: "user", content: "q2" },
      { role: "assistant", content: "a2" },
    ] as ConvTurn[],
    summary: null,
  };
  const r = foldConversation(existing, [{ role: "user", content: "q3" }, { role: "assistant", content: "a3" }], 4);
  assert.equal(r.messages.length, 4, "capped at 4");
  assert.deepEqual(r.messages[3], { role: "assistant", content: "a3" }, "keeps the newest");
  assert.equal(r.dropped.length, 2, "oldest pair dropped");
  assert.match(r.summary ?? "", /q1/, "dropped content folded into summary");
});

test("summary accumulates prior summary and stays bounded", () => {
  const long = "x".repeat(2000);
  const s = summarize("prev digest", [{ role: "user", content: long }]);
  assert.ok(s.startsWith("prev digest"));
  assert.ok(s.length <= 1000, "summary is length-bounded");
});

test("redaction strips secrets but keeps business figures", () => {
  assert.match(redactText("my key is sk-abcdEFGH1234567890xyz done"), /\[redacted\]/);
  assert.match(redactText("Authorization: Bearer abcdefghijklmnop12345"), /Bearer \[redacted\]/);
  assert.match(redactText("code GHOST-AB12CD please"), /\[code\]/);
  assert.match(redactText("hash deadbeefdeadbeefdeadbeefdeadbeef1234"), /\[redacted\]/);
  // Order numbers and amounts survive.
  const kept = redactText("Order #000007 is 120 MAD");
  assert.match(kept, /#000007/);
  assert.match(kept, /120 MAD/);
});
