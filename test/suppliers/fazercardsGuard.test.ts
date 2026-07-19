// FazerCards preview-deployment guard. Pure — reads process.env only.
//
// FazerCards has NO sandbox: any configured key is live and any order spends
// real USD. A boot warning is not a guard, so the provider must report itself
// unconfigured on preview/staging, which makes eligibility fall back to manual
// fulfilment instead of reaching a purchase.
//
// Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";

import { fazercardsProvider } from "../../src/lib/suppliers/providers/fazercards";

function withEnv(vars: Record<string, string | undefined>, fn: () => void) {
  const prev: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(vars)) {
    prev[k] = process.env[k];
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  try {
    fn();
  } finally {
    for (const [k, v] of Object.entries(prev)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

test("a live key on a production deployment is configured", () => {
  withEnv({ VERCEL_ENV: "production", FAZERCARDS_API_KEY: "live-key" }, () => {
    assert.equal(fazercardsProvider.isConfigured(), true);
    assert.equal(fazercardsProvider.environment(), "live");
  });
});

test("the same live key on a preview/staging deployment is NOT configured", () => {
  withEnv({ VERCEL_ENV: "preview", FAZERCARDS_API_KEY: "live-key" }, () => {
    assert.equal(fazercardsProvider.isConfigured(), false);
    // No environment reported either — nothing here may be treated as live.
    assert.equal(fazercardsProvider.environment(), null);
  });
});

test("a missing key is unconfigured everywhere", () => {
  withEnv({ VERCEL_ENV: "production", FAZERCARDS_API_KEY: undefined }, () => {
    assert.equal(fazercardsProvider.isConfigured(), false);
    assert.equal(fazercardsProvider.environment(), null);
  });
});

test("the preview guard degrades gracefully: a French message, not a crash", async () => {
  await withEnvAsync({ VERCEL_ENV: "preview", FAZERCARDS_API_KEY: "live-key" }, async () => {
    // testConnection reports the reason instead of throwing or calling out.
    const result = await fazercardsProvider.testConnection();
    assert.equal(result.ok, false);
    assert.match(result.message, /hors production/);

    // validateMapping likewise short-circuits before any HTTP call.
    const mapping = await fazercardsProvider.validateMapping({
      supplierProductId: "card_10usd",
      supplierCategoryId: "gc_steam_1",
      supplierKind: "gift_card",
      supplierRegion: null,
      faceValue: 10,
      faceCurrency: "USD",
    });
    assert.equal(mapping.ok, false);
    assert.match(mapping.message, /hors production/);
  });
});

test("purchase refuses outright on a preview deployment (last line of defence)", async () => {
  await withEnvAsync({ VERCEL_ENV: "preview", FAZERCARDS_API_KEY: "live-key" }, async () => {
    await assert.rejects(
      () =>
        fazercardsProvider.purchase({
          idempotencyScope: "ord_1-item_1-0",
          entryParams: { fazercards: { kind: "gift_card", categoryId: "gc_1", offerId: "card_1" } },
          context: {
            orderId: "ord_1",
            customerEmail: "buyer@example.com",
            faceValue: 10,
            faceCurrency: "USD",
          },
        }),
      /hors production/,
    );
  });
});

async function withEnvAsync(
  vars: Record<string, string | undefined>,
  fn: () => Promise<void>,
) {
  const prev: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(vars)) {
    prev[k] = process.env[k];
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  try {
    await fn();
  } finally {
    for (const [k, v] of Object.entries(prev)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}
