/**
 * Supplier Intelligence — Discord formatting (PURE: no server-only, no network).
 *
 * Renders one "easy-to-read list": a single embed whose description is grouped,
 * bulleted sections (status → costs → fulfillment → alerts → actions). Numbers
 * come straight from `figures` — the formatter, not the model, prints them, so a
 * figure can never be hallucinated; missing data shows as "n/a". The AI's
 * recommendations + priorities are merged into a short "Actions" list.
 */

import type { DiscordEmbed, DiscordMessagePayload } from "@/lib/discord/client";
import type { AiNarrative } from "../narrative";
import type { SupplierFigures, SupplierMetrics } from "./metrics";

const SUPPLIER_COLOR = 0x1abc9c; // teal — healthy
const SUPPLIER_ALERT_COLOR = 0xe74c3c; // red — something needs attention
const DESC_MAX = 4000;
const STATUS_EMOJI: Record<string, string> = { healthy: "🟢", degraded: "🟡", down: "🔴" };

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

function statusLines(f: SupplierFigures): string[] {
  if (!f.suppliers.length) return ["• No suppliers configured"];
  return f.suppliers.map((s) => {
    const emoji = STATUS_EMOJI[s.status] ?? "⚪";
    const extra: string[] = [];
    if (s.subscriptionActive === false) extra.push("subscription inactive");
    if (s.lastLatencyMs != null) extra.push(`${s.lastLatencyMs}ms`);
    extra.push(`last ok ${shortDate(s.lastSuccessAt)}`);
    return `${emoji} **${s.id}** — ${s.status} · ${extra.join(" · ")}`;
  });
}

/** Builds the grouped, bulleted description shared by the embed and the text. */
function supplierBodyText(m: SupplierMetrics, narrative: AiNarrative): string {
  const f = m.figures;
  const lines: string[] = [];

  section(lines, "Status", statusLines(f));

  section(
    lines,
    "Costs (delivered)",
    f.costs.length
      ? f.costs.map((c) => `• ${c.supplier}: ${c.deliveredCount} · avg ${money(c.avgCost)} · total ${money(c.totalCost)}`)
      : ["• None this period"],
  );

  const total = f.fulfillment.total == null ? "n/a" : String(f.fulfillment.total);
  const failed = f.fulfillment.failed == null ? "n/a" : String(f.fulfillment.failed);
  section(lines, `Fulfillment (${m.windowLabel})`, [`• ${total} total · ${failed} failed`]);

  section(lines, "Alerts", f.alerts.length ? f.alerts.map((a) => `• ${a}`) : ["• None"]);

  const actions = actionList(narrative);
  section(lines, "Actions", actions.length ? actions.map((a) => `• ${a}`) : ["• Nothing needed — keep monitoring"]);

  if (m.unavailable.length) lines.push("", `⚠️ Unavailable: ${m.unavailable.join(", ")}`);

  const text = lines.join("\n");
  return text.length > DESC_MAX ? `${text.slice(0, DESC_MAX - 1)}…` : text;
}

/** The Discord message payload (single list embed) posted to the supplier channel. */
export function buildSupplierPayload(m: SupplierMetrics, narrative: AiNarrative): DiscordMessagePayload {
  const embed: DiscordEmbed = {
    title: "🔌 Ghost.ma Supplier Intelligence",
    description: supplierBodyText(m, narrative),
    color: m.figures.alerts.length ? SUPPLIER_ALERT_COLOR : SUPPLIER_COLOR,
    footer: { text: "Ghost.ma AI Operations" },
  };
  return { embeds: [embed] };
}

/** A plain-markdown rendering for previews and on-demand replies. */
export function buildSupplierText(m: SupplierMetrics, narrative: AiNarrative): string {
  return `🔌 **Ghost.ma Supplier Intelligence**\n\n${supplierBodyText(m, narrative)}`;
}
