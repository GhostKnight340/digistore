/**
 * Module-key constant for the Customer Support Assistant.
 *
 * Kept in its own tiny file (mirrors reports/module.ts and supplier/module.ts)
 * so the pipeline, sweep, executor, and prompt can import the key without
 * pulling in server-only siblings and creating import cycles.
 */

export const SUPPORT_ASSISTANT_MODULE = "support_assistant" as const;
