"use client";

/**
 * Composer module metadata: category grouping, per-type icon, and the live
 * one-line summary shown on a collapsed module block card. Pure/presentational —
 * the module data model itself lives in `@/lib/email/composerModules`.
 */

import type { ReactNode } from "react";
import type { EmailModule, EmailModuleType } from "@/lib/email/composerModules";
import { MODULE_LABELS } from "@/lib/email/composerModules";

export { MODULE_LABELS };

export type ModuleCategory = "content" | "actions" | "perks";

export const CATEGORY_LABELS: Record<ModuleCategory, string> = {
  content: "Contenu",
  actions: "Actions",
  perks: "Avantages client",
};

/** Ordered category → module types, drives the Add-module library grid. */
export const MODULE_LIBRARY: Record<ModuleCategory, EmailModuleType[]> = {
  content: ["text", "notice", "divider", "signature"],
  actions: ["button", "product", "order", "payment"],
  perks: ["credit", "coupon"],
};

/** One-line description shown under each label in the Add-module library. */
export const MODULE_DESCRIPTIONS: Record<EmailModuleType, string> = {
  text: "Un paragraphe de texte, avec titre optionnel.",
  notice: "Un encadré coloré (info, succès, attention, erreur).",
  divider: "Une ligne de séparation entre deux sections.",
  signature: "La signature de l'équipe ou d'un administrateur.",
  button: "Un bouton d'action cliquable vers une URL.",
  product: "Une carte produit du catalogue.",
  order: "Un récapitulatif d'une commande du client.",
  payment: "Les instructions de paiement configurées.",
  credit: "Ajouter ou mentionner un crédit Ghost.",
  coupon: "Un code promo existant et valide.",
};

/** Category of a module type (for the collapsed-card icon tint). */
export const MODULE_CATEGORY: Record<EmailModuleType, ModuleCategory> = {
  text: "content",
  notice: "content",
  divider: "content",
  signature: "content",
  button: "actions",
  product: "actions",
  order: "actions",
  payment: "actions",
  credit: "perks",
  coupon: "perks",
};

/** Tint (text/border/bg) per category, matching the admin semantic palette. */
export const CATEGORY_TINT: Record<ModuleCategory, string> = {
  content: "text-sky-300 border-sky-400/20 bg-sky-400/10",
  actions: "text-violet-300 border-violet-400/20 bg-violet-400/10",
  perks: "text-amber-300 border-amber-400/20 bg-amber-400/10",
};

const NOTICE_TONE_LABELS: Record<string, string> = {
  info: "Information",
  success: "Succès",
  warning: "Attention",
  error: "Erreur",
};

function truncate(s: string, n: number): string {
  const t = s.trim().replace(/\s+/g, " ");
  return t.length > n ? `${t.slice(0, n)}…` : t;
}

/** Live one-line summary for a collapsed module block card. */
export function moduleSummary(m: EmailModule): string {
  switch (m.type) {
    case "text":
      return m.body.trim() ? `« ${truncate(m.body, 46)} »` : "Texte vide";
    case "notice":
      return `${NOTICE_TONE_LABELS[m.style] ?? "Information"} : ${truncate(m.heading || m.body || "", 40) || "vide"}`;
    case "divider":
      return "Séparateur visuel";
    case "signature":
      return m.name ? `Signature — ${truncate(m.name, 40)}` : "Signature";
    case "button":
      return `Bouton — « ${truncate(m.label || "", 32)} »`;
    case "product":
      return m.name ? `Produit — « ${truncate(m.name, 32)} »` : "Aucun produit sélectionné";
    case "order":
      return m.orderNumber ? `Commande ${m.orderNumber}` : "Aucune commande sélectionnée";
    case "payment":
      return m.methodName ? `Instructions — ${truncate(m.methodName, 32)}` : "Aucun mode de paiement";
    case "coupon":
      return m.code ? `Code promo — ${m.code}` : "Aucun code défini";
    case "credit":
      return m.behavior === "grant"
        ? `${m.amountMad} DH accordés au client`
        : `Mention uniquement — ${m.amountMad} DH mentionnés`;
  }
}

/** Inline lucide-style stroke icon per module type (16px, currentColor). */
export function ModuleIcon({ type }: { type: EmailModuleType }): ReactNode {
  const paths: Record<EmailModuleType, ReactNode> = {
    text: <path d="M4 6h16M4 12h16M4 18h10" />,
    notice: (
      <>
        <path d="M12 9v4M12 17h.01" />
        <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
      </>
    ),
    divider: <path d="M3 12h18" />,
    signature: (
      <>
        <path d="M3 17c3-6 5-6 7 0s4 4 5 0" />
        <path d="M18 17h3" />
      </>
    ),
    button: (
      <>
        <rect x="3" y="8" width="18" height="8" rx="4" />
        <path d="M8 12h8" />
      </>
    ),
    product: (
      <>
        <path d="M3 9l1-4h16l1 4" />
        <path d="M4 9v10a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1V9" />
        <path d="M9 13h6" />
      </>
    ),
    order: (
      <>
        <rect x="4" y="3" width="16" height="18" rx="2" />
        <path d="M8 8h8M8 12h8M8 16h5" />
      </>
    ),
    payment: (
      <>
        <rect x="2" y="5" width="20" height="14" rx="2" />
        <path d="M2 10h20" />
      </>
    ),
    credit: (
      <>
        <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
      </>
    ),
    coupon: (
      <>
        <path d="M4 7h16v3a2 2 0 0 0 0 4v3H4v-3a2 2 0 0 0 0-4z" />
        <path d="M13 7v10" strokeDasharray="2 2" />
      </>
    ),
  };
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {paths[type]}
    </svg>
  );
}
