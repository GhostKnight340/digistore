/**
 * Shared constant for the Daily Reports module key. Its own tiny file so both
 * the metric gatherer and the module orchestrator can import it without a
 * circular dependency, and so the key stays spelled the same everywhere.
 */

export const DAILY_REPORTS_MODULE = "daily_reports" as const;
