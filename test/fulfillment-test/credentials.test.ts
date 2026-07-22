import assert from "node:assert/strict";
import test from "node:test";

import {
  getReloadlyClientId,
  getReloadlyClientSecret,
  isReloadlyConfigured,
  getGiftCardsBaseUrl,
} from "../../src/lib/reloadly/config";

/**
 * The Fulfillment Test Center's core safety property: sandbox and live are
 * entirely separate credential sets, selected explicitly (never by NODE_ENV),
 * and a test run must never read production credentials when asking for sandbox.
 */

function withEnv(vars: Record<string, string | undefined>, fn: () => void) {
  const saved: Record<string, string | undefined> = {};
  for (const key of Object.keys(vars)) {
    saved[key] = process.env[key];
    if (vars[key] === undefined) delete process.env[key];
    else process.env[key] = vars[key];
  }
  try {
    fn();
  } finally {
    for (const key of Object.keys(saved)) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  }
}

test("sandbox credential accessors read the SANDBOX env vars, never the live ones", () => {
  withEnv(
    {
      RELOADLY_CLIENT_ID: "live-id",
      RELOADLY_CLIENT_SECRET: "live-secret",
      RELOADLY_SANDBOX_CLIENT_ID: "sandbox-id",
      RELOADLY_SANDBOX_CLIENT_SECRET: "sandbox-secret",
    },
    () => {
      assert.equal(getReloadlyClientId("sandbox"), "sandbox-id");
      assert.equal(getReloadlyClientSecret("sandbox"), "sandbox-secret");
      assert.equal(getReloadlyClientId("live"), "live-id");
      assert.equal(getReloadlyClientSecret("live"), "live-secret");
    },
  );
});

test("isReloadlyConfigured is independent per environment", () => {
  withEnv(
    {
      RELOADLY_CLIENT_ID: undefined,
      RELOADLY_CLIENT_SECRET: undefined,
      RELOADLY_SANDBOX_CLIENT_ID: "sandbox-id",
      RELOADLY_SANDBOX_CLIENT_SECRET: "sandbox-secret",
    },
    () => {
      assert.equal(isReloadlyConfigured("sandbox"), true);
      assert.equal(isReloadlyConfigured("live"), false);
    },
  );
});

test("gift-card base URL points at the matching Reloadly host per environment", () => {
  assert.equal(getGiftCardsBaseUrl("sandbox"), "https://giftcards-sandbox.reloadly.com");
  assert.equal(getGiftCardsBaseUrl("live"), "https://giftcards.reloadly.com");
});
