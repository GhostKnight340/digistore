// AI Operations — Discord CEO-assistant prompt + module security guards (spec
// §4, §6, §11). The prompt builder is unit-tested directly; the module body
// imports server-only code (callTool/runner) so its guarantees are asserted at
// the source level, exactly like adminAuth.test.ts. Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  buildSystemPrompt,
  SNAPSHOT_TOOLS,
} from "../../src/lib/ai-ops/discord/assistantPrompt";
import { DEFAULT_TOOL_GRANTS } from "../../src/lib/ai-ops/types";

// ─── Prompt builder ──────────────────────────────────────────────────────────

test("the system prompt forbids inventing numbers", () => {
  const p = buildSystemPrompt().toLowerCase();
  assert.ok(p.includes("never invent"), "must forbid inventing numbers");
  assert.ok(p.includes("only from the provided"), "must ground answers in provided data");
});

test("the system prompt asks the model to mirror the user's language (FR/EN)", () => {
  const p = buildSystemPrompt();
  assert.ok(/same language/i.test(p));
  assert.ok(/french|français/i.test(p) && /english/i.test(p));
});

test("the system prompt forbids leaking secrets/schema/credentials", () => {
  const p = buildSystemPrompt().toLowerCase();
  for (const forbidden of ["api key", "environment variable", "schema", "credential"]) {
    assert.ok(p.includes(forbidden), `prompt should mention it must not reveal: ${forbidden}`);
  }
});

test("operator instructions are appended, not replaced", () => {
  const p = buildSystemPrompt("Prefer bullet points.");
  assert.ok(p.includes("Never invent"), "hard rules remain");
  assert.ok(p.includes("Prefer bullet points."), "extra guidance appended");
});

// ─── Snapshot spec ───────────────────────────────────────────────────────────

test("every snapshot tool is one the module is granted by default", () => {
  const granted = new Set<string>(DEFAULT_TOOL_GRANTS.discord_assistant);
  for (const { tool } of SNAPSHOT_TOOLS) {
    assert.ok(granted.has(tool), `${tool} must be in the module's default grants`);
  }
});

// ─── Source-level security guards ────────────────────────────────────────────

const MODULE_SRC = readFileSync("src/lib/ai-ops/modules/discordAssistant.ts", "utf8");

test("the module never imports Prisma directly — it must use the safe tool layer", () => {
  assert.ok(!/@\/lib\/db\/prisma/.test(MODULE_SRC), "must not import the prisma client");
  assert.ok(!/from ["']@prisma\/client["']/.test(MODULE_SRC), "must not import prisma client pkg");
  assert.ok(/callTool\(/.test(MODULE_SRC), "must read data through callTool");
});

test("the module never imports discord.js (that lives only in the worker)", () => {
  assert.ok(!/discord\.js/.test(MODULE_SRC), "app module must not pull in discord.js");
});

test("the module runs through the guarded runner (global switch/budget/logging)", () => {
  assert.ok(/runModule\(/.test(MODULE_SRC), "must execute via runModule");
});

test("the assistant endpoint verifies HMAC and authorizes an admin", () => {
  const src = readFileSync("src/app/api/discord/assistant/route.ts", "utf8");
  assert.ok(/createHmac/.test(src) && /timingSafeEqual/.test(src), "HMAC + constant-time compare");
  assert.ok(/authorizeDiscordAdmin/.test(src), "must authorize the Discord user as an admin");
});
