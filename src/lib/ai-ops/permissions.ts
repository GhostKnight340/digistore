/**
 * Module permission enforcement — the pure decision layer.
 *
 * A module may only call a tool it has been explicitly granted. This file holds
 * the pure predicate so it is testable with no database, exactly like
 * `isJobOverdue` in src/lib/ops/jobRuns.ts. The DB-backed grant lookup lives in
 * src/lib/ai-ops/store.ts and feeds `grantedTools` into these functions.
 *
 * There is deliberately no "AI admin" / wildcard grant: an empty or unknown
 * grant set denies everything (fail closed).
 */

import { isToolName, type ModuleKey, type ToolName } from "./types";

export type PermissionDecision =
  | { allowed: true }
  | { allowed: false; reason: "unknown_tool" | "not_granted" };

/**
 * Can `module` call `tool`, given the set of tool names it has been granted?
 *
 * Pure. `grantedTools` is whatever the store returned for the module; it is
 * treated as an allowlist. An unrecognized tool name is denied before the
 * allowlist is even consulted, so a typo can never be "granted".
 */
export function checkToolPermission(
  _module: ModuleKey,
  tool: string,
  grantedTools: Iterable<string>,
): PermissionDecision {
  if (!isToolName(tool)) return { allowed: false, reason: "unknown_tool" };
  const set = grantedTools instanceof Set ? grantedTools : new Set(grantedTools);
  if (!set.has(tool)) return { allowed: false, reason: "not_granted" };
  return { allowed: true };
}

/** Boolean convenience wrapper over {@link checkToolPermission}. */
export function canModuleUseTool(
  module: ModuleKey,
  tool: string,
  grantedTools: Iterable<string>,
): boolean {
  return checkToolPermission(module, tool, grantedTools).allowed;
}

/**
 * Narrows a raw list of granted tool strings (as stored) to valid ToolNames,
 * dropping anything unrecognized. Keeps the runtime honest even if a stale row
 * references a tool that no longer exists.
 */
export function normalizeGrants(rawTools: Iterable<string>): ToolName[] {
  const out = new Set<ToolName>();
  for (const t of rawTools) if (isToolName(t)) out.add(t);
  return [...out];
}
