/**
 * Normalized supplier error taxonomy.
 *
 * The assertions that matter here are the CERTAINTY ones: getting "clean" vs
 * "uncertain" wrong is the difference between a safe retry and a second real
 * charge on the customer's behalf.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  NormalizedSupplierError,
  classifySupplierHttpError,
  isNormalizedSupplierError,
} from "../../src/lib/suppliers/errors";

test("4xx statuses classify as clean — the supplier refused before charging", () => {
  for (const status of [400, 401, 403, 404, 409, 422]) {
    const code = classifySupplierHttpError({ status });
    const error = new NormalizedSupplierError(code);
    assert.equal(
      error.certainty,
      "clean",
      `HTTP ${status} must be clean (safe to retry), got ${error.certainty}`,
    );
  }
});

test("5xx and no-response classify as uncertain — money may have moved", () => {
  const serverError = new NormalizedSupplierError(
    classifySupplierHttpError({ status: 503 }),
  );
  assert.equal(serverError.certainty, "uncertain");
  assert.equal(serverError.isUncertain, true);

  const networkError = new NormalizedSupplierError(
    classifySupplierHttpError({ status: null, isNetworkError: true }),
  );
  assert.equal(networkError.code, "timeout_uncertain");
  assert.equal(networkError.isUncertain, true);
});

test("408 and 425 are uncertain, not ordinary client errors", () => {
  // These say "the server may have started work" — treating them as plain
  // 4xx would green-light a retry that double-charges.
  for (const status of [408, 425]) {
    assert.equal(classifySupplierHttpError({ status }), "timeout_uncertain");
  }
});

test("provider machine codes win over the HTTP status", () => {
  // A 400 carrying `insufficient_balance` is far more actionable than
  // "bad request", and drives a different admin alert.
  assert.equal(
    classifySupplierHttpError({ status: 400, providerCode: "insufficient_balance" }),
    "insufficient_balance",
  );
  assert.equal(
    classifySupplierHttpError({ status: 400, providerCode: "ERR_OUT_OF_STOCK" }),
    "product_unavailable",
  );
  assert.equal(
    classifySupplierHttpError({ status: 200, providerCode: "subscription_expired" }),
    "subscription_inactive",
  );
});

test("a missing status is uncertain, never assumed clean", () => {
  assert.equal(classifySupplierHttpError({ status: null }), "timeout_uncertain");
});

test("unknown errors default to uncertain rather than clean", () => {
  // The safe default: wrongly assuming "clean" risks a double charge, wrongly
  // assuming "uncertain" costs one admin click.
  const error = new NormalizedSupplierError("unknown");
  assert.equal(error.certainty, "uncertain");
});

test("non-retryable codes are not retried automatically", () => {
  for (const code of ["auth_failed", "insufficient_balance", "product_unavailable"] as const) {
    assert.equal(new NormalizedSupplierError(code).retryable, false);
  }
  assert.equal(new NormalizedSupplierError("rate_limited").retryable, true);
});

test("errors carry the provider code and status without leaking a body", () => {
  const error = new NormalizedSupplierError("rate_limited", {
    providerCode: "rate_limit_exceeded",
    httpStatus: 429,
    retryAfterSec: 12,
  });
  assert.equal(error.providerCode, "rate_limit_exceeded");
  assert.equal(error.httpStatus, 429);
  assert.equal(error.retryAfterSec, 12);
  assert.ok(isNormalizedSupplierError(error));
});
