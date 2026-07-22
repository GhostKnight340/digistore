/**
 * Module-body registry for the base scheduler.
 *
 * The base dispatcher (dispatch.ts) and "Run now" run a scheduled module through
 * `runModule`. Without a body the runner performs the mock placeholder; this
 * registry supplies the REAL body for modules that have one, so a scheduled run
 * does actual work. daily_reports is NOT here — it has its own per-report
 * dispatcher (reportDispatch) and is skipped by the base scheduler.
 */

import "server-only";

import type { ModuleBody } from "./runner";
import { isModuleKey, type ModuleKey } from "./types";
import { supplierBody } from "./modules/supplierIntelligence";
import { businessIntelligenceBody } from "./modules/businessIntelligence";

const MODULE_BODIES: Partial<Record<ModuleKey, ModuleBody>> = {
  supplier_intelligence: supplierBody,
  business_intelligence: businessIntelligenceBody,
};

/** The real body for a module, or undefined (→ the runner's placeholder run). */
export function bodyForModule(module: string): ModuleBody | undefined {
  return isModuleKey(module) ? MODULE_BODIES[module] : undefined;
}
