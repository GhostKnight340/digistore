/**
 * Daily Reports — Discord formatting (PURE: no server-only, no network).
 *
 * Renders the intelligence brief: an executive-summary paragraph followed by
 * only the sections that carry insight (what changed → anomalies → likely
 * explanation → recommended actions → keep unchanged → watch list). Sections
 * with no content are OMITTED — a report never pads with empty headers.
 *
 * The prose (including any numbers) comes from the model, which is constrained
 * upstream to quote figures verbatim; the formatter no longer prints a KPI list.
 * When the narrative is entirely empty, a single honest "nothing changed" line
 * is shown instead of a blank embed. Kept pure so the never-empty rule and the
 * per-report section headers stay unit-testable.
 */

import type { DiscordEmbed, DiscordMessagePayload } from "@/lib/discord/client";
import { reportDefinition, type ReportType } from "./reportTypes";
import type { ReportMetrics } from "./metrics";
import type { ReportNarrative } from "./prompt";

const REPORT_COLOR: Record<ReportType, number> = {
  morning: 0xf1c40f,
  evening: 0x9b59b6,
  weekly: 0x3e7bfa,
  monthly: 0x2ecc71,
};

const DESC_MAX = 4000; // Discord embed description hard limit is 4096.

/** The spec's plain statement when a period held no meaningful development. */
const QUIET_LINE =
  "No significant operational changes were detected. Supplier performance, payment handling, and fulfillment remained within their recent normal ranges. No immediate action is recommended.";

/** Per-report section headers (the spec uses different labels per report). */
interface SectionHeaders {
  whatChanged: string;
  anomalies: string;
  recommendedActions: string;
  /** Empty = the report type has no "leave it alone" section (daily briefs). */
  keepUnchanged: string;
  watchList: string;
}

const HEADERS: Record<ReportType, SectionHeaders> = {
  morning: { whatChanged: "What changed", anomalies: "Needs attention", recommendedActions: "Recommended actions", keepUnchanged: "", watchList: "Watch today" },
  evening: { whatChanged: "What changed", anomalies: "Friction & unresolved", recommendedActions: "Recommended for tomorrow", keepUnchanged: "", watchList: "Watch tomorrow" },
  weekly: { whatChanged: "Key developments", anomalies: "Risks", recommendedActions: "Decisions to consider", keepUnchanged: "What not to change", watchList: "Next week's watch list" },
  monthly: { whatChanged: "What the month revealed", anomalies: "Strategic risks", recommendedActions: "Recommended priorities", keepUnchanged: "Keep unchanged", watchList: "Next month's key question" },
};

function bulletSection(lines: string[], header: string, items: string[]): void {
  if (!items.length) return;
  if (lines.length) lines.push("");
  lines.push(`**${header}**`);
  for (const item of items) lines.push(`• ${item}`);
}

function numberedSection(lines: string[], header: string, items: string[]): void {
  if (!items.length) return;
  if (lines.length) lines.push("");
  lines.push(`**${header}**`);
  items.forEach((item, i) => lines.push(`${i + 1}. ${item}`));
}

function paragraphSection(lines: string[], header: string, body: string): void {
  const t = body.trim();
  if (!t) return;
  if (lines.length) lines.push("");
  lines.push(`**${header}**`);
  lines.push(t);
}

/** Builds the briefing description shared by the embed and the text rendering. */
function reportBody(m: ReportMetrics, narrative: ReportNarrative): string {
  const h = HEADERS[m.type];
  const lines: string[] = [];

  const summary = narrative.executiveSummary.trim();
  if (summary) lines.push(summary);

  bulletSection(lines, h.whatChanged, narrative.whatChanged);
  bulletSection(lines, h.anomalies, narrative.anomalies);
  paragraphSection(lines, "Likely explanation", narrative.likelyExplanation);
  numberedSection(lines, h.recommendedActions, narrative.recommendedActions.slice(0, 3));
  if (h.keepUnchanged) paragraphSection(lines, h.keepUnchanged, narrative.keepUnchanged);
  paragraphSection(lines, h.watchList, narrative.watchList);

  // Never blank: if the model surfaced nothing, state that plainly (spec).
  if (!lines.length) lines.push(QUIET_LINE);

  if (m.unavailable.length) lines.push("", `⚠️ Some data was unavailable this run: ${m.unavailable.join(", ")}`);

  const text = lines.join("\n");
  return text.length > DESC_MAX ? `${text.slice(0, DESC_MAX - 1)}…` : text;
}

/** The Discord message payload (single briefing embed) posted to the channel. */
export function buildReportPayload(m: ReportMetrics, narrative: ReportNarrative): DiscordMessagePayload {
  const def = reportDefinition(m.type);
  const embed: DiscordEmbed = {
    title: `${def.emoji} Ghost.ma ${def.title}`,
    description: reportBody(m, narrative) || def.description,
    color: REPORT_COLOR[m.type],
    footer: { text: "Ghost.ma AI Operations" },
  };
  return { embeds: [embed] };
}

/** A plain-markdown rendering for previews and the on-demand reply. */
export function buildReportText(m: ReportMetrics, narrative: ReportNarrative): string {
  const def = reportDefinition(m.type);
  return `${def.emoji} **Ghost.ma ${def.title}**\n\n${reportBody(m, narrative)}`;
}
