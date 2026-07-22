/**
 * Shared types for the Fulfillment Test Center. Kept free of `server-only` so
 * the client component can import the result/stage shapes for rendering.
 */
export type TestEnvironment = "sandbox" | "live";

export type TestSupplier = "reloadly" | "fazercards";

/**
 * `full` runs the whole pipeline. The rest run a single seam so an admin can
 * bisect a failure ("only purchase", "only email"…). Modes that would otherwise
 * need a real supplier code (email/encryption/timeline/delivery/discord) use a
 * clearly-marked placeholder so they never spend, even in sandbox.
 */
export type TestMode =
  | "full"
  | "health"
  | "authenticate"
  | "purchase"
  | "encryption"
  | "email"
  | "delivery"
  | "timeline"
  | "discord";

export type StageStatus = "passed" | "failed" | "warning" | "skipped";

export type TestStage = {
  name: string;
  status: StageStatus;
  durationMs: number;
  /** Admin-safe one-line summary (never a raw code / credential). */
  detail?: string;
};

/** A single pre-flight environment/dependency probe. Never blocks a run; a
 *  failed check is surfaced but the admin decides whether to proceed. */
export type HealthCheck = {
  name: string;
  status: "ok" | "fail" | "info";
  detail: string;
};

export type EmailPreview = { subject: string; html: string; text: string };

export type FulfillmentTestResult = {
  id?: string;
  status: "passed" | "failed";
  supplier: TestSupplier;
  environment: TestEnvironment;
  mode: TestMode;
  durationMs: number;
  /** % of executed (non-skipped) stages that passed. */
  healthScore: number;
  stages: TestStage[];
  healthChecks: HealthCheck[];
  warnings: string[];
  /** Human product line actually exercised in the purchase stage, if any. */
  productUsed?: string;
  discordSent: boolean;
  safeError?: string;
  developerError?: string;
  emailPreview?: EmailPreview;
};
