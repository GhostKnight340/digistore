/**
 * The staging safety gate.
 *
 * FazerCards has no sandbox: every key is live and every order spends real USD
 * from one shared wallet. So the only thing standing between a staging deploy
 * and real money is {@link getFazerCardsMode} resolving to "dry_run".
 *
 * These tests exist to make that gate hard to break by accident. The property
 * under test is deliberately asymmetric: reaching "live" must require TWO
 * independent conditions (explicit opt-in AND a production runtime), while
 * falling back to "dry_run" must require nothing at all.
 */
import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  getFazerCardsMode,
  isFazerCardsConfigured,
  isFazerCardsDryRun,
  validateFazerCardsConfig,
} from "../../src/lib/fazercards/config";

const SAVED = { ...process.env };

/** NODE_ENV is typed readonly on process.env; tests still need to vary it. */
function setNodeEnv(value: string): void {
  (process.env as Record<string, string | undefined>).NODE_ENV = value;
}

beforeEach(() => {
  delete process.env.FAZERCARDS_MODE;
  delete process.env.FAZERCARDS_ENABLED;
  delete process.env.FAZERCARDS_API_KEY;
  delete process.env.VERCEL_ENV;
  setNodeEnv("test");
});

afterEach(() => {
  process.env = { ...SAVED };
});

test("mode defaults to dry_run when nothing is configured", () => {
  assert.equal(getFazerCardsMode(), "dry_run");
  assert.equal(isFazerCardsDryRun(), true);
});

test("FAZERCARDS_MODE=live on a PREVIEW deploy stays dry_run", () => {
  // The staging leak scenario: someone copies production env vars to staging.
  process.env.VERCEL_ENV = "preview";
  process.env.FAZERCARDS_MODE = "live";
  assert.equal(getFazerCardsMode(), "dry_run");
});

test("FAZERCARDS_MODE=live in development stays dry_run", () => {
  setNodeEnv("development");
  process.env.FAZERCARDS_MODE = "live";
  assert.equal(getFazerCardsMode(), "dry_run");
});

test("a production runtime WITHOUT the explicit opt-in stays dry_run", () => {
  // Deploying to production must not silently start spending money; the
  // operator has to say so.
  process.env.VERCEL_ENV = "production";
  assert.equal(getFazerCardsMode(), "dry_run");
});

test("live requires BOTH production runtime and explicit opt-in", () => {
  process.env.VERCEL_ENV = "production";
  process.env.FAZERCARDS_MODE = "live";
  assert.equal(getFazerCardsMode(), "live");
  assert.equal(isFazerCardsDryRun(), false);
});

test("a malformed mode value falls back to dry_run, never live", () => {
  process.env.VERCEL_ENV = "production";
  for (const value of ["LIVE ", "true", "1", "production", "liv", ""]) {
    process.env.FAZERCARDS_MODE = value;
    const mode = getFazerCardsMode();
    // "LIVE " is trimmed+lowercased and legitimately matches; everything else
    // must fail safe.
    if (value.trim().toLowerCase() === "live") continue;
    assert.equal(mode, "dry_run", `"${value}" must not enable live mode`);
  }
});

test("FAZERCARDS_ENABLED=false disables the supplier even with a valid key", () => {
  process.env.FAZERCARDS_API_KEY = "fzr_test_key";
  assert.equal(isFazerCardsConfigured(), true);
  process.env.FAZERCARDS_ENABLED = "false";
  assert.equal(isFazerCardsConfigured(), false);
});

test("config validation reports a missing API key", () => {
  const result = validateFazerCardsConfig();
  assert.equal(result.ok, false);
  assert.ok(result.problems.some((p) => p.includes("FAZERCARDS_API_KEY")));
});

test("config validation rejects a non-HTTPS base URL", () => {
  process.env.FAZERCARDS_API_KEY = "fzr_test_key";
  process.env.FAZERCARDS_BASE_URL = "http://insecure.example.test";
  const result = validateFazerCardsConfig();
  assert.ok(result.problems.some((p) => p.includes("HTTPS")));
  delete process.env.FAZERCARDS_BASE_URL;
});
