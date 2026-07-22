/**
 * Business Intelligence — Discord formatting (PURE: no server-only, no network).
 *
 * A single financial-brief embed: an executive line, then grouped sections —
 * profitability (revenue / gross profit / margin + week-over-week trend),
 * category margins, concentration risk, payment mix, and a short actions list.
 * Every NUMBER comes straight from `figures`; the formatter prints them, so a
 * figure can never be hallucinated. The margin caveat (cost coverage) is always
 * shown when coverage is partial, so the reader is never misled.
 */

import { formatMAD } from "@/lib/format";
import type { DiscordEmbed, DiscordMessagePayload } from "@/lib/discord/client";
import type { AiNarrative } from "../narrative";
import type { BiFigures, BiMetrics, CategoryMargin } from "./metrics";

const BI_COLOR = 0x8e44ad; // purple — strategic/financial
const BI_WARN_COLOR = 0xe67e22; // orange — margin eroding / high concentration
const DESC_MAX = 4000;

function mad(v: number | null): string {
  return v == null ? "n/a" : formatMAD(v);
}
function marginStr(pct: number | null): string {
  return pct == null ? "n/a" : `${pct}%`;
}
function delta(s: string | null): string {
  return s ? ` (${s})` : "";
}

function section(lines: string[], header: string, body: string[]): void {
  if (lines.length) lines.push("");
  lines.push(`**${header}**`);
  for (const b of body) lines.push(b);
}

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

function categoryLine(c: CategoryMargin): string {
  return `• ${c.category}: ${mad(c.revenueMad)} · marge ${marginStr(c.marginPct)}`;
}

/** True when the brief should carry the "attention" colour. */
function eroding(f: BiFigures): boolean {
  const marginDown = f.marginDeltaPp != null && f.marginDeltaPp.startsWith("-");
  const concentrated = f.topCategorySharePct != null && f.topCategorySharePct >= 70;
  return marginDown || concentrated;
}

/** Builds the grouped description shared by the embed and the text rendering. */
function biBodyText(m: BiMetrics, narrative: AiNarrative): string {
  const f = m.figures;
  const lines: string[] = [];

  const summary = narrative.summary.trim();
  if (summary) lines.push(summary);

  section(lines, `Rentabilité (${m.windowLabel})`, [
    `• Revenu: ${mad(f.revenueMad)}${delta(f.revenueDeltaPct)}`,
    `• Marge brute: ${mad(f.grossProfitMad)} · ${marginStr(f.marginPct)}${delta(f.marginDeltaPp)}`,
    f.costCoveragePct != null && f.costCoveragePct < 100
      ? `• ⚠️ Marge estimée sur ${f.costCoveragePct}% du revenu (coût connu)`
      : "• Coût fournisseur connu sur l'ensemble du revenu",
  ]);

  section(
    lines,
    "Marge par catégorie",
    f.topCategories.length ? f.topCategories.map(categoryLine) : ["• Aucune vente livrée cette période"],
  );

  if (f.lowMarginCategories.length) {
    section(lines, "Marges les plus faibles", f.lowMarginCategories.map(categoryLine));
  }

  if (f.topCategorySharePct != null) {
    const risk = f.topCategorySharePct >= 70 ? " ⚠️ concentration élevée" : "";
    section(lines, "Concentration", [`• Catégorie n°1 = ${f.topCategorySharePct}% du revenu${risk}`]);
  }

  if (f.paymentMethods.length) {
    section(
      lines,
      "Moyens de paiement",
      f.paymentMethods.map((p) => `• ${p.method}: ${p.count} (${formatMAD(p.totalMad)})`),
    );
  }

  const analysis = narrative.trends.trim();
  if (analysis) section(lines, "Analyse", [analysis]);

  const actions = actionList(narrative);
  section(lines, "Décisions", actions.length ? actions.map((a) => `• ${a}`) : ["• Rien d'urgent — continuer le suivi"]);

  if (m.unavailable.length) lines.push("", `⚠️ Indisponible: ${m.unavailable.join(", ")}`);

  const text = lines.join("\n");
  return text.length > DESC_MAX ? `${text.slice(0, DESC_MAX - 1)}…` : text;
}

/** The Discord message payload (single financial-brief embed). */
export function buildBiPayload(m: BiMetrics, narrative: AiNarrative): DiscordMessagePayload {
  const embed: DiscordEmbed = {
    title: "📊 Ghost.ma Business Intelligence",
    description: biBodyText(m, narrative),
    color: eroding(m.figures) ? BI_WARN_COLOR : BI_COLOR,
    footer: { text: "Ghost.ma AI Operations" },
  };
  return { embeds: [embed] };
}

/** A plain-markdown rendering for previews and on-demand replies. */
export function buildBiText(m: BiMetrics, narrative: AiNarrative): string {
  return `📊 **Ghost.ma Business Intelligence**\n\n${biBodyText(m, narrative)}`;
}
