// Account-status model. Pure — no DB. Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";

import { CUSTOMER_STATUSES } from "../../src/lib/customerAdminDto";

test("exactly the four intended statuses exist (not excessive)", () => {
  assert.deepEqual([...CUSTOMER_STATUSES], ["active", "disabled", "review", "fraud_hold"]);
});

test("arbitrary status values are not part of the model", () => {
  assert.ok(!(CUSTOMER_STATUSES as readonly string[]).includes("banned"));
  assert.ok(!(CUSTOMER_STATUSES as readonly string[]).includes("deleted"));
});
