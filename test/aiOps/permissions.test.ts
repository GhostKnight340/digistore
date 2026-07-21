// AI Operations — module permission enforcement + spec-mandated defaults.
// Pure, no DB. Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  checkToolPermission,
  canModuleUseTool,
  normalizeGrants,
} from "../../src/lib/ai-ops/permissions";
import {
  DEFAULT_TOOL_GRANTS,
  MODULE_DEFINITIONS,
} from "../../src/lib/ai-ops/types";

test("a granted tool is allowed", () => {
  const d = checkToolPermission("discord_assistant", "getSalesSummary", ["getSalesSummary"]);
  assert.equal(d.allowed, true);
});

test("a tool not in the grant set is denied (fail closed)", () => {
  const d = checkToolPermission("discord_assistant", "getOrderDetails", ["getSalesSummary"]);
  assert.equal(d.allowed, false);
  assert.equal(d.allowed === false && d.reason, "not_granted");
});

test("an unknown tool name is denied before the allowlist is consulted", () => {
  const d = checkToolPermission("discord_assistant", "dropAllTables", ["dropAllTables"]);
  assert.equal(d.allowed, false);
  assert.equal(d.allowed === false && d.reason, "unknown_tool");
});

test("an empty grant set denies everything — there is no wildcard", () => {
  assert.equal(canModuleUseTool("business_intelligence", "getSalesSummary", []), false);
});

test("normalizeGrants drops unknown/duplicate tools", () => {
  const got = normalizeGrants(["getSalesSummary", "getSalesSummary", "nope"]);
  assert.deepEqual(got, ["getSalesSummary"]);
});

test("Marketing Assistant is NOT granted any customer-PII tool by default", () => {
  const grants = DEFAULT_TOOL_GRANTS.marketing_assistant;
  assert.ok(!grants.includes("getCustomerHistory"));
  assert.ok(!grants.includes("getOrderDetails"));
  assert.ok(!grants.includes("getSupportConversation"));
});

test("Support Assistant IS granted the person-scoped tools it needs", () => {
  const grants = DEFAULT_TOOL_GRANTS.support_assistant;
  for (const t of ["getOrderDetails", "getCustomerHistory", "getSupportConversation"]) {
    assert.ok(grants.includes(t as (typeof grants)[number]), `missing ${t}`);
  }
});

test("Discord Assistant defaults are read-only summaries, no PII tools", () => {
  const grants = DEFAULT_TOOL_GRANTS.discord_assistant;
  assert.ok(grants.includes("getSalesSummary"));
  assert.ok(!grants.includes("getCustomerHistory"));
});

test("every module default grant references only real tools", () => {
  for (const def of Object.values(MODULE_DEFINITIONS)) {
    assert.deepEqual(normalizeGrants(def.defaultTools), [...new Set(def.defaultTools)]);
  }
});
