// Runtime environment detection. Pure — reads process.env only.
// Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  runtimeEnv,
  isProductionRuntime,
  isPreviewDeployment,
} from "../../src/lib/env";

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

test("VERCEL_ENV=production is the only true production", () => {
  withEnv({ VERCEL_ENV: "production" }, () => {
    assert.equal(runtimeEnv(), "production");
    assert.equal(isProductionRuntime(), true);
    assert.equal(isPreviewDeployment(), false);
  });
});

test("VERCEL_ENV=preview (staging custom env) is never production", () => {
  withEnv({ VERCEL_ENV: "preview" }, () => {
    assert.equal(runtimeEnv(), "preview");
    assert.equal(isProductionRuntime(), false);
    assert.equal(isPreviewDeployment(), true);
  });
});

test("NODE_ENV=production without VERCEL_ENV is NOT treated as the live site by preview checks", () => {
  withEnv({ VERCEL_ENV: undefined, NODE_ENV: "production" }, () => {
    // Local/other: production by NODE_ENV, but crucially not a preview deployment.
    assert.equal(isPreviewDeployment(), false);
  });
});

test("plain local dev is development", () => {
  withEnv({ VERCEL_ENV: undefined, NODE_ENV: "development" }, () => {
    assert.equal(runtimeEnv(), "development");
    assert.equal(isProductionRuntime(), false);
    assert.equal(isPreviewDeployment(), false);
  });
});
