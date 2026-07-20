// Admin Email Composer — permission resolution. An admin with an empty explicit
// list is a legacy full-access admin; a restricted list gates each capability.
// The unauthorized-admin and CREDIT_GRANT rules are enforced server-side using
// exactly these pure checks. Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  permissionAllowed,
  resolveEmailPermissions,
  EMAIL_PERMISSIONS,
} from "../../../src/lib/admin/permissionRules";

test("an admin with NO explicit permissions has full access (legacy)", () => {
  assert.equal(permissionAllowed([], EMAIL_PERMISSIONS.VIEW), true);
  assert.equal(permissionAllowed([], EMAIL_PERMISSIONS.SEND), true);
  assert.equal(permissionAllowed([], EMAIL_PERMISSIONS.CREDIT_GRANT), true);
  assert.equal(permissionAllowed(null, EMAIL_PERMISSIONS.CREDIT_GRANT), true);
  assert.equal(permissionAllowed(undefined, EMAIL_PERMISSIONS.CREDIT_GRANT), true);
});

test("a restricted admin is limited to exactly their granted permissions", () => {
  const granted = [EMAIL_PERMISSIONS.VIEW, EMAIL_PERMISSIONS.COMPOSE, EMAIL_PERMISSIONS.SEND];
  assert.equal(permissionAllowed(granted, EMAIL_PERMISSIONS.COMPOSE), true);
  assert.equal(permissionAllowed(granted, EMAIL_PERMISSIONS.SEND), true);
  // No CREDIT_GRANT → may compose/send but never activate a real credit grant.
  assert.equal(permissionAllowed(granted, EMAIL_PERMISSIONS.CREDIT_GRANT), false);
});

test("an admin with only VIEW cannot compose or send", () => {
  const granted = [EMAIL_PERMISSIONS.VIEW];
  const perms = resolveEmailPermissions(granted);
  assert.equal(perms.view, true);
  assert.equal(perms.compose, false);
  assert.equal(perms.send, false);
  assert.equal(perms.creditGrant, false);
});

test("resolveEmailPermissions maps every capability", () => {
  const perms = resolveEmailPermissions([EMAIL_PERMISSIONS.COMPOSE]);
  assert.deepEqual(perms, { view: false, compose: true, send: false, creditGrant: false });
});
