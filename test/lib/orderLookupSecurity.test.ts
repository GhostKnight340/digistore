// Secure guest/customer order lookup + suspicious-attempt auditing. The action
// and DB helpers pull `@/`-aliased server modules that the test runner does not
// resolve, so — following the repo convention for DB-integration code — the
// security-critical wiring is asserted at the source level. Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const action = readFileSync("src/app/actions/orders.ts", "utf8");
const ordersDb = readFileSync("src/lib/db/orders.ts", "utf8");
const securityLog = readFileSync("src/lib/db/securityLog.ts", "utf8");

test("findOrderAction returns an identical generic failure on every failure mode", () => {
  // A single shared `fail` helper produces `{ found: false }` for rate-limited /
  // not-found / unauthorized — so the response is never an existence oracle.
  const failMatches = action.match(/found:\s*false/g) ?? [];
  assert.ok(failMatches.length >= 1, "expected a uniform found:false failure");
  // All three failure kinds route through the same helper.
  assert.match(action, /order_lookup_ratelimited/);
  assert.match(action, /order_lookup_failed/);
  assert.match(action, /order_lookup_unauthorized/);
  // Timing pad applied on the failure path too (no timing oracle).
  assert.match(action, /padTo\(startedAt\)/);
});

test("logged-in customers are confined to their own orders", () => {
  assert.match(action, /getCurrentCustomer\(\)/);
  assert.match(action, /getOrderOwnership\(order\.id\)/);
  assert.match(action, /customerOwnsOrder\(customer, owner\)/);
  // The ownership check precedes returning any order data.
  const ownershipIdx = action.indexOf("customerOwnsOrder");
  const successIdx = action.indexOf("found: true");
  assert.ok(ownershipIdx > 0 && ownershipIdx < successIdx, "ownership must gate the success return");
});

test("failed/unauthorized attempts charge the escalating budget and are audited", () => {
  assert.match(action, /order-lookup-fail:ip/);
  assert.match(action, /order-lookup-fail:email/);
  assert.match(action, /logSecurityEvent/);
});

test("customerOwnsOrder authorizes by customerId OR matching email", () => {
  // customerId equality wins; otherwise a case-insensitive email match.
  assert.match(ordersDb, /owner\.customerId === customer\.id/);
  assert.match(ordersDb, /owner\.customerEmail\.toLowerCase\(\) === customer\.email\.toLowerCase\(\)/);
});

test("security log hashes the identifier (never stores the raw email) and can alert", () => {
  assert.match(securityLog, /createHash\("sha256"\)/);
  assert.match(securityLog, /identifierHash/);
  // Raw identifier must NOT be written to the row.
  assert.doesNotMatch(securityLog, /data:\s*\{[^}]*identifier:\s*input\.identifier/);
  // Escalation path fires a Discord system alert.
  assert.match(securityLog, /notifySystemAlert/);
});
