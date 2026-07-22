/**
 * Provider-facing tool definitions for the tool-calling loop — PURE (no DB).
 *
 * Each safe business tool gets a JSON-schema function definition the model can
 * select. The schema mirrors the tool-layer validator (a `range` preset/custom,
 * optional `limit`); the real validation and permission checks still happen in
 * tools/service.ts. Only tools a module is GRANTED are exposed to the model.
 */

import type { AiToolDefinition } from "./provider";
import { DATE_PRESETS } from "./dateRange";
import type { ToolName } from "./types";

const RANGE_PARAM = {
  type: "object",
  description:
    "Date range for the metric. Use a preset, or a custom { start, end } as YYYY-MM-DD. Defaults to today if omitted.",
  properties: {
    preset: { type: "string", enum: [...DATE_PRESETS] },
    start: { type: "string", description: "YYYY-MM-DD (custom range start)" },
    end: { type: "string", description: "YYYY-MM-DD (custom range end)" },
  },
  additionalProperties: false,
} as const;

function rangeParams(extra?: Record<string, unknown>) {
  return {
    type: "object",
    properties: { range: RANGE_PARAM, ...(extra ?? {}) },
    additionalProperties: false,
  };
}

const NO_PARAMS = { type: "object", properties: {}, additionalProperties: false };

/** Definition for every tool the CEO module may expose. */
const TOOL_DEFINITIONS: Partial<Record<ToolName, AiToolDefinition>> = {
  getSalesSummary: {
    name: "getSalesSummary",
    description: "Revenue (MAD) and delivered-order counts over a date range.",
    parameters: rangeParams(),
  },
  getOrderSummary: {
    name: "getOrderSummary",
    description: "Order counts and totals grouped by status (includes pending) over a date range.",
    parameters: rangeParams(),
  },
  getPaymentSummary: {
    name: "getPaymentSummary",
    description: "Order totals grouped by status AND by payment method over a date range.",
    parameters: rangeParams(),
  },
  getProductPerformance: {
    name: "getProductPerformance",
    description: "Top-selling products by units sold over a date range (what sold best).",
    parameters: rangeParams({
      limit: { type: "integer", description: "How many top products (1–50).", minimum: 1, maximum: 50 },
    }),
  },
  getCustomerMetrics: {
    name: "getCustomerMetrics",
    description: "New-customer and ordering-customer counts over a date range.",
    parameters: rangeParams(),
  },
  getFulfillmentPerformance: {
    name: "getFulfillmentPerformance",
    description: "Supplier fulfillment success vs failure counts over a date range.",
    parameters: rangeParams(),
  },
  getOperationalIssues: {
    name: "getOperationalIssues",
    description:
      "Current operational issues needing attention right now: payment issues, pending orders, recent failed fulfillments, unhealthy suppliers.",
    parameters: NO_PARAMS,
  },
  getRecentOperationalEvents: {
    name: "getRecentOperationalEvents",
    description: "Recent operational events (supplier request logs, scheduled-job runs).",
    parameters: {
      type: "object",
      properties: { limit: { type: "integer", description: "How many events (1–100).", minimum: 1, maximum: 100 } },
      additionalProperties: false,
    },
  },
  getInstagramProfile: {
    name: "getInstagramProfile",
    description:
      "The connected Instagram business profile (username, name, account type). Read-only; no publishing.",
    parameters: NO_PARAMS,
  },
  getInstagramRecentMedia: {
    name: "getInstagramRecentMedia",
    description: "Recent Instagram posts (caption, type, date, comment/like counts). Read-only.",
    parameters: {
      type: "object",
      properties: { limit: { type: "integer", description: "How many posts (1–24).", minimum: 1, maximum: 24 } },
      additionalProperties: false,
    },
  },
  getInstagramComments: {
    name: "getInstagramComments",
    description:
      "Comments on one Instagram post (by mediaId). Read-only — replies are published only by a human in the admin panel.",
    parameters: {
      type: "object",
      properties: { mediaId: { type: "string", description: "The Instagram media id to read comments for." } },
      required: ["mediaId"],
      additionalProperties: false,
    },
  },
};

/**
 * The provider tool definitions for exactly the tools a module is granted.
 * Sorted by a stable canonical key (tool name) so the definitions serialize
 * identically every request regardless of DB grant order — reordered tools
 * invalidate the tools/system/messages prompt caches (spec: deterministic
 * prefixes), so retrieval order must never leak into the request.
 */
export function toolDefinitionsFor(granted: readonly ToolName[]): AiToolDefinition[] {
  const defs: AiToolDefinition[] = [];
  for (const tool of [...granted].sort()) {
    const def = TOOL_DEFINITIONS[tool];
    if (def) defs.push(def);
  }
  return defs;
}

/** Tool names that have a model-facing definition (for tests/introspection). */
export function definedTools(): ToolName[] {
  return Object.keys(TOOL_DEFINITIONS) as ToolName[];
}
