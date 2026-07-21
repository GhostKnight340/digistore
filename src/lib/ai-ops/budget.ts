/**
 * AI budget guardrails — the pure decision layer.
 *
 * Two independent ceilings protect spend: a MONTHLY budget (global, from
 * AiOpsSettings) and a per-module DAILY cost cap (from AiModuleConfig). A run is
 * blocked before it starts if either is already exceeded, and a warning is
 * surfaced once the configured warning threshold is crossed. All amounts are
 * USD. Pure and DB-free so the gating rules are unit-testable.
 *
 * A limit of 0 means "unset / no limit" — the foundation ships with limits at 0
 * so nothing is throttled until an admin configures real numbers.
 */

export interface BudgetLimits {
  /** Global monthly budget ceiling (USD). 0 = no limit. */
  monthlyBudgetUsd: number;
  /** Warn once monthly spend crosses this (USD). 0 = no warning. */
  warningThresholdUsd: number;
  /** Hard stop for monthly spend (USD). 0 = no hard limit. */
  hardLimitUsd: number;
}

export interface BudgetState {
  /** Estimated spend so far this month (USD). */
  monthSpentUsd: number;
  /** Estimated spend so far today for the module (USD). */
  moduleDaySpentUsd: number;
  /** The module's daily cap (USD). 0 = no cap. */
  moduleDailyCapUsd: number;
  /** Executions the module has already run today. */
  moduleExecutionsToday: number;
  /** The module's max executions/day. 0 = no cap. */
  moduleMaxExecutionsPerDay: number;
}

export type BudgetBlockReason =
  | "monthly_hard_limit"
  | "monthly_budget"
  | "module_daily_cost"
  | "module_daily_executions";

export interface BudgetDecision {
  allowed: boolean;
  reason?: BudgetBlockReason;
  /** True when spend has crossed the warning threshold (may still be allowed). */
  warning: boolean;
  message?: string;
}

/** Treats a limit of 0 (or negative/NaN) as "no limit". */
function hasLimit(limit: number): boolean {
  return Number.isFinite(limit) && limit > 0;
}

/**
 * May a module start a new execution whose estimated cost is `estimatedCostUsd`?
 *
 * Checks, in priority order: the monthly hard limit, the monthly budget, the
 * module's daily cost cap, and the module's daily execution count. The
 * projected spend (`spent + estimated`) is what is compared, so a run that
 * would push spend over the line is blocked rather than the one after it.
 */
export function evaluateBudget(
  limits: BudgetLimits,
  state: BudgetState,
  estimatedCostUsd = 0,
): BudgetDecision {
  const est = Number.isFinite(estimatedCostUsd) && estimatedCostUsd > 0 ? estimatedCostUsd : 0;
  const projectedMonth = state.monthSpentUsd + est;
  const projectedModuleDay = state.moduleDaySpentUsd + est;

  if (hasLimit(limits.hardLimitUsd) && projectedMonth > limits.hardLimitUsd) {
    return {
      allowed: false,
      reason: "monthly_hard_limit",
      warning: true,
      message: `Monthly hard limit reached ($${limits.hardLimitUsd}).`,
    };
  }

  if (hasLimit(limits.monthlyBudgetUsd) && projectedMonth > limits.monthlyBudgetUsd) {
    return {
      allowed: false,
      reason: "monthly_budget",
      warning: true,
      message: `Monthly budget exhausted ($${limits.monthlyBudgetUsd}).`,
    };
  }

  if (hasLimit(state.moduleDailyCapUsd) && projectedModuleDay > state.moduleDailyCapUsd) {
    return {
      allowed: false,
      reason: "module_daily_cost",
      warning: false,
      message: `Module daily cost cap reached ($${state.moduleDailyCapUsd}).`,
    };
  }

  if (
    hasLimit(state.moduleMaxExecutionsPerDay) &&
    state.moduleExecutionsToday >= state.moduleMaxExecutionsPerDay
  ) {
    return {
      allowed: false,
      reason: "module_daily_executions",
      warning: false,
      message: `Module daily execution cap reached (${state.moduleMaxExecutionsPerDay}).`,
    };
  }

  const warning =
    hasLimit(limits.warningThresholdUsd) && projectedMonth >= limits.warningThresholdUsd;

  return {
    allowed: true,
    warning,
    message: warning
      ? `Warning: monthly spend has crossed $${limits.warningThresholdUsd}.`
      : undefined,
  };
}
