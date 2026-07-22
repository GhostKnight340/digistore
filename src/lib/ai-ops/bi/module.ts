/**
 * Shared constant for the Business Intelligence module key. Its own tiny file so
 * the metric gatherer and the orchestrator can import it without a circular
 * dependency, and so the key stays spelled the same everywhere.
 */

export const BUSINESS_INTELLIGENCE_MODULE = "business_intelligence" as const;
