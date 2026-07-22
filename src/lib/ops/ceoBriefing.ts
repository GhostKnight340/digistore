/**
 * CEO Briefing resolver (Ghost Mission Control) — PURE.
 *
 * Turns an operations snapshot into one always-on daily briefing: the single
 * most important situation right now, plus what to do about it. The panel shows
 * exactly one state — never a stacked list of alerts — resolved by a
 * priority-ordered rule (first true condition wins):
 *
 *   1. system/supplier failure → `critical`
 *   2. anything pending (payment reviews, supplier warnings, other alerts) → `ok`
 *   3. everything healthy, nothing pending → `quiet`
 *
 * `launch` and `opportunity` are part of the design's five states but need
 * backend signals that do not exist yet — a launch-checklist model and a
 * nightly opportunity-detection job. They are intentionally not emitted here;
 * wire them in once those signals land (the component already renders them).
 *
 * Every figure is real: it is derived from the {@link OperationsSnapshotDTO}
 * the Operations dashboard already holds — no fabricated estimates (`estimate`
 * stays null, we have no honest time-to-resolve signal). This module is kept
 * free of server-only imports so the client Operations dashboard can compute
 * the briefing from its live snapshot without a second round-trip.
 */

import type { CeoBriefingActionDTO, CeoBriefingDTO, OperationsSnapshotDTO } from "@/lib/dto";

const PRIORITY_LABEL = {
  ok: "Priorité faible",
  critical: "Priorité urgente",
  launch: "Priorité moyenne",
  opportunity: "Opportunité",
  quiet: "Priorité faible",
} as const;

/** French pluralization helper for the small counts we render. */
function plural(n: number, singular: string, plural = `${singular}s`): string {
  return `${n} ${n === 1 ? singular : plural}`;
}

/**
 * Pure snapshot → briefing mapping. Split out from the async fetch so it can be
 * reasoned about (and unit-tested) without a database.
 */
export function briefingFromSnapshot(snap: OperationsSnapshotDTO): CeoBriefingDTO {
  const criticalWarnings = snap.warnings.filter((w) => w.severity === "critical");
  const otherWarnings = snap.warnings.filter((w) => w.severity !== "critical");
  const liveSuppliers = snap.suppliers.filter((s) => s.enabled && s.configured);
  const offlineSuppliers = liveSuppliers.filter((s) => s.health === "offline");
  const degradedSuppliers = liveSuppliers.filter((s) => s.health === "warning");
  const awaiting = snap.payments.awaitingReview;

  // 1 · CRITICAL — a failure is blocking automatic delivery right now.
  if (criticalWarnings.length > 0 || offlineSuppliers.length > 0 || snap.overallStatus === "offline") {
    const top = criticalWarnings[0];
    const facts: string[] = [];
    if (offlineSuppliers.length > 0) {
      facts.push(`${plural(offlineSuppliers.length, "fournisseur")} hors service (${offlineSuppliers.map((s) => s.name).join(", ")})`);
    }
    if (awaiting > 0) facts.push(`${plural(awaiting, "paiement")} à vérifier`);
    facts.push("Livraison manuelle recommandée en attendant");

    const actions: CeoBriefingActionDTO[] = [];
    if (top?.resolveHref) actions.push({ label: "Résoudre l'incident", href: top.resolveHref, primary: false });
    actions.push({ label: "Ouvrir les fournisseurs", href: "/admin/suppliers", primary: true });

    const affected = criticalWarnings.length + offlineSuppliers.length;
    return {
      state: "critical",
      title: top?.title ?? "Panne fournisseur détectée",
      message: top?.description ?? "Une panne fournisseur bloque des livraisons automatiques.",
      bulletLine: facts.join(" · "),
      estimate: null,
      affected: String(affected || 1),
      priorityLabel: PRIORITY_LABEL.critical,
      actions: actions.slice(0, 2),
    };
  }

  // 2 · OK — healthy overall, but at least one thing wants attention today.
  if (awaiting > 0 || degradedSuppliers.length > 0 || otherWarnings.length > 0) {
    const topWarning = otherWarnings[0];
    const message =
      awaiting > 0
        ? `Le plus important aujourd'hui : ${plural(awaiting, "paiement")} à vérifier. Le reste du système tourne sans intervention.`
        : topWarning
          ? `Le plus important aujourd'hui : ${topWarning.title.toLowerCase()}. Le reste du système tourne sans intervention.`
          : "Aucune action urgente. Le système tourne sans intervention.";

    const facts = [
      `${plural(awaiting, "paiement")} à vérifier`,
      degradedSuppliers.length > 0 ? `${plural(degradedSuppliers.length, "fournisseur")} dégradé${degradedSuppliers.length !== 1 ? "s" : ""}` : "Aucun incident fournisseur",
    ];
    if (otherWarnings.length > 0) facts.push(plural(otherWarnings.length, "avertissement"));

    const actions: CeoBriefingActionDTO[] = [];
    if (topWarning?.resolveHref) actions.push({ label: "Voir le détail", href: topWarning.resolveHref, primary: false });
    else actions.push({ label: "Ouvrir les fournisseurs", href: "/admin/suppliers", primary: false });
    actions.push({ label: "Revue paiements", href: "/admin?tab=payments", primary: true });

    return {
      state: "ok",
      title: "Tout fonctionne normalement",
      message,
      bulletLine: facts.join(" · "),
      estimate: null,
      affected: awaiting > 0 ? String(awaiting) : null,
      priorityLabel: PRIORITY_LABEL.ok,
      actions: actions.slice(0, 2),
    };
  }

  // 3 · QUIET — everything healthy, nothing pending.
  return {
    state: "quiet",
    title: "Journée calme — rien d'urgent",
    message: "Tout est sain. Aucune action requise pour le moment.",
    bulletLine: "Aucun paiement en attente · Aucun incident fournisseur · Systèmes opérationnels",
    estimate: null,
    affected: null,
    priorityLabel: PRIORITY_LABEL.quiet,
    actions: [
      { label: "Voir les produits", href: "/admin?tab=products", primary: false },
      { label: "Vue d'ensemble", href: "/admin", primary: true },
    ],
  };
}
