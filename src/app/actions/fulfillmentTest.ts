"use server";
import { requireAdminCustomer } from "@/lib/auth";
import { runFulfillmentTest } from "@/lib/fulfillment-test/runner";
import type { TestEnvironment, TestMode } from "@/lib/fulfillment-test/types";

export async function runFulfillmentTestAction(input: {
  environment: TestEnvironment;
  mode: TestMode;
  confirmation?: string;
  sendDiscord?: boolean;
}) {
  // Admin-only: server-side gate. Never trust the client for environment/mode.
  const admin = await requireAdminCustomer();
  const result = await runFulfillmentTest({ ...input, createdBy: admin.id });
  // Server-authored JSON only — no secrets, no credentials in the payload.
  return result;
}
