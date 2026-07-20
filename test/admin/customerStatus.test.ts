// Account-status model. Pure — no DB. Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";

import { CUSTOMER_STATUSES } from "../../src/lib/customerAdminDto";

test("exactly the intended statuses exist (not excessive)", () => {
  // "deleted" is the GDPR-erasure state (see customerAdmin anonymize flow).
  assert.deepEqual([...CUSTOMER_STATUSES], ["active", "disabled", "review", "fraud_hold", "deleted"]);
});

test("arbitrary status values are not part of the model", () => {
  assert.ok(!(CUSTOMER_STATUSES as readonly string[]).includes("banned"));
  assert.ok(!(CUSTOMER_STATUSES as readonly string[]).includes("suspended"));
});
