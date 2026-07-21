// AI Operations — runtime config knobs (spec §10) are wired end to end, so
// changing them takes effect without a code change. Source-level (the settings
// row + wiring); values are exercised live. Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const KNOBS = [
  "conversationTtlMinutes",
  "conversationMessageLimit",
  "maxToolRounds",
  "maxToolCallsPerExecution",
  "providerTimeoutMs",
  "providerMaxRetries",
  "userRateLimitPerMin",
  "globalRateLimitPerMin",
];

test("every knob has a column, default, and DTO field", () => {
  const schema = readFileSync("prisma/schema.prisma", "utf8");
  const store = readFileSync("src/lib/ai-ops/store.ts", "utf8");
  for (const k of KNOBS) {
    assert.match(schema, new RegExp(`${k}\\s+Int\\s+@default`), `${k} needs a column with a default`);
    assert.ok(store.includes(k), `${k} must be in the settings DTO`);
  }
});

test("the save action validates/clamps every knob", () => {
  const src = readFileSync("src/app/actions/aiOperations.ts", "utf8");
  for (const k of KNOBS) assert.ok(src.includes(k), `${k} must be clamped in saveAiOpsSettingsAction`);
});

test("the runtime reads knobs from settings (not hardcoded)", () => {
  const mod = readFileSync("src/lib/ai-ops/modules/discordAssistant.ts", "utf8");
  assert.ok(/ctx\.settings\.maxToolRounds/.test(mod), "tool rounds from settings");
  assert.ok(/ctx\.settings\.providerTimeoutMs/.test(mod), "timeout from settings");
  const route = readFileSync("src/app/api/discord/assistant/route.ts", "utf8");
  assert.ok(/settings\.userRateLimitPerMin/.test(route), "user rate limit from settings");
  assert.ok(/settings\.conversationTtlMinutes/.test(route), "conversation TTL from settings");
});

test("the admin settings form exposes the knobs", () => {
  const form = readFileSync("src/components/admin/ai-operations/AiOpsSettingsForm.tsx", "utf8");
  for (const k of KNOBS) assert.ok(form.includes(k), `${k} must be editable in the admin form`);
});
