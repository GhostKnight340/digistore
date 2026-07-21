/**
 * Daily Reports — Discord formatting (PURE: no server-only, no network).
 *
 * Renders one "easy-to-read list": a single embed whose description is grouped,
 * bulleted sections (window metrics → payments → products → alerts → actions).
 * Numbers come straight from `figures` — the formatter, not the model, prints
 * them, so a figure can never be hallucinated; missing data shows as "n/a". The
 * AI's recommendations + priorities are merged into a short "Actions" list.
 *
 * Kept pure so the never-empty / never-invent rules are unit-testable.
 */

import { formatMAD } from "@/lib/format";
import type { DiscordEmbed, DiscordMessagePayload } from "@/lib/discord/client";
import { reportDefinition, type ReportType } from "./reportTypes";
import type { ReportFigures, ReportMetrics } from "./metrics";
import type { AiNarrative } from "../narrative";

const REPORT_COLOR: Record<ReportType, number> = {
  morning: 0xf1c40f,
  evening: 0x9b59b6,
  weekly: 0x3e7bfa,
  monthly: 0x2ecc71,
};

const DESC_MAX = 4000; // Discord embed description hard limit is 4096.

function mad(value: number | null): string {
  return value == null ? "n/a" : formatMAD(value);
}
function count(value: number | null): string {
  return value == null ? "n/a" : String(value);
}
function cap(label: string): string {
  return label ? label.charAt(0).toUpperCase() + label.slice(1) : label;
}

/** Merge recommendations + priorities into a short, de-duplicated action list. */
function actionList(narrative: AiNarrative): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of [...narrative.topPriorities, ...narrative.recommendations]) {
    const t = item.trim();
    const key = t.toLowerCase();
    if (t && !seen.has(key)) {
      seen.add(key);
      out.push(t);
    }
    if (out.length >= 3) break;
  }
  return out;
}

function section(lines: string[], header: string, body: string[]): void {
  if (lines.length) lines.push("");
  lines.push(`**${header}**`);
  for (const b of body) lines.push(b);
}

/** Builds the grouped, bulleted description shared by the embed and the text. */
function reportBody(m: ReportMetrics, narrative: AiNarrative): string {
  const f: ReportFigures = m.figures;
  const lines: string[] = [];

  section(lines, cap(m.windowLabel), [
    `• Revenue: ${mad(f.revenueMad)}`,
    `• Orders: ${count(f.ordersDelivered)} delivered · ${count(f.ordersTotal)} total`,
    `• Waiting: ${count(f.ordersWaiting)} order(s) · ${count(f.pendingPaymentConfirmations)} to confirm`,
  ]);

  section(
    lines,
    "Payment methods",
    f.paymentMethods.length
      ? f.paymentMethods.slice(0, 5).map((p) => `• ${p.method}: ${p.count} (${formatMAD(p.totalMad)})`)
      : ["• n/a"],
  );

  section(
    lines,
    "Top products",
    f.topProducts.length
      ? f.topProducts.map((p, i) => `• ${i + 1}. ${p.name} — ${p.unitsSold} sold`)
      : ["• No delivered products this period"],
  );

  section(lines, "Alerts", f.operationalAlerts.length ? f.operationalAlerts.map((a) => `• ${a}`) : ["• None"]);

  const actions = actionList(narrative);
  section(lines, "Actions", actions.length ? actions.map((a) => `• ${a}`) : ["• Nothing urgent — keep monitoring"]);

  if (m.unavailable.length) lines.push("", `⚠️ Unavailable: ${m.unavailable.join(", ")}`);

  const text = lines.join("\n");
  return text.length > DESC_MAX ? `${text.slice(0, DESC_MAX - 1)}…` : text;
}

/** The Discord message payload (single list embed) posted to the reports channel. */
export function buildReportPayload(m: ReportMetrics, narrative: AiNarrative): DiscordMessagePayload {
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
export function buildReportText(m: ReportMetrics, narrative: AiNarrative): string {
  const def = reportDefinition(m.type);
  return `${def.emoji} **Ghost.ma ${def.title}**\n\n${reportBody(m, narrative)}`;
}
