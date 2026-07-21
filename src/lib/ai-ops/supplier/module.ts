/**
 * Shared constant for the Supplier Intelligence module key. Its own tiny file so
 * the metric gatherer and the orchestrator can import it without a circular
 * dependency, and so the key stays spelled the same everywhere.
 */

export const SUPPLIER_INTELLIGENCE_MODULE = "supplier_intelligence" as const;
