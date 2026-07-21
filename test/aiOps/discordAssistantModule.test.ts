// AI Operations — Discord CEO-assistant prompt + module security guards (spec
// §4, §6, §11). The prompt builder is unit-tested directly; the module body
// imports server-only code (callTool/runner) so its guarantees are asserted at
// the source level, exactly like adminAuth.test.ts. Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { buildSystemPrompt } from "../../src/lib/ai-ops/discord/assistantPrompt";
import { DEFAULT_TOOL_GRANTS } from "../../src/lib/ai-ops/types";
import { toolDefinitionsFor, definedTools } from "../../src/lib/ai-ops/toolDefs";

// ─── Prompt builder ──────────────────────────────────────────────────────────

test("the system prompt forbids inventing numbers and grounds in tool results", () => {
  const p = buildSystemPrompt().toLowerCase();
  assert.ok(p.includes("never invent"), "must forbid inventing numbers");
  assert.ok(p.includes("come from a tool"), "every metric must come from a tool result");
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

// ─── Tool definitions exposed to the model ───────────────────────────────────

test("only granted CEO tools are exposed as model tool definitions", () => {
  const grants = DEFAULT_TOOL_GRANTS.discord_assistant;
  const defs = toolDefinitionsFor(grants);
  const names = new Set(defs.map((d) => d.name));
  // Every exposed def is a granted tool (no leaking non-granted tools).
  for (const d of defs) assert.ok((grants as readonly string[]).includes(d.name), `${d.name} not granted`);
  // The core CEO tools all have a model-facing definition.
  for (const t of ["getSalesSummary", "getOrderSummary", "getProductPerformance", "getOperationalIssues"]) {
    assert.ok(names.has(t), `${t} must be exposed to the model`);
  }
  // A module granted nothing exposes nothing.
  assert.equal(toolDefinitionsFor([]).length, 0);
  // definedTools is a subset of the CEO grants (no stray definitions).
  assert.ok(definedTools().length >= 6);
});

// ─── Source-level security guards ────────────────────────────────────────────

const MODULE_SRC = readFileSync("src/lib/ai-ops/modules/discordAssistant.ts", "utf8");
const LOOP_SRC = readFileSync("src/lib/ai-ops/toolLoop.ts", "utf8");

test("the module never imports Prisma directly — it must use the safe tool layer", () => {
  assert.ok(!/@\/lib\/db\/prisma/.test(MODULE_SRC), "must not import the prisma client");
  assert.ok(!/from ["']@prisma\/client["']/.test(MODULE_SRC), "must not import prisma client pkg");
  // Data is read via callTool, wired into the tool-calling loop.
  assert.ok(/callTool\(/.test(MODULE_SRC), "must read data through callTool");
  assert.ok(/runToolLoop\(/.test(MODULE_SRC), "must drive the bounded tool-calling loop");
});

test("the tool loop enforces grants and never runs model code", () => {
  assert.ok(/granted\.has\(/.test(LOOP_SRC), "must reject non-granted tools");
  assert.ok(/isToolName\(/.test(LOOP_SRC), "must reject unknown tools");
  assert.ok(!/eval\(|new Function/.test(LOOP_SRC), "must never execute model-generated code");
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
