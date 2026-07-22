import assert from "node:assert/strict";
import test from "node:test";

import {
  STAGE,
  STAGE_PLAN,
  pickSandboxProduct,
  blockingHealthChecks,
  type SandboxProductPick,
} from "../../src/lib/fulfillment-test/plan";
import type { ReloadlyGiftCardProduct } from "../../src/lib/reloadly/operations";
import type { HealthCheck } from "../../src/lib/fulfillment-test/types";

// Minimal product factory — pickSandboxProduct only reads a handful of fields.
function product(overrides: Partial<ReloadlyGiftCardProduct>): ReloadlyGiftCardProduct {
  return {
    productId: 1,
    productName: "Test Card",
    status: "ACTIVE",
    denominationType: "FIXED",
    recipientCurrencyCode: "USD",
    fixedRecipientDenominations: [],
    minRecipientDenomination: null,
    country: { isoName: "US", name: "United States", flagUrl: "" },
    ...overrides,
  } as unknown as ReloadlyGiftCardProduct;
}

test("full plan runs every stage in production order", () => {
  assert.deepEqual(STAGE_PLAN.full, [
    STAGE.context,
    STAGE.auth,
    STAGE.select,
    STAGE.validate,
    STAGE.purchase,
    STAGE.store,
    STAGE.email,
    STAGE.timeline,
    STAGE.discord,
  ]);
});

test("purchase mode stops after storing the code (no email/timeline/discord)", () => {
  assert.ok(STAGE_PLAN.purchase.includes(STAGE.purchase));
  assert.ok(!STAGE_PLAN.purchase.includes(STAGE.email));
  assert.ok(!STAGE_PLAN.purchase.includes(STAGE.timeline));
  assert.ok(!STAGE_PLAN.purchase.includes(STAGE.discord));
});

test("health mode plans no pipeline stages", () => {
  assert.deepEqual(STAGE_PLAN.health, []);
});

test("pickSandboxProduct prefers the smallest FIXED denomination", () => {
  const picked = pickSandboxProduct([
    product({ productId: 10, fixedRecipientDenominations: [25, 50] }),
    product({ productId: 11, fixedRecipientDenominations: [5, 100] }),
  ]);
  assert.equal(picked?.product.productId, 11);
  assert.equal(picked?.faceValue, 5);
});

test("pickSandboxProduct ignores INACTIVE products and those without a country", () => {
  const picked = pickSandboxProduct([
    product({ productId: 20, status: "INACTIVE", fixedRecipientDenominations: [1] }),
    product({ productId: 21, country: undefined as never, fixedRecipientDenominations: [1] }),
    product({ productId: 22, fixedRecipientDenominations: [10] }),
  ]);
  assert.equal(picked?.product.productId, 22);
});

test("pickSandboxProduct falls back to a RANGE product minimum when no FIXED exists", () => {
  const picked = pickSandboxProduct([
    product({ productId: 30, denominationType: "RANGE", fixedRecipientDenominations: [], minRecipientDenomination: 3 }),
  ]);
  assert.equal(picked?.product.productId, 30);
  assert.equal(picked?.faceValue, 3);
});

test("pickSandboxProduct returns null when nothing is usable", () => {
  const picked: SandboxProductPick | null = pickSandboxProduct([
    product({ status: "INACTIVE", fixedRecipientDenominations: [1] }),
    product({ denominationType: "RANGE", fixedRecipientDenominations: [], minRecipientDenomination: null }),
  ]);
  assert.equal(picked, null);
});

test("blockingHealthChecks keeps only failures", () => {
  const checks: HealthCheck[] = [
    { name: "DB", status: "ok", detail: "" },
    { name: "Creds", status: "fail", detail: "" },
    { name: "Discord", status: "info", detail: "" },
  ];
  const blocking = blockingHealthChecks(checks);
  assert.equal(blocking.length, 1);
  assert.equal(blocking[0].name, "Creds");
});
