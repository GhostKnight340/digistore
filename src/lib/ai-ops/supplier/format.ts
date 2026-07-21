/**
 * Supplier Intelligence — Discord formatting (PURE: no server-only, no network).
 *
 * Turns the deterministic figures + the model's narrative into a clean Discord
 * embed and a markdown string. Numbers come straight from `figures` — the
 * formatter, not the model, prints them, so a figure can never be hallucinated.
 * Missing data shows as "n/a". Kept pure so the never-empty-field / never-invent
 * rules and the embed shape are unit-testable without Discord.
 */

import type { DiscordEmbed, DiscordMessagePayload } from "@/lib/discord/client";
import type { AiNarrative } from "../narrative";
import type { SupplierFigures, SupplierMetrics } from "./metrics";

const SUPPLIER_COLOR = 0x1abc9c; // teal
const EMBED_FIELD_MAX = 1024;
const STATUS_EMOJI: Record<string, string> = { healthy: "🟢", degraded: "🟡", down: "🔴" };

function nonEmpty(value: string): string {
  const v = value.trim();
  return (v.length > EMBED_FIELD_MAX ? `${v.slice(0, EMBED_FIELD_MAX - 1)}…` : v) || "—";
}
function bullets(items: string[], empty = "—"): string {
  const list = items.filter((s) => s && s.trim());
  return list.length ? list.map((s) => `• ${s.trim()}`).join("\n") : empty;
}
function money(value: number | null): string {
  return value == null ? "n/a" : value.toFixed(2);
}
function shortDate(iso: string | null): string {
  if (!iso) return "never";
  try {
    return new Date(iso).toLocaleString("en-GB", { dateStyle: "short", timeStyle: "short" });
  } catch {
    return iso;
  }
}

function healthLines(f: SupplierFigures): string {
  if (!f.suppliers.length) return "No suppliers configured.";
  return f.suppliers
    .map((s) => {
      const emoji = STATUS_EMOJI[s.status] ?? "⚪";
      const parts = [`${emoji} **${s.id}** — ${s.status}`];
      if (s.subscriptionActive === false) parts.push("subscription inactive");
      if (s.lastLatencyMs != null) parts.push(`${s.lastLatencyMs}ms`);
      parts.push(`last ok ${shortDate(s.lastSuccessAt)}`);
      return parts.join(" · ");
    })
    .join("\n");
}

function costLines(f: SupplierFigures): string {
  if (!f.costs.length) return "No delivered-order costs in this period.";
  return f.costs
    .map((c) => `${c.supplier}: ${c.deliveredCount} delivered · avg ${money(c.avgCost)} · total ${money(c.totalCost)}`)
    .join("\n");
}

function fulfillmentLine(f: SupplierFigures): string {
  const total = f.fulfillment.total == null ? "n/a" : String(f.fulfillment.total);
  const failed = f.fulfillment.failed == null ? "n/a" : String(f.fulfillment.failed);
  const byStatus = f.fulfillment.byStatus.map((s) => `${s.status}: ${s.count}`).join(", ");
  return `${total} total · ${failed} failed${byStatus ? `\n${byStatus}` : ""}`;
}

function fields(m: SupplierMetrics, narrative: AiNarrative): NonNullable<DiscordEmbed["fields"]> {
  const f = m.figures;
  const out: NonNullable<DiscordEmbed["fields"]> = [
    { name: "🩺 API health", value: nonEmpty(healthLines(f)) },
    { name: `💸 Delivered costs`, value: nonEmpty(costLines(f)) },
    { name: `📦 Fulfillment (${m.windowLabel})`, value: nonEmpty(fulfillmentLine(f)) },
    { name: "🚨 Alerts", value: nonEmpty(bullets(f.alerts, "No supplier incidents.")) },
  ];
  if (narrative.trends?.trim()) out.push({ name: "📊 Trends", value: nonEmpty(narrative.trends) });
  out.push({ name: "✅ Recommendations", value: nonEmpty(bullets(narrative.recommendations)) });
  out.push({ name: "🎯 Top priorities", value: nonEmpty(bullets(narrative.topPriorities)) });
  if (m.unavailable.length) {
    out.push({
      name: "⚠️ Unavailable data",
      value: nonEmpty(`Some metrics could not be retrieved: ${m.unavailable.join(", ")}.`),
    });
  }
  return out;
}

/** The Discord message payload (embed) posted to the supplier channel. */
export function buildSupplierPayload(m: SupplierMetrics, narrative: AiNarrative): DiscordMessagePayload {
  const embed: DiscordEmbed = {
    title: "🔌 Ghost.ma Supplier Intelligence",
    description: nonEmpty(narrative.summary || "Supplier health and cost check."),
    color: SUPPLIER_COLOR,
    fields: fields(m, narrative),
    footer: { text: "Ghost.ma AI Operations" },
  };
  return { embeds: [embed] };
}

/** A plain-markdown rendering for previews and on-demand replies. */
export function buildSupplierText(m: SupplierMetrics, narrative: AiNarrative): string {
  const f = m.figures;
  const lines: string[] = [
    "🔌 **Ghost.ma Supplier Intelligence**",
    "",
    narrative.summary?.trim() || "Supplier health and cost check.",
    "",
    "**API health**",
    healthLines(f),
    "",
    "**Delivered costs**",
    costLines(f),
    "",
    `**Fulfillment (${m.windowLabel})**`,
    fulfillmentLine(f),
    "",
    "**Alerts**",
    bullets(f.alerts, "No supplier incidents."),
  ];
  if (narrative.trends?.trim()) lines.push("", "**Trends**", narrative.trends.trim());
  lines.push("", "**Recommendations**", bullets(narrative.recommendations));
  lines.push("", "**Top priorities**", bullets(narrative.topPriorities));
  if (m.unavailable.length) {
    lines.push("", `⚠️ Some metrics could not be retrieved: ${m.unavailable.join(", ")}.`);
  }
  return lines.join("\n");
}
