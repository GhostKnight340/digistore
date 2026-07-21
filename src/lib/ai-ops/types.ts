/**
 * AI Operations — the shared vocabulary.
 *
 * Following this repo's convention (no Prisma enums), every status/kind stored
 * as a `String` column has its allowed set defined HERE as a TypeScript union,
 * and the Prisma models carry an inline comment pointing back at these names.
 * This module is the single source of truth for module keys, execution modes,
 * tool names, the default permission grants, and the seed defaults.
 *
 * Kept free of `server-only`, Prisma, and Node imports so it can be used from
 * both server code and pure unit tests.
 */

// ─── Modules ─────────────────────────────────────────────────────────────────

export const MODULE_KEYS = [
  "discord_assistant",
  "support_assistant",
  "daily_reports",
  "supplier_intelligence",
  "meta_ads_intelligence",
  "business_intelligence",
  "marketing_assistant",
] as const;

export type ModuleKey = (typeof MODULE_KEYS)[number];

export function isModuleKey(value: string): value is ModuleKey {
  return (MODULE_KEYS as readonly string[]).includes(value);
}

// ─── Execution modes ─────────────────────────────────────────────────────────

export const EXECUTION_MODES = [
  "READ_ONLY",
  "DRAFT_ONLY",
  "APPROVAL_REQUIRED",
  "AUTONOMOUS",
] as const;

export type ExecutionMode = (typeof EXECUTION_MODES)[number];

export function isExecutionMode(value: string): value is ExecutionMode {
  return (EXECUTION_MODES as readonly string[]).includes(value);
}

// ─── Safe business tools ─────────────────────────────────────────────────────
// The complete set of read-only tools the service layer exposes. A module may
// only call a tool it has been explicitly granted (see DEFAULT_TOOL_GRANTS and
// src/lib/ai-ops/permissions.ts). There is deliberately no wildcard.

export const TOOL_NAMES = [
  "getSalesSummary",
  "getOrderSummary",
  "getPendingOrders",
  "getOrderDetails",
  "getPaymentSummary",
  "getFulfillmentPerformance",
  "getCustomerMetrics",
  "getOperationalIssues",
  "getCustomerHistory",
  "getSupportConversation",
  "getSupplierProductCosts",
  "getSupplierApiHealth",
  "getTopSellingProducts",
  "getProductPerformance",
  "getRecentOperationalEvents",
] as const;

export type ToolName = (typeof TOOL_NAMES)[number];

export function isToolName(value: string): value is ToolName {
  return (TOOL_NAMES as readonly string[]).includes(value);
}

// ─── Approval queue ──────────────────────────────────────────────────────────

export const APPROVAL_STATUSES = [
  "PENDING",
  "APPROVED",
  "REJECTED",
  "EXPIRED",
  "EXECUTING",
  "COMPLETED",
  "FAILED",
  "CANCELLED",
] as const;

export type ApprovalStatus = (typeof APPROVAL_STATUSES)[number];

export const RISK_LEVELS = ["low", "medium", "high"] as const;
export type RiskLevel = (typeof RISK_LEVELS)[number];

// ─── Execution / tool-call / job statuses ────────────────────────────────────

export type ExecutionStatus = "running" | "success" | "failure" | "skipped";
export type ExecutionTrigger = "schedule" | "manual" | "discord" | "webhook";
export type ToolCallStatus =
  | "success"
  | "denied"
  | "invalid_input"
  | "rate_limited"
  | "error";
export type JobStatus = "idle" | "running" | "success" | "failure";

// ─── Discord channel purposes ────────────────────────────────────────────────

export const CHANNEL_PURPOSES = [
  "assistant",
  "support_approval",
  "daily_reports",
  "alerts",
  "supplier_reports",
  "marketing_drafts",
] as const;

export type ChannelPurpose = (typeof CHANNEL_PURPOSES)[number];

export function isChannelPurpose(value: string): value is ChannelPurpose {
  return (CHANNEL_PURPOSES as readonly string[]).includes(value);
}

// ─── AI providers ────────────────────────────────────────────────────────────
// "mock" returns deterministic placeholder output (the foundation default, no
// key required); "disabled" hard-refuses. Real providers are wired later.

export const AI_PROVIDERS = ["mock", "disabled", "openrouter", "anthropic", "openai"] as const;
export type AiProvider = (typeof AI_PROVIDERS)[number];

export function isAiProvider(value: string): value is AiProvider {
  return (AI_PROVIDERS as readonly string[]).includes(value);
}

// ─── Module registry: labels + spec-mandated defaults ────────────────────────

