// AI Operations — Discord CEO-assistant message routing (spec §6).
// Pure, no DB, no discord.js. Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  routeAssistantMessage,
  stripLeadingMentions,
} from "../../src/lib/ai-ops/discord/assistantRouting";

const MENTION = "<@1234567890123456789>";

test("strips a leading bot mention", () => {
  assert.equal(stripLeadingMentions(`${MENTION} CEO hello`), "CEO hello");
});

test("strips multiple leading mentions and nickname (<@!…>) form", () => {
  assert.equal(stripLeadingMentions(`<@!1234567890123456789> ${MENTION}  hi`), "hi");
});

test("'@Ghost CEO <question>' routes to CEO with the question", () => {
  const r = routeAssistantMessage(`${MENTION} CEO How are sales today?`);
  assert.deepEqual(r, { department: "ceo", question: "How are sales today?" });
});

test("'@Ghost <question>' (no department) defaults to CEO", () => {
  const r = routeAssistantMessage(`${MENTION} Combien de commandes en attente ?`);
  assert.deepEqual(r, { department: "ceo", question: "Combien de commandes en attente ?" });
});

test("the CEO keyword is case-insensitive", () => {
  const r = routeAssistantMessage(`${MENTION} ceo show today's revenue`);
  assert.deepEqual(r, { department: "ceo", question: "show today's revenue" });
});

test("other departments are ignored for now", () => {
  assert.equal(routeAssistantMessage(`${MENTION} support where is my order`), null);
  assert.equal(routeAssistantMessage(`${MENTION} marketing draft a post`), null);
});

test("a bare mention or 'CEO' with no question is ignored", () => {
  assert.equal(routeAssistantMessage(`${MENTION}`), null);
  assert.equal(routeAssistantMessage(`${MENTION} CEO`), null);
});

test("a continuation message without a mention still routes to CEO", () => {
  // In a known thread the worker passes raw follow-up text with no mention.
  const r = routeAssistantMessage("and what about yesterday?");
  assert.deepEqual(r, { department: "ceo", question: "and what about yesterday?" });
});
