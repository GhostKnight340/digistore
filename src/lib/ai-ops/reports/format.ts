/**
 * Daily Reports — Discord formatting (PURE: no server-only, no network).
 *
 * Turns the deterministic figures + the model's narrative into a clean Discord
 * embed (for the channel post) and a markdown string (for previews and the
 * on-demand reply). Numbers come straight from `figures` — the formatter, not
 * the model, prints them, so a figure can never be hallucinated. Missing data
 * is shown as "n/a" rather than omitted or invented.
 *
 * Kept pure so the never-empty-field / never-invent-numbers rules and the embed
 * shape are unit-testable without Discord.
 */

import { formatMAD } from "@/lib/format";
import type { DiscordEmbed, DiscordMessagePayload } from "@/lib/discord/client";
import { reportDefinition, type ReportType } from "./reportTypes";
import type { ReportFigures, ReportMetrics } from "./metrics";
import type { ReportNarrative } from "./prompt";

/** Report accent colors (reuse of the notify.ts palette values). */
const REPORT_COLOR: Record<ReportType, number> = {
  morning: 0xf1c40f, // amber sunrise
  evening: 0x9b59b6, // dusk purple
  weekly: 0x3e7bfa, // blue
  monthly: 0x2ecc71, // green
};

const EMBED_FIELD_MAX = 1024;

function mad(value: number | null): string {
  return value == null ? "n/a" : formatMAD(value);
}
function count(value: number | null): string {
  return value == null ? "n/a" : String(value);
}
/** Discord rejects empty field values; fall back to an em dash. */
function nonEmpty(value: string): string {
  const v = value.trim();
  return (v.length > EMBED_FIELD_MAX ? `${v.slice(0, EMBED_FIELD_MAX - 1)}…` : v) || "—";
}
function bullets(items: string[], empty = "—"): string {
  const list = items.filter((s) => s && s.trim());
  return list.length ? list.map((s) => `• ${s.trim()}`).join("\n") : empty;
}

function paymentsLine(figures: ReportFigures): string {
  if (!figures.paymentMethods.length) return "n/a";
  return figures.paymentMethods
    .slice(0, 5)
    .map((m) => `${m.method}: ${m.count} (${formatMAD(m.totalMad)})`)
    .join("\n");
}
function productsLine(figures: ReportFigures): string {
  if (!figures.topProducts.length) return "No delivered products in this period.";
  return figures.topProducts.map((p, i) => `${i + 1}. ${p.name} — ${p.unitsSold} sold`).join("\n");
}
function ordersLine(figures: ReportFigures): string {
  return `${count(figures.ordersDelivered)} delivered · ${count(figures.ordersTotal)} total`;
}

/** Builds the embed fields shared by every report, in reading order. */
function reportFields(m: ReportMetrics, narrative: ReportNarrative): DiscordEmbed["fields"] {
  const f = m.figures;
  const fields: NonNullable<DiscordEmbed["fields"]> = [
    { name: `💰 Revenue (${m.windowLabel})`, value: nonEmpty(mad(f.revenueMad)), inline: true },
    { name: "📦 Orders", value: nonEmpty(ordersLine(f)), inline: true },
    {
      name: "⏳ Waiting",
      value: nonEmpty(
        `${count(f.ordersWaiting)} order(s)\n${count(f.pendingPaymentConfirmations)} payment(s) to confirm`,
      ),
      inline: true,
    },
    { name: "💳 Payment methods", value: nonEmpty(paymentsLine(f)) },
    { name: "🏆 Top products", value: nonEmpty(productsLine(f)) },
    { name: "🚨 Alerts", value: nonEmpty(bullets(f.operationalAlerts, "No operational incidents.")) },
  ];
  if (narrative.trends?.trim()) {
    fields.push({ name: "📊 Trends", value: nonEmpty(narrative.trends) });
  }
  fields.push({ name: "✅ Recommendations", value: nonEmpty(bullets(narrative.recommendations)) });
  fields.push({ name: "🎯 Top priorities", value: nonEmpty(bullets(narrative.topPriorities)) });
  if (m.unavailable.length) {
    fields.push({
      name: "⚠️ Unavailable data",
      value: nonEmpty(`Some metrics could not be retrieved: ${m.unavailable.join(", ")}.`),
    });
  }
  return fields;
}

/** The Discord message payload (embed) posted to the reports channel. */
export function buildReportPayload(m: ReportMetrics, narrative: ReportNarrative): DiscordMessagePayload {
  const def = reportDefinition(m.type);
  const embed: DiscordEmbed = {
    title: `${def.emoji} Ghost.ma ${def.title}`,
    description: nonEmpty(narrative.summary || def.description),
    color: REPORT_COLOR[m.type],
    fields: reportFields(m, narrative),
    timestamp: undefined, // stamped by the caller's embed() wrapper if used
    footer: { text: "Ghost.ma AI Operations" },
  };
  return { embeds: [embed] };
}

/** A plain-markdown rendering for previews and the on-demand Discord reply. */
export function buildReportText(m: ReportMetrics, narrative: ReportNarrative): string {
  const def = reportDefinition(m.type);
  const f = m.figures;
  const lines: string[] = [
    `${def.emoji} **Ghost.ma ${def.title}**`,
    "",
    narrative.summary?.trim() || def.description,
    "",
    `**Revenue (${m.windowLabel})**: ${mad(f.revenueMad)}`,
    `**Orders**: ${ordersLine(f)}`,
    `**Waiting**: ${count(f.ordersWaiting)} order(s), ${count(f.pendingPaymentConfirmations)} payment(s) to confirm`,
    "",
    "**Payment methods**",
    paymentsLine(f),
    "",
    "**Top products**",
    productsLine(f),
    "",
    "**Alerts**",
    bullets(f.operationalAlerts, "No operational incidents."),
  ];
  if (narrative.trends?.trim()) {
    lines.push("", "**Trends**", narrative.trends.trim());
  }
  lines.push("", "**Recommendations**", bullets(narrative.recommendations));
  lines.push("", "**Top priorities**", bullets(narrative.topPriorities));
  if (m.unavailable.length) {
    lines.push("", `⚠️ Some metrics could not be retrieved: ${m.unavailable.join(", ")}.`);
  }
  return lines.join("\n");
}
