// Server-side GA4 purchase event — payload shape + the no-op guarantees.
// Run: npm test
//
// The two things that matter here are (1) the payload GA4 receives, because
// `transaction_id` is what stops a refresh or a retry double-counting revenue,
// and (2) that the whole thing silently does nothing without GA_API_SECRET —
// analytics must never be able to block or delay order fulfilment.
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  buildPurchasePayload,
  measurementConfig,
  parseGaClientId,
  sendPurchaseEvent,
  syntheticClientId,
} from "../../src/lib/analytics/purchase";

const ITEMS = [{ item_id: "p1", item_name: "Carte cadeau", price: 100, quantity: 2 }];

function withEnv(vars: Record<string, string | undefined>, run: () => void | Promise<void>) {
  const previous: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(vars)) {
    previous[key] = process.env[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  const restore = () => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  };
  const result = run();
  if (result instanceof Promise) return result.finally(restore);
  restore();
  return undefined;
}

test("buildPurchasePayload uses the order id as transaction_id", () => {
  const payload = buildPurchasePayload({
    orderId: "ord_abc123",
    totalMad: 240,
    items: ITEMS,
  });
  assert.equal(payload.events.length, 1);
  const event = payload.events[0];
  assert.equal(event.name, "purchase");
  // Dedup key: GA4 discards a second purchase with the same transaction_id.
  assert.equal(event.params.transaction_id, "ord_abc123");
  assert.equal(event.params.currency, "MAD");
  assert.equal(event.params.value, 240);
  assert.deepEqual(event.params.items, ITEMS);
});

test("buildPurchasePayload rounds the value to 2 decimals", () => {
  const payload = buildPurchasePayload({ orderId: "o", totalMad: 99.999, items: [] });
  assert.equal(payload.events[0].params.value, 100);
});

test("buildPurchasePayload carries no PII", () => {
  const json = JSON.stringify(
    buildPurchasePayload({ orderId: "ord_1", totalMad: 10, items: ITEMS }),
  );
  for (const forbidden of ["@", "password", "token", "proof"]) {
    assert.ok(!json.includes(forbidden), `payload must not contain ${forbidden}`);
  }
});

test("the same order always produces the same payload (replay-safe)", () => {
  const input = { orderId: "ord_x", totalMad: 50, items: ITEMS };
  assert.deepEqual(buildPurchasePayload(input), buildPurchasePayload(input));
});

test("client id falls back to a deterministic synthetic id", () => {
  // Fulfilment often runs from a webhook or cron with no browser context.
  const a = buildPurchasePayload({ orderId: "ord_x", totalMad: 1, items: [] });
  const b = buildPurchasePayload({ orderId: "ord_x", totalMad: 1, items: [] });
  assert.equal(a.client_id, b.client_id);
  assert.match(a.client_id, /^\d+\.0$/);
  assert.notEqual(syntheticClientId("ord_x"), syntheticClientId("ord_y"));
});

test("a real _ga cookie wins over the synthetic id", () => {
  assert.equal(parseGaClientId("GA1.1.1234567890.1700000000"), "1234567890.1700000000");
  assert.equal(parseGaClientId("GA1.2.987.654"), "987.654");
  assert.equal(parseGaClientId(undefined), null);
  assert.equal(parseGaClientId("garbage"), null);
  assert.equal(parseGaClientId("GA1.1.notanumber.x"), null);

  const payload = buildPurchasePayload({
    orderId: "ord_x",
    totalMad: 1,
    items: [],
    clientId: "1234567890.1700000000",
  });
  assert.equal(payload.client_id, "1234567890.1700000000");
});

test("measurementConfig is null unless BOTH GA vars are set", () => {
  withEnv({ NEXT_PUBLIC_GA_ID: undefined, GA_API_SECRET: undefined }, () => {
    assert.equal(measurementConfig(), null);
  });
  withEnv({ NEXT_PUBLIC_GA_ID: "G-TEST", GA_API_SECRET: undefined }, () => {
    assert.equal(measurementConfig(), null);
  });
  withEnv({ NEXT_PUBLIC_GA_ID: undefined, GA_API_SECRET: "s" }, () => {
    assert.equal(measurementConfig(), null);
  });
  withEnv({ NEXT_PUBLIC_GA_ID: "G-TEST", GA_API_SECRET: "s" }, () => {
    assert.deepEqual(measurementConfig(), { measurementId: "G-TEST", apiSecret: "s" });
  });
});

test("sendPurchaseEvent is a silent no-op without GA_API_SECRET", async () => {
  const realFetch = globalThis.fetch;
  let called = false;
  globalThis.fetch = (async () => {
    called = true;
    return new Response("");
  }) as typeof fetch;
  try {
    await withEnv(
      { NEXT_PUBLIC_GA_ID: "G-TEST", GA_API_SECRET: undefined },
      async () => {
        const sent = await sendPurchaseEvent({ orderId: "o", totalMad: 1, items: [] });
        assert.equal(sent, false);
        assert.equal(called, false, "no network call may be made");
      },
    );
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("sendPurchaseEvent is a no-op outside production, even fully configured", async () => {
  const realFetch = globalThis.fetch;
  let called = false;
  globalThis.fetch = (async () => {
    called = true;
    return new Response("");
  }) as typeof fetch;
  try {
    await withEnv(
      {
        NEXT_PUBLIC_GA_ID: "G-TEST",
        GA_API_SECRET: "secret",
        VERCEL_ENV: "preview",
      },
      async () => {
        // Staging must never pollute the live GA property.
        assert.equal(
          await sendPurchaseEvent({ orderId: "o", totalMad: 1, items: [] }),
          false,
        );
        assert.equal(called, false);
      },
    );
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("a failing GA endpoint never throws at the caller", async () => {
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async () => {
    throw new Error("network down");
  }) as typeof fetch;
  try {
    await withEnv(
      { NEXT_PUBLIC_GA_ID: "G-TEST", GA_API_SECRET: "secret", VERCEL_ENV: "production" },
      async () => {
        // Attempted (true) but swallowed — fulfilment must not be able to fail
        // because Google is unreachable.
        assert.equal(
          await sendPurchaseEvent({ orderId: "o", totalMad: 1, items: [] }),
          true,
        );
      },
    );
  } finally {
    globalThis.fetch = realFetch;
  }
});