export interface ModuleDefinition {
  key: ModuleKey;
  /** Human label for the admin UI. */
  label: string;
  /** One-line description of what the module will eventually do. */
  description: string;
  /** Default execution mode, per the task spec §3. */
  defaultMode: ExecutionMode;
  /** Default cron schedule (in AiOpsSettings.timezone), or null for on-demand. */
  defaultSchedule: string | null;
  /** Whether this module runs on the scheduler (gets an AiScheduledJob row). */
  scheduled: boolean;
  /** Tools granted by default (spec §5). */
  defaultTools: ToolName[];
}

export const MODULE_DEFINITIONS: Record<ModuleKey, ModuleDefinition> = {
  discord_assistant: {
    key: "discord_assistant",
    label: "Discord Business Assistant",
    description:
      "Answers business questions in Discord using the safe read-only tools.",
    defaultMode: "READ_ONLY",
    defaultSchedule: null,
    scheduled: false,
    // The CEO tool set: narrow, date-range-aware, read-only business tools the
    // model may select from (spec §1).
    defaultTools: [
      "getSalesSummary",
      "getOrderSummary",
      "getPaymentSummary",
      "getProductPerformance",
      "getOperationalIssues",
      "getRecentOperationalEvents",
      "getCustomerMetrics",
      "getFulfillmentPerformance",
    ],
  },
  support_assistant: {
    key: "support_assistant",
    label: "Customer Support Assistant",
    description:
      "Drafts support replies and waits for human approval before anything is sent.",
    defaultMode: "APPROVAL_REQUIRED",
    defaultSchedule: null,
    scheduled: false,
    defaultTools: [
      "getOrderDetails",
      "getCustomerHistory",
      "getSupportConversation",
      "getPaymentSummary",
      "getFulfillmentPerformance",
    ],
  },
  daily_reports: {
    key: "daily_reports",
    label: "Daily Operational Reports",
    description: "Posts a daily operational summary to the reports channel.",
    defaultMode: "AUTONOMOUS",
    // 07:00 in the configured timezone.
    defaultSchedule: "0 7 * * *",
    scheduled: true,
    defaultTools: [
      "getSalesSummary",
      "getPendingOrders",
      "getPaymentSummary",
      "getFulfillmentPerformance",
      "getTopSellingProducts",
      "getRecentOperationalEvents",
    ],
  },
  supplier_intelligence: {
    key: "supplier_intelligence",
    label: "Supplier Intelligence",
    description:
      "Monitors Reloadly & FazerCards costs, availability and API health.",
    defaultMode: "READ_ONLY",
    defaultSchedule: "0 */6 * * *",
    scheduled: true,
    defaultTools: [
      "getSupplierProductCosts",
      "getSupplierApiHealth",
      "getFulfillmentPerformance",
    ],
  },
  meta_ads_intelligence: {
    key: "meta_ads_intelligence",
    label: "Meta Ads Intelligence",
    description: "Reviews Meta Ads performance (data source wired later).",
    defaultMode: "READ_ONLY",
    defaultSchedule: "0 8 * * *",
    scheduled: true,
    defaultTools: ["getSalesSummary", "getProductPerformance"],
  },
  business_intelligence: {
    key: "business_intelligence",
    label: "Business Intelligence",
    description: "Aggregated operational and financial intelligence reports.",
    defaultMode: "READ_ONLY",
    defaultSchedule: "0 9 * * 1",
    scheduled: true,
    defaultTools: [
      "getSalesSummary",
      "getPaymentSummary",
      "getFulfillmentPerformance",
      "getProductPerformance",
      "getTopSellingProducts",
      "getRecentOperationalEvents",
    ],
  },
  marketing_assistant: {
    key: "marketing_assistant",
    label: "Marketing Assistant",
    description:
      "Drafts marketing content from aggregated performance — never customer PII.",
    defaultMode: "DRAFT_ONLY",
    defaultSchedule: null,
    scheduled: false,
    defaultTools: [
      "getSalesSummary",
      "getProductPerformance",
      "getTopSellingProducts",
    ],
  },
};

/** Map of module → its default granted tools. Used to seed AiModulePermission. */
export const DEFAULT_TOOL_GRANTS: Record<ModuleKey, ToolName[]> = Object.freeze(
  Object.fromEntries(
    MODULE_KEYS.map((key) => [key, MODULE_DEFINITIONS[key].defaultTools]),
  ) as Record<ModuleKey, ToolName[]>,
);

export function moduleDefinition(key: ModuleKey): ModuleDefinition {
  return MODULE_DEFINITIONS[key];
}

export function moduleLabel(key: string): string {
  return isModuleKey(key) ? MODULE_DEFINITIONS[key].label : key;
}
