/**
 * Manual report commands — the PURE parser (no discord.js, no DB, no provider).
 *
 * An admin can generate any report on demand from Discord:
 *   "@Ghost CEO morning report"  → morning brief
 *   "@Ghost CEO daily report"    → end-of-day report
 *   "@Ghost CEO weekly report"   → weekly report
 *   "@Ghost CEO monthly report"  → monthly report
 *
 * The routing layer (assistantRouting.ts) already stripped the mention and the
 * "CEO" department keyword, so this receives just the question text. Returns the
 * matched report type, or null when the text is an ordinary question (which then
 * falls through to the CEO assistant).
 */

import { type ReportType } from "./reportTypes";

/** Keyword → report type. "daily" maps to the End of Day (evening) report. */
const COMMAND_ALIASES: { pattern: RegExp; type: ReportType }[] = [
  { pattern: /\bmorning\b/, type: "morning" },
  { pattern: /\b(end[\s-]?of[\s-]?day|evening|eod|daily)\b/, type: "evening" },
  { pattern: /\bweekly\b/, type: "weekly" },
  { pattern: /\bmonthly\b/, type: "monthly" },
];

/**
 * Parse a CEO-assistant question into a report command, or null. Requires the
 * word "report" (or "brief") to be present so a genuine question that merely
 * contains "weekly" ("how were sales weekly vs monthly?") is NOT hijacked.
 */
export function parseReportCommand(question: string): ReportType | null {
  const text = (question ?? "").toLowerCase().trim();
  if (!text) return null;
  if (!/\b(report|brief|briefing)\b/.test(text)) return null;
  for (const { pattern, type } of COMMAND_ALIASES) {
    if (pattern.test(text)) return type;
  }
  return null;
}
