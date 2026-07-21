// AI Operations — the static tool-call gate: disabled global state, disabled
// module state, and permission enforcement, in priority order. Pure, no DB.
// Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";

import { evaluateStaticGate } from "../../src/lib/ai-ops/gate";

const base = {
  module: "discord_assistant",
  tool: "getSalesSummary",
  globalEnabled: true,
  moduleExists: true,
  moduleEnabled: true,
  grantedTools: ["getSalesSummary"],
};

test("allows a fully-permitted call", () => {
  assert.deepEqual(evaluateStaticGate(base), { allowed: true });
});

test("DISABLED GLOBAL STATE denies before anything else", () => {
  const d = evaluateStaticGate({ ...base, globalEnabled: false });
  assert.equal(d.allowed, false);
  assert.equal(d.allowed === false && d.reason, "global_disabled");
});

test("DISABLED MODULE STATE is denied", () => {
  const d = evaluateStaticGate({ ...base, moduleEnabled: false });
  assert.equal(d.allowed, false);
  assert.equal(d.allowed === false && d.reason, "module_disabled");
});

test("a missing module config is denied", () => {
  const d = evaluateStaticGate({ ...base, moduleExists: false });
  assert.equal(d.allowed, false);
  assert.equal(d.allowed === false && d.reason, "module_missing");
});

test("a permitted-but-ungranted tool is denied", () => {
  const d = evaluateStaticGate({ ...base, tool: "getOrderDetails", grantedTools: ["getSalesSummary"] });
  assert.equal(d.allowed, false);
  assert.equal(d.allowed === false && d.reason, "not_granted");
});

test("an unknown module is denied", () => {
  const d = evaluateStaticGate({ ...base, module: "totally_made_up" });
  assert.equal(d.allowed, false);
  assert.equal(d.allowed === false && d.reason, "unknown_module");
});

test("an unknown tool is denied", () => {
  const d = evaluateStaticGate({ ...base, tool: "runShell" });
  assert.equal(d.allowed, false);
  assert.equal(d.allowed === false && d.reason, "unknown_tool");
});

test("priority: global-disabled beats module-disabled beats not-granted", () => {
  const d = evaluateStaticGate({
    ...base,
    globalEnabled: false,
    moduleEnabled: false,
    grantedTools: [],
  });
  assert.equal(d.allowed === false && d.reason, "global_disabled");
});
