// AI Operations — Discord channel configuration validation (spec §6). Pure.
// Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";

import { isValidChannelId } from "../../src/lib/ai-ops/discordChannels";
import { isChannelPurpose, CHANNEL_PURPOSES } from "../../src/lib/ai-ops/types";

test("accepts a 17–20 digit snowflake", () => {
  assert.equal(isValidChannelId("123456789012345678"), true);
  assert.equal(isValidChannelId("12345678901234567"), true);
  assert.equal(isValidChannelId("12345678901234567890"), true);
});

test("rejects non-snowflake channel ids", () => {
  assert.equal(isValidChannelId("123"), false);
  assert.equal(isValidChannelId("not-a-number"), false);
  assert.equal(isValidChannelId("123456789012345678 OR 1=1"), false);
  assert.equal(isValidChannelId(""), false);
  assert.equal(isValidChannelId("123456789012345678901"), false); // 21 digits
});

test("channel purposes cover every reporting/interaction surface", () => {
  assert.deepEqual([...CHANNEL_PURPOSES].sort(), [
    "alerts",
    "assistant",
    "business_intelligence",
    "daily_reports",
    "marketing_drafts",
    "supplier_reports",
    "support_approval",
  ]);
});

test("isChannelPurpose fails closed on unknown purposes", () => {
  assert.equal(isChannelPurpose("alerts"), true);
  assert.equal(isChannelPurpose("everything"), false);
});
