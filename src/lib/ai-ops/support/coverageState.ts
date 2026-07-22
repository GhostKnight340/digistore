/**
 * Coverage session states + the auto-send authorization gate — PURE (no DB).
 *
 * This is the security spine of AI Support Coverage. Manual activation is the
 * TOP-LEVEL authorization boundary: an auto-send is permitted ONLY when a live
 * session authorizes this exact action, and `canAutoSend` encodes the seven
 * conditions the spec requires. It is pure so it can be unit-tested exhaustively
 * and re-run server-side immediately before every outgoing message.
 *
 * INACTIVE is not a stored state — it is the ABSENCE of a live session row.
 */

export const COVERAGE_STATES = [
  "SCHEDULED",
  "ACTIVE_DRAFT_ONLY",
  "ACTIVE_AUTO_REPLY",
  "PAUSED",
  "ENDING",
  "EXPIRED",
  "ERROR",
  "DEACTIVATED",
] as const;

export type CoverageState = (typeof COVERAGE_STATES)[number];

/** The conceptual state shown when there is no live session at all. */
export type EffectiveState = CoverageState | "INACTIVE";

/** Terminal states: a session here is over and can never act again. */
const TERMINAL: ReadonlySet<CoverageState> = new Set(["EXPIRED", "ERROR", "DEACTIVATED"]);

/** States in which the assistant may draft (and, for AUTO_REPLY, send). */
const LIVE_ACTIVE: ReadonlySet<CoverageState> = new Set(["ACTIVE_DRAFT_ONLY", "ACTIVE_AUTO_REPLY"]);

export function isTerminalCoverage(state: CoverageState): boolean {
  return TERMINAL.has(state);
}

/** A session row's fields the state logic needs (subset of the Prisma model). */
export interface CoverageSessionCore {
  state: CoverageState;
  automationMode: string;
  draftOnly: boolean;
  allowAutoReply: boolean;
  confidenceThreshold: string;
  channels: string[];
  categories: string[];
  scheduledStartAt: Date | null;
  scheduledEndAt: Date | null;
}

/**
 * The REAL state of a session at `now`, accounting for its schedule — so the
 * gate is correct even before the expiry cron runs (lazy expiry). Terminal and
 * PAUSED states are respected as-is; otherwise the schedule decides
 * SCHEDULED / EXPIRED / the active mode.
 */
export function effectiveState(session: CoverageSessionCore, now: Date): CoverageState {
  if (TERMINAL.has(session.state)) return session.state;
  if (session.state === "PAUSED") return "PAUSED";
  if (session.scheduledEndAt && now.getTime() >= session.scheduledEndAt.getTime()) return "EXPIRED";
  if (session.scheduledStartAt && now.getTime() < session.scheduledStartAt.getTime()) return "SCHEDULED";
  return session.automationMode === "auto_reply" ? "ACTIVE_AUTO_REPLY" : "ACTIVE_DRAFT_ONLY";
}

/** May the assistant DRAFT for a ticket under this state? (Both active modes.) */
export function isDraftingLive(state: CoverageState): boolean {
  return LIVE_ACTIVE.has(state);
}

const CONFIDENCE_RANK: Record<string, number> = { low: 0, medium: 1, high: 2 };

/** Does `confidence` meet or exceed the configured `threshold`? */
export function confidenceMeets(threshold: string, confidence: string): boolean {
  const t = CONFIDENCE_RANK[threshold] ?? 2;
  const c = CONFIDENCE_RANK[confidence] ?? -1;
  return c >= t;
}

/**
 * Issue types / categories that must ALWAYS be escalated and never auto-sent,
 * regardless of confidence: refunds, payment confirmation, code replacement,
 * account/security. Matches the vision's authority limits.
 */
const SENSITIVE_ISSUE_TYPES: ReadonlySet<string> = new Set([
  "refund_request",
  "refund",
  "payment_proof",
  "payment_confirmation",
  "invalid_code",
  "already_redeemed",
  "code_replacement",
  "account",
  "account_security",
  "login",
  "fraud",
  "chargeback",
  "legal",
]);

const SENSITIVE_CATEGORIES: ReadonlySet<string> = new Set(["remboursement", "compte"]);

export function isSensitiveIssue(issueType: string, category: string): boolean {
  return SENSITIVE_ISSUE_TYPES.has(issueType.toLowerCase()) || SENSITIVE_CATEGORIES.has(category.toLowerCase());
}

/** Context for one auto-send decision. */
export interface AutoSendContext {
  channel: string;
  category: string;
  confidence: string;
  sensitive: boolean;
}

export interface GateResult {
  allowed: boolean;
  reason: string;
}

/**
 * The seven-condition auto-send gate. `effState` MUST be the freshly computed
 * effectiveState (never the stale stored state). Returns a machine-readable
 * reason on denial so the caller can log WHY a reply was held back.
 */
export function canAutoSend(
  session: CoverageSessionCore,
  effState: CoverageState,
  ctx: AutoSendContext,
): GateResult {
  // 1 + 7: a live AUTO_REPLY session (this excludes SCHEDULED, PAUSED, ENDING,
  // EXPIRED, ERROR, DEACTIVATED, and DRAFT_ONLY).
  if (effState !== "ACTIVE_AUTO_REPLY") return { allowed: false, reason: `state_${effState}` };
  // 4: automation level must permit sending (belt-and-suspenders with the state).
  if (!session.allowAutoReply || session.draftOnly || session.automationMode !== "auto_reply") {
    return { allowed: false, reason: "automation_draft_only" };
  }
  // 2: channel covered (empty channel list never authorizes sending).
  if (!session.channels.includes(ctx.channel)) return { allowed: false, reason: "channel_not_covered" };
  // 3: category covered (empty list = all categories covered).
  if (session.categories.length > 0 && !session.categories.includes(ctx.category)) {
    return { allowed: false, reason: "category_not_covered" };
  }
  // 5: confidence threshold met.
  if (!confidenceMeets(session.confidenceThreshold, ctx.confidence)) {
    return { allowed: false, reason: "below_confidence_threshold" };
  }
  // 6: no sensitive-action rule blocks it.
  if (ctx.sensitive) return { allowed: false, reason: "sensitive_case" };
  return { allowed: true, reason: "authorized" };
}

/**
 * May the assistant draft for a ticket on this channel/category? (Drafting is
 * allowed in both live active modes; sending is gated separately by canAutoSend.)
 */
export function coverageCoversTicket(
  session: CoverageSessionCore,
  effState: CoverageState,
  channel: string,
  category: string,
): boolean {
  if (!isDraftingLive(effState)) return false;
  if (session.channels.length > 0 && !session.channels.includes(channel)) return false;
  if (session.categories.length > 0 && !session.categories.includes(category)) return false;
  return true;
}
