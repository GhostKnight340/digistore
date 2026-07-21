// AI Operations — Discord CEO-assistant authorization decision (spec §11).
// Pure predicate only (the DB-backed resolver chains into prisma and is covered
// by the wider suite). Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";

import { decideAuthorization } from "../../src/lib/ai-ops/discord/assistantAuth";

test("the configured owner is authorized", () => {
  const d = decideAuthorization({ isOwner: true, linkedRole: null });
  assert.equal(d.authorized, true);
  assert.equal(d.authorized === true && d.via, "owner");
});

test("a linked ADMIN account is authorized", () => {
  const d = decideAuthorization({ isOwner: false, linkedRole: "ADMIN" });
  assert.equal(d.authorized, true);
  assert.equal(d.authorized === true && d.via, "admin_account");
});

test("a linked non-admin (CUSTOMER) account is rejected", () => {
  const d = decideAuthorization({ isOwner: false, linkedRole: "CUSTOMER" });
  assert.equal(d.authorized, false);
});

test("no owner match and no linked account is rejected (fail closed)", () => {
  const d = decideAuthorization({ isOwner: false, linkedRole: null });
  assert.equal(d.authorized, false);
  assert.equal(d.authorized === false && d.reason, "not_owner_not_admin");
});
