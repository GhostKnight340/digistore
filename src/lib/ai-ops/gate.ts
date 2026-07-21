/**
 * The tool-call authorization gate — the pure, ordered decision.
 *
 * callTool (src/lib/ai-ops/tools/service.ts) gathers facts from the DB and then
 * asks this function, in a fixed order, whether the call may proceed and — if
 * not — exactly why. Extracting it keeps the security rules (global kill switch,
 * module enablement, explicit permission) in one pure, unit-testable place, the
 * same way the ops layer extracts isJobOverdue.
 *
 * Rate-limiting and input validation are deliberately NOT here: they have side
 * effects / their own validators and are applied by callTool AFTER this gate
 * passes (so a denied call never burns rate budget). This gate covers the
 * static allow/deny rules only.
 */

import { checkToolPermission } from "./permissions";
import { isModuleKey, isToolName, type ModuleKey, type ToolName } from "./types";

export interface GateFacts {
  module: string;
  tool: string;
  globalEnabled: boolean;
  /** Whether a config row exists for the module. */
  moduleExists: boolean;
  moduleEnabled: boolean;
  /** The tools the module has been granted (from the store). */
  grantedTools: Iterable<string>;
}

export type GateDenyReason =
  | "unknown_module"
  | "unknown_tool"
  | "global_disabled"
  | "module_missing"
  | "module_disabled"
  | "not_granted";

export type GateDecision =
  | { allowed: true }
  | { allowed: false; reason: GateDenyReason };

/**
 * Applies the static gate in priority order. Fail closed at every step: an
 * unknown module/tool, the global switch off, a missing or disabled module, or a
 * missing permission each deny before anything with a side effect runs.
 */
export function evaluateStaticGate(facts: GateFacts): GateDecision {
  if (!isModuleKey(facts.module)) return { allowed: false, reason: "unknown_module" };
  if (!isToolName(facts.tool)) return { allowed: false, reason: "unknown_tool" };
  if (!facts.globalEnabled) return { allowed: false, reason: "global_disabled" };
  if (!facts.moduleExists) return { allowed: false, reason: "module_missing" };
  if (!facts.moduleEnabled) return { allowed: false, reason: "module_disabled" };

  const permission = checkToolPermission(
    facts.module as ModuleKey,
    facts.tool as ToolName,
    facts.grantedTools,
  );
  if (!permission.allowed) {
    return { allowed: false, reason: permission.reason === "unknown_tool" ? "unknown_tool" : "not_granted" };
  }
  return { allowed: true };
}
