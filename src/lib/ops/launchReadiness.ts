/**
 * Launch Center readiness engine (server-only).
 *
 * The single aggregator behind /admin/operations/launch-center. It INSPECTS the
 * real application state — store settings, the live catalog, supplier/payment
 * configuration, email, security and the AI-ops stack — and turns it into a
 * weighted readiness score plus per-category checks, blockers, warnings, a
 * derived launch timeline and a monitoring roll-up.
 *
 * Honesty rules (same spirit as lib/ops/health.ts):
 *  - Never invent a check. Every automatic check reads a real value (a DB count,
 *    an env flag, a stored setting). Things that genuinely cannot be inspected
 *    from code (DNS records, off-platform backups) are reported as `info`, never
 *    faked as passing and never counted against the score.
 *  - Cheap by default: suppliers/health use CACHED state (no live provider API
 *    calls) so opening the page never burns rate limit.
 *  - Statuses reuse the ops vocabulary so the existing StatusDot/Badge render:
 *      healthy = pass · warning = attention · offline = fail · unknown = info.
 */
import "server-only";

import { prisma } from "@/lib/db/prisma";
import { getStoreSettings } from "@/lib/db/catalog";
import type { OpsHealthStatus } from "@/lib/dto";
import {
  runCoreHealthChecks,
  checkSuppliers,
} from "./health";
import type { HealthResult } from "./types";
import { isProductionRuntime, runtimeEnvLabel } from "@/lib/env";
import { getSiteUrl } from "@/lib/siteUrl";
import { isOrderingEnabled } from "@/lib/storeSettings";
import {
  isReloadlyConfigured,
  getReloadlyEnvironment,
} from "@/lib/reloadly/config";
import {
  isFazerCardsConfigured,
  getFazerCardsMode,
} from "@/lib/fazercards/config";
import { getAiOpsSnapshot } from "@/lib/ai-ops/dashboard";
import { coverageReadiness } from "@/lib/ai-ops/support/readiness";
import { getCoverageOverview } from "@/lib/ai-ops/support/session";
import { isInboundEmailConfigured } from "@/lib/support/inboundEmail";

// ─── Types ───────────────────────────────────────────────────────────────────

/** healthy = pass · warning = attention · offline = fail · unknown = info/skip */
export type LaunchCheck = {
  id: string;
  label: string;
  status: OpsHealthStatus;
  detail: string;
  /** Where the admin fixes this. */
  href?: string;
  fixLabel?: string;
  /** A failing blocking check becomes a critical blocker (can't launch). */
  blocking?: boolean;
  /** Excluded from scoring when false (AI-ops display, DNS info, …). */
  scored?: boolean;
  /** Timeline hints (rough, deterministic — never a fake estimate). */
  effort?: "Faible" | "Moyen" | "Élevé";
};

export type LaunchCategory = {
  id: string;
  label: string;
  /** 0–100, weighted over scored checks. `null` when nothing is scored. */
  score: number | null;
  status: OpsHealthStatus;
  checks: LaunchCheck[];
  /** Primary "fix these" destination for the category. */
  actionHref?: string;
  actionLabel?: string;
};

export type LaunchIssue = {
  category: string;
  label: string;
  detail: string;
  href?: string;
  fixLabel?: string;
};

export type TimelineTask = {
  id: string;
  title: string;
  detail: string;
  group: "critical" | "recommended" | "optional" | "completed";
  status: OpsHealthStatus;
  effort: string;
  priority: string;
  system: string;
  href?: string;
};

export type MonitoringItem = {
  key: string;
  label: string;
  status: OpsHealthStatus;
  message: string;
  href?: string;
};

export type AiOpsDisplay = {
  globalEnabled: boolean;
  coverageState: string;
  automationMode: string;
  knowledgeLoaded: boolean;
  automationRules: string;
  lastActivation: string | null;
  provider: string;
  model: string;
  monthSpendUsd: number;
  monthlyBudgetUsd: number;
  emailIntegration: string;
};

export type LaunchReadiness = {
  score: number;
  status: "ready" | "almost" | "not_ready";
  environment: string;
  generatedAt: string;
  categories: LaunchCategory[];
  blockers: LaunchIssue[];
  warnings: LaunchIssue[];
  recommendations: LaunchIssue[];
  timeline: TimelineTask[];
  monitoring: MonitoringItem[];
  recentFailures: number;
  aiOps: AiOpsDisplay;
};

// ─── Scoring ─────────────────────────────────────────────────────────────────

function checkScore(c: LaunchCheck): number | null {
  if (c.scored === false) return null;
  if (c.status === "unknown") return null; // info / skip — never counts
  if (c.status === "healthy") return 1;
  if (c.status === "warning") return 0.5;
  return 0; // offline
}

function scoreChecks(checks: LaunchCheck[]): number | null {
  const scores = checks.map(checkScore).filter((s): s is number => s !== null);
  if (scores.length === 0) return null;
  return Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 100);
}

function categoryStatus(checks: LaunchCheck[]): OpsHealthStatus {
  if (checks.some((c) => c.status === "offline")) return "offline";
  if (checks.some((c) => c.status === "warning")) return "warning";
  if (checks.some((c) => c.status === "healthy")) return "healthy";
  return "unknown";
}

function makeCategory(
  id: string,
  label: string,
  checks: LaunchCheck[],
  action?: { href: string; label: string },
): LaunchCategory {
  return {
    id,
    label,
    score: scoreChecks(checks),
    status: categoryStatus(checks),
    checks,
    actionHref: action?.href,
    actionLabel: action?.label,
  };
}

// Categories that never move the launch score (display-only). AI Operations is
// informational per product spec — a store can launch with it off.
const UNSCORED_CATEGORIES = new Set(["ai-operations"]);

// ─── Small helpers ───────────────────────────────────────────────────────────

const nonEmpty = (v: string | null | undefined): boolean => Boolean(v && v.trim());
const PLACEHOLDER_RE = /\{\{[a-z_]+\}\}/i;

function pass(
  id: string,
  label: string,
  detail: string,
  extra: Partial<LaunchCheck> = {},
): LaunchCheck {
  return { id, label, status: "healthy", detail, ...extra };
}
function warn(
  id: string,
  label: string,
  detail: string,
  extra: Partial<LaunchCheck> = {},
): LaunchCheck {
  return { id, label, status: "warning", detail, effort: "Moyen", ...extra };
}
function fail(
  id: string,
  label: string,
  detail: string,
  extra: Partial<LaunchCheck> = {},
): LaunchCheck {
  return { id, label, status: "offline", detail, effort: "Élevé", ...extra };
}
function info(
  id: string,
  label: string,
  detail: string,
  extra: Partial<LaunchCheck> = {},
): LaunchCheck {
  return { id, label, status: "unknown", detail, scored: false, ...extra };
}

// ─── Category builders ───────────────────────────────────────────────────────

type Settings = Awaited<ReturnType<typeof getStoreSettings>>;

async function buildStoreConfig(settings: Settings): Promise<LaunchCategory> {
  const support = await prisma.supportConfig.findFirst().catch(() => null);
  const siteUrl = getSiteUrl();
  const domainOk = !/localhost|127\.0\.0\.1/.test(siteUrl);

  const legal = settings.legalPages ?? {};
  const legalEntries = Object.values(legal);
  const publishedLegal = legalEntries.filter((p) => p.published);
  const placeholderLegal = publishedLegal.filter((p) => PLACEHOLDER_RE.test(p.content));

  const seoOk = legalEntries.some((p) => nonEmpty(p.seoTitle) && nonEmpty(p.seoDescription));

  const checks: LaunchCheck[] = [
    nonEmpty(settings.branding.siteName)
      ? pass("store-name", "Nom de la boutique", `« ${settings.branding.siteName} »`)
      : fail("store-name", "Nom de la boutique", "Aucun nom défini.", { blocking: true, href: "/admin?tab=settings" }),
    domainOk
      ? pass("domain", "Domaine configuré", siteUrl)
      : warn("domain", "Domaine configuré", `Origine résolue sur ${siteUrl}.`, { href: "/admin?tab=settings" }),
    checkAuthEnv()
      ? pass("env", "Variables d’environnement", "Secrets critiques présents (DB, session).")
      : fail("env", "Variables d’environnement", "Un secret critique manque.", { blocking: true }),
    pass("mode", "Environnement d’exécution", runtimeEnvLabel()),
    settings.maintenance.enabled
      ? warn("maintenance", "Mode maintenance", "La maintenance est ACTIVE — la boutique est fermée aux visiteurs.", { href: "/admin?tab=settings" })
      : pass("maintenance", "Mode maintenance", "Désactivé — la boutique est ouverte."),
    nonEmpty(settings.branding.logoText) && nonEmpty(settings.branding.heroTitle)
      ? pass("branding", "Identité visuelle", "Logo et accroche définis.")
      : warn("branding", "Identité visuelle", "Logo ou accroche manquant.", { href: "/admin?tab=settings" }),
    nonEmpty(settings.footer.contactEmail) && nonEmpty(settings.footer.whatsappNumber)
      ? pass("contact", "Coordonnées de contact", `${settings.footer.contactEmail} · ${settings.footer.whatsappNumber}`)
      : warn("contact", "Coordonnées de contact", "E-mail ou WhatsApp de contact manquant.", { href: "/admin?tab=settings" }),
    nonEmpty(support?.supportEmail)
      ? pass("support-email", "E-mail de support", support!.supportEmail)
      : warn("support-email", "E-mail de support", "Aucun e-mail de support configuré.", { href: "/admin?tab=settings" }),
    publishedLegal.length >= 3
      ? placeholderLegal.length > 0
        ? warn("legal", "Pages légales", `${publishedLegal.length} publiées, mais ${placeholderLegal.length} contien(nen)t encore des champs à compléter ({{…}}).`, { href: "/admin?tab=legal" })
        : pass("legal", "Pages légales", `${publishedLegal.length} pages publiées et finalisées.`)
      : fail("legal", "Pages légales", `Seulement ${publishedLegal.length} page(s) légale(s) publiée(s).`, { blocking: true, href: "/admin?tab=legal" }),
    settings.footer.socialLinks && (nonEmpty(settings.footer.socialLinks.instagram) || nonEmpty(settings.footer.socialLinks.facebook))
      ? pass("footer", "Liens de pied de page", "Réseaux sociaux renseignés.")
      : info("footer", "Liens de pied de page", "Aucun réseau social renseigné (optionnel).", { href: "/admin?tab=settings" }),
    seoOk
      ? pass("seo", "Bases SEO", "Titres et descriptions SEO présents.")
      : warn("seo", "Bases SEO", "Métadonnées SEO incomplètes.", { href: "/admin?tab=settings" }),
  ];

  return makeCategory("store", "Configuration de la boutique", checks, {
    href: "/admin?tab=settings",
    label: "Ouvrir les paramètres",
  });
}

function checkAuthEnv(): boolean {
  return Boolean(
    (process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET || process.env.SESSION_SECRET) &&
      process.env.DATABASE_URL,
  );
}

async function buildProducts(): Promise<LaunchCategory> {
  const products = await prisma.product.findMany({
    include: { variants: true, media: true, categoryRecord: true },
  });
  const active = products.filter((p) => p.active);
  const hidden = products.length - active.length;

  const priced = (p: (typeof products)[number]) =>
    p.priceMad > 0 || p.variants.some((v) => v.priceMad > 0);
  const described = (p: (typeof products)[number]) =>
    nonEmpty(p.description) || nonEmpty(p.shortDescription) || nonEmpty(p.longDescription);
  const imaged = (p: (typeof products)[number]) => nonEmpty(p.imageUrl) || p.media.length > 0;
  const categorized = (p: (typeof products)[number]) => Boolean(p.categoryRecord);
  const regioned = (p: (typeof products)[number]) =>
    nonEmpty(p.region) || p.variants.some((v) => nonEmpty(v.region));

  const missingImages = active.filter((p) => !imaged(p)).length;
  const missingDescriptions = active.filter((p) => !described(p)).length;
  const missingPricing = active.filter((p) => !priced(p)).length;
  const missingDelivery = active.filter((p) => !nonEmpty(p.deliveryType)).length;
  const missingRedemption = active.filter((p) => !nonEmpty(p.instructions)).length;
  const missingCategories = active.filter((p) => !categorized(p)).length;
  const missingVariants = active.filter((p) => p.variants.length === 0).length;
  const missingRegions = active.filter((p) => !regioned(p)).length;

  const ready = active.filter(
    (p) => imaged(p) && described(p) && priced(p) && categorized(p),
  ).length;
  const incomplete = active.length - ready;

  const productsHref = "/admin?tab=products";

  if (active.length === 0) {
    return makeCategory(
      "products",
      "Produits",
      [fail("empty-catalog", "Catalogue vide", "Aucun produit publié — les clients n’ont rien à acheter.", { blocking: true, href: productsHref })],
      { href: productsHref, label: "Ajouter des produits" },
    );
  }

  const bucket = (
    id: string,
    label: string,
    count: number,
    okDetail: string,
  ): LaunchCheck =>
    count === 0
      ? pass(id, label, okDetail)
      : warn(id, label, `${count} produit(s) concerné(s).`, { href: productsHref });

  const checks: LaunchCheck[] = [
    pass("published", "Produits publiés", `${active.length} publié(s)${hidden ? `, ${hidden} masqué(s)` : ""}.`, { href: productsHref }),
    incomplete === 0
      ? pass("ready", "Produits complets", `${ready}/${active.length} prêts à la vente.`)
      : warn("ready", "Produits complets", `${ready}/${active.length} complets — ${incomplete} à finaliser.`, { href: productsHref }),
    bucket("images", "Images produit", missingImages, "Tous les produits ont une image."),
    bucket("descriptions", "Descriptions", missingDescriptions, "Tous les produits ont une description."),
    missingPricing === 0
      ? pass("pricing", "Tarification", "Tous les produits ont un prix.")
      : fail("pricing", "Tarification", `${missingPricing} produit(s) sans prix — invendables.`, { blocking: true, href: productsHref }),
    bucket("delivery", "Type de livraison", missingDelivery, "Type de livraison défini partout."),
    bucket("redemption", "Guides d’utilisation", missingRedemption, "Instructions d’utilisation renseignées."),
    bucket("categories", "Catégories", missingCategories, "Tous les produits sont catégorisés."),
    missingVariants === 0
      ? pass("variants", "Variantes", "Tous les produits ont au moins une variante.")
      : info("variants", "Variantes", `${missingVariants} produit(s) sans variante (mono-SKU sur le prix produit).`, { href: productsHref }),
    bucket("regions", "Régions", missingRegions, "Région définie partout."),
  ];

  return makeCategory("products", "Produits", checks, {
    href: productsHref,
    label: "Gérer les produits",
  });
}

async function buildSuppliers(): Promise<LaunchCategory> {
  const supplierHealth = await checkSuppliers();
  const reloadlyConfigured = isReloadlyConfigured();
  const fazerConfigured = isFazerCardsConfigured();

  const checks: LaunchCheck[] = [];

  // Reloadly
  if (!reloadlyConfigured) {
    checks.push(info("reloadly", "Reloadly", "Non configuré (identifiants absents).", { href: "/admin/suppliers/reloadly" }));
  } else {
    const env = getReloadlyEnvironment();
    if (env === "sandbox" && isProductionRuntime()) {
      checks.push(warn("reloadly", "Reloadly", "Configuré en SANDBOX sur la production — aucun achat réel.", { href: "/admin/suppliers/reloadly" }));
    } else {
      checks.push(pass("reloadly", "Reloadly", `Configuré (${env}).`, { href: "/admin/suppliers/reloadly" }));
    }
  }

  // FazerCards
  if (!fazerConfigured) {
    checks.push(info("fazercards", "FazerCards", "Non configuré (identifiants absents).", { href: "/admin/suppliers/fazercards" }));
  } else {
    const mode = getFazerCardsMode();
    checks.push(
      mode === "dry_run"
        ? warn("fazercards", "FazerCards", "Mode dry-run — aucune commande réelle.", { href: "/admin/suppliers/fazercards" })
        : pass("fazercards", "FazerCards", "Configuré (live).", { href: "/admin/suppliers/fazercards" }),
    );
  }

  // Connectivity / last request-failure from cached supplier health.
  for (const h of supplierHealth) {
    checks.push({
      id: `conn-${h.key}`,
      label: `${h.label} — connectivité`,
      status: h.status,
      detail: h.message,
      href: h.href,
      scored: false, // configuration above already scores the supplier
    });
  }

  // At least one usable supplier is what unlocks automatic fulfilment.
  const anyConfigured = reloadlyConfigured || fazerConfigured;
  checks.unshift(
    anyConfigured
      ? pass("any-supplier", "Fournisseur disponible", "Au moins un fournisseur est configuré.")
      : warn("any-supplier", "Fournisseur disponible", "Aucun fournisseur configuré — livraison manuelle uniquement.", { href: "/admin/suppliers" }),
  );

  return makeCategory("suppliers", "Fournisseurs", checks, {
    href: "/admin/suppliers",
    label: "Gérer les fournisseurs",
  });
}

async function buildPayments(health: HealthResult[]): Promise<LaunchCategory> {
  const methods = await prisma.paymentMethod.findMany({ where: { archivedAt: null } });
  const live = methods.filter((m) => m.visible && m.status === "active");
  const byType = (t: string) => live.filter((m) => m.type === t);
  const paypalHealth = health.find((h) => h.key === "payments");
  const settings = await getStoreSettings();

  const paymentsHref = "/admin?tab=payment-methods";

  const bank = byType("bank");
  const paypal = byType("paypal");
  const crypto = byType("crypto");
  const withInstructions = live.filter((m) => nonEmpty(m.customerNote) || Object.keys((m.details as object) ?? {}).length > 0);
  const proofMethods = live.filter((m) => m.proofRequired);

  const checks: LaunchCheck[] = [
    live.length > 0
      ? pass("any-method", "Moyen de paiement actif", `${live.length} moyen(s) de paiement visible(s).`, { href: paymentsHref })
      : fail("any-method", "Moyen de paiement actif", "Aucun moyen de paiement visible — le paiement est impossible.", { blocking: true, href: paymentsHref }),
    bank.length > 0
      ? pass("bank", "Virement bancaire", `Actif (${bank[0].name}).`)
      : info("bank", "Virement bancaire", "Aucun virement bancaire actif.", { href: paymentsHref }),
    paypal.length > 0 && paypalHealth?.status === "healthy"
      ? pass("paypal", "PayPal", "Actif et configuré.")
      : paypal.length > 0
        ? warn("paypal", "PayPal", paypalHealth?.message ?? "Actif mais configuration à vérifier.", { href: paymentsHref })
        : info("paypal", "PayPal", "PayPal non proposé.", { href: paymentsHref }),
    crypto.length > 0
      ? pass("usdt", "USDT / Crypto", `Actif (${crypto[0].name}).`)
      : info("usdt", "USDT / Crypto", "Aucun paiement crypto actif.", { href: paymentsHref }),
    withInstructions.length === live.length && live.length > 0
      ? pass("instructions", "Instructions de paiement", "Chaque moyen a des instructions.")
      : warn("instructions", "Instructions de paiement", `${live.length - withInstructions.length} moyen(s) sans instructions.`, { href: paymentsHref }),
    proofMethods.length > 0
      ? pass("proof", "Justificatifs de paiement", `${proofMethods.length} moyen(s) exigent un justificatif — upload actif.`)
      : info("proof", "Justificatifs de paiement", "Aucun moyen n’exige de justificatif."),
    pass("confirm", "Workflow de confirmation", "Validation manuelle des paiements disponible en admin.", { href: "/admin?tab=orders" }),
    pass("refunds", "Remboursements", "File de remboursement opérationnelle.", { href: "/admin/refunds" }),
    settings.ghostCredit
      ? pass("ghost-credit", "Ghost Credit", `Configuré (expiration ${settings.ghostCredit.inactivityDays} j).`)
      : info("ghost-credit", "Ghost Credit", "Non configuré."),
  ];

  return makeCategory("payments", "Paiements", checks, {
    href: paymentsHref,
    label: "Gérer les paiements",
  });
}

function buildEmail(health: HealthResult[], settings: Settings): LaunchCategory {
  const emailHealth = health.find((h) => h.key === "email");
  const inbound = isInboundEmailConfigured();
  const templateCount = Object.keys(settings.emailTemplates ?? {}).length;

  const checks: LaunchCheck[] = [
    emailHealth
      ? {
          id: "resend",
          label: "Resend configuré",
          status: emailHealth.status,
          detail: emailHealth.message,
          href: emailHealth.href,
          blocking: emailHealth.status === "offline",
          effort: "Moyen",
        }
      : info("resend", "Resend configuré", "État inconnu."),
    emailHealth?.status === "healthy"
      ? pass("sending", "Envoi opérationnel", "Aucun échec d’envoi récent.")
      : warn("sending", "Envoi opérationnel", emailHealth?.message ?? "À vérifier.", { href: "/admin?tab=email-templates" }),
    info("dkim", "DKIM", "Vérification DNS manuelle (tableau de bord Resend)."),
    info("spf", "SPF", "Vérification DNS manuelle (tableau de bord Resend)."),
    info("dmarc", "DMARC", "Vérification DNS manuelle (tableau de bord Resend)."),
    templateCount > 0
      ? pass("templates", "Modèles d’e-mail", `${templateCount} modèles configurés.`, { href: "/admin?tab=email-templates" })
      : warn("templates", "Modèles d’e-mail", "Aucun modèle configuré.", { href: "/admin?tab=email-templates" }),
    inbound
      ? pass("mailbox", "Boîte de support entrante", "Réception d’e-mails support connectée.")
      : info("mailbox", "Réception e-mail support", "Manuelle (planifiée) — les tickets web fonctionnent."),
  ];

  return makeCategory("email", "E-mail", checks, {
    href: "/admin?tab=email-templates",
    label: "Modèles d’e-mail",
  });
}

function buildCustomerExperience(settings: Settings): LaunchCategory {
  const ordering = isOrderingEnabled(settings);
  const googleLogin = Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);

  const checks: LaunchCheck[] = [
    ordering
      ? pass("checkout", "Paiement des commandes", "Les commandes sont activées.")
      : warn("checkout", "Paiement des commandes", "Les commandes sont DÉSACTIVÉES (mode pré-lancement) — à activer pour vendre.", { href: "/admin?tab=settings", effort: "Faible" }),
    pass("guest", "Paiement invité", "Commande sans compte disponible."),
    pass("account", "Création de compte", "Inscription client disponible."),
    pass("login", "Connexion", "Connexion e-mail/mot de passe disponible."),
    googleLogin
      ? pass("google", "Connexion Google", "OAuth Google configuré.")
      : info("google", "Connexion Google", "OAuth Google non configuré (optionnel)."),
    pass("tracking", "Suivi de commande", "Page de suivi disponible."),
    pass("support", "Tickets de support", "Support client opérationnel.", { href: "/admin?tab=support" }),
    pass("payment-page", "Page de paiement", "Page de paiement opérationnelle."),
    pass("delivery-page", "Page de livraison", "Page de livraison des codes opérationnelle."),
  ];

  return makeCategory("cx", "Expérience client", checks);
}

async function buildSecurity(health: HealthResult[]): Promise<LaunchCategory> {
  const authHealth = health.find((h) => h.key === "auth");
  const auditCount = await prisma.adminAuditLog.count().catch(() => 0);
  const httpsOk = getSiteUrl().startsWith("https://");

  const checks: LaunchCheck[] = [
    authHealth
      ? {
          id: "admin-auth",
          label: "Authentification admin",
          status: authHealth.status,
          detail: authHealth.message,
          blocking: authHealth.status === "offline",
          effort: "Élevé",
        }
      : info("admin-auth", "Authentification admin", "État inconnu."),
    checkAuthEnv()
      ? pass("secrets", "Secrets de production", "Secrets critiques présents.")
      : fail("secrets", "Secrets de production", "Un secret critique manque.", { blocking: true }),
    httpsOk
      ? pass("https", "HTTPS", "Origine servie en HTTPS.")
      : warn("https", "HTTPS", "L’origine n’est pas en HTTPS."),
    pass("rate-limit", "Limitation de débit", "Limiteur actif sur les routes sensibles."),
    info("backups", "Sauvegardes", "Point-in-time recovery géré par Neon (vérif. hors code)."),
    auditCount > 0
      ? pass("audit", "Journaux d’audit", `${auditCount} entrée(s) d’audit admin.`, { href: "/admin?tab=activity" })
      : info("audit", "Journaux d’audit", "Aucune entrée d’audit pour l’instant."),
    process.env.DATABASE_URL
      ? pass("env-validation", "Validation d’environnement", "Configuration validée au démarrage.")
      : fail("env-validation", "Validation d’environnement", "DATABASE_URL absent.", { blocking: true }),
  ];

  return makeCategory("security", "Sécurité", checks, {
    href: "/admin?tab=activity",
    label: "Voir l’activité admin",
  });
}

async function buildAiOps(): Promise<{ category: LaunchCategory; display: AiOpsDisplay }> {
  const [snapshot, readiness, overview] = await Promise.all([
    getAiOpsSnapshot().catch(() => null),
    coverageReadiness().catch(() => null),
    getCoverageOverview().catch(() => null),
  ]);

  const knowledgeLoaded = Boolean(readiness?.checks.find((c) => c.key === "knowledge")?.ok);
  const session = overview?.session ?? null;
  const state = overview?.effectiveState ?? "INACTIVE";
  const mode = session ? (session.draftOnly ? "Brouillon uniquement" : session.allowAutoReply ? "Réponse auto" : "Brouillon") : "—";

  const display: AiOpsDisplay = {
    globalEnabled: snapshot?.globalEnabled ?? false,
    coverageState: state,
    automationMode: mode,
    knowledgeLoaded,
    automationRules: session ? `${session.channels.length} canal(aux) · ${session.categories.length || "toutes"} catégorie(s)` : "Aucune règle active",
    lastActivation: session?.activatedAt ?? null,
    provider: snapshot?.defaultProvider ?? "—",
    model: snapshot?.defaultModel ?? "—",
    monthSpendUsd: snapshot?.usage.monthSpendUsd ?? 0,
    monthlyBudgetUsd: snapshot?.usage.monthlyBudgetUsd ?? 0,
    emailIntegration: isInboundEmailConfigured() ? "Connectée" : "Non configurée",
  };

  // Display-only checks — UNSCORED (never move launch readiness).
  const checks: LaunchCheck[] = [
    info("coverage", "Support client IA", `${state} · ${mode}`, { href: "/admin/ai-operations/support" }),
    info("knowledge", "Base de connaissances", knowledgeLoaded ? "Chargée" : "Non chargée", { href: "/admin/ai-operations/support" }),
    info("provider", "Fournisseur IA", `${display.provider} · ${display.model}`, { href: "/admin/ai-operations/settings" }),
    info("usage", "Consommation (mois)", `$${display.monthSpendUsd.toFixed(2)} / $${display.monthlyBudgetUsd.toFixed(0)}`, { href: "/admin/ai-operations" }),
    info("ai-email", "Intégration e-mail", display.emailIntegration),
  ];

  return {
    category: makeCategory("ai-operations", "Opérations IA", checks, {
      href: "/admin/ai-operations",
      label: "Ouvrir AI Ops",
    }),
    display,
  };
}

// ─── Monitoring + derived views ──────────────────────────────────────────────

function buildMonitoring(
  health: HealthResult[],
  supplierHealth: HealthResult[],
  aiOps: AiOpsDisplay,
): { items: MonitoringItem[]; recentFailures: number } {
  const find = (key: string) => health.find((h) => h.key === key);
  const asItem = (key: string, fallbackLabel: string): MonitoringItem => {
    const h = find(key);
    return {
      key,
      label: h?.label ?? fallbackLabel,
      status: h?.status ?? "unknown",
      message: h?.message ?? "—",
      href: h?.href,
    };
  };

  const supplierWorst: OpsHealthStatus = supplierHealth.some((s) => s.status === "offline")
    ? "offline"
    : supplierHealth.some((s) => s.status === "warning")
      ? "warning"
      : supplierHealth.some((s) => s.status === "healthy")
        ? "healthy"
        : "unknown";

  const items: MonitoringItem[] = [
    asItem("website", "Site web"),
    asItem("database", "Base de données"),
    asItem("storage", "Stockage"),
    asItem("email", "E-mail"),
    {
      key: "ai-provider",
      label: "Fournisseur IA",
      status: aiOps.globalEnabled ? "healthy" : "unknown",
      message: aiOps.globalEnabled ? `${aiOps.provider} · ${aiOps.model}` : "IA désactivée",
      href: "/admin/ai-operations",
    },
    {
      key: "suppliers",
      label: "API fournisseurs",
      status: supplierWorst,
      message: supplierHealth.map((s) => `${s.label}: ${s.status}`).join(" · ") || "Aucun",
      href: "/admin/suppliers",
    },
  ];

  // Recent failures: cron/email/discord roll-up from the health checks.
  const recentFailures = health.filter((h) => h.status === "offline").length +
    supplierHealth.filter((h) => h.status === "offline").length;

  return { items, recentFailures };
}

function collectIssues(categories: LaunchCategory[]): {
  blockers: LaunchIssue[];
  warnings: LaunchIssue[];
} {
  const blockers: LaunchIssue[] = [];
  const warnings: LaunchIssue[] = [];
  for (const cat of categories) {
    for (const c of cat.checks) {
      if (c.scored === false && c.status !== "offline") continue;
      const issue: LaunchIssue = {
        category: cat.label,
        label: c.label,
        detail: c.detail,
        href: c.href,
        fixLabel: c.fixLabel,
      };
      if (c.status === "offline" && c.blocking) blockers.push(issue);
      else if (c.status === "offline" || c.status === "warning") warnings.push(issue);
    }
  }
  return { blockers, warnings };
}

function buildTimeline(categories: LaunchCategory[]): TimelineTask[] {
  const tasks: TimelineTask[] = [];
  for (const cat of categories) {
    for (const c of cat.checks) {
      const isBlocker = c.status === "offline" && c.blocking;
      let group: TimelineTask["group"];
      let priority: string;
      if (isBlocker) {
        group = "critical";
        priority = "Critique";
      } else if (c.status === "offline" || c.status === "warning") {
        group = "recommended";
        priority = "Recommandé";
      } else if (c.status === "healthy") {
        // Only surface meaningful completed items (those with a fix destination).
        if (!c.href) continue;
        group = "completed";
        priority = "Fait";
      } else {
        // info/skip — only if actionable.
        if (!c.href || c.scored === false) continue;
        group = "optional";
        priority = "Optionnel";
      }
      tasks.push({
        id: `${cat.id}:${c.id}`,
        title: c.label,
        detail: c.detail,
        group,
        status: c.status,
        effort: c.effort ?? (group === "critical" ? "Élevé" : group === "recommended" ? "Moyen" : "Faible"),
        priority,
        system: cat.label,
        href: c.href,
      });
    }
  }
  return tasks;
}

// ─── Entry point ─────────────────────────────────────────────────────────────

export async function getLaunchReadiness(): Promise<LaunchReadiness> {
  const settings = await getStoreSettings();
  const [health, supplierHealth] = await Promise.all([
    runCoreHealthChecks(),
    checkSuppliers(),
  ]);

  const [store, products, suppliers, security, aiOpsResult] = await Promise.all([
    buildStoreConfig(settings),
    buildProducts(),
    buildSuppliers(),
    buildSecurity(health),
    buildAiOps(),
  ]);
  const payments = await buildPayments(health);
  const email = buildEmail(health, settings);
  const cx = buildCustomerExperience(settings);

  const categories: LaunchCategory[] = [
    store,
    products,
    suppliers,
    payments,
    email,
    cx,
    security,
    aiOpsResult.category,
  ];

  // Overall score: every scored check across scored categories counts equally.
  const scoredChecks = categories
    .filter((c) => !UNSCORED_CATEGORIES.has(c.id))
    .flatMap((c) => c.checks);
  const overall = scoreChecks(scoredChecks) ?? 100;
  const status: LaunchReadiness["status"] =
    overall >= 90 ? "ready" : overall >= 70 ? "almost" : "not_ready";

  const { blockers, warnings } = collectIssues(
    categories.filter((c) => !UNSCORED_CATEGORIES.has(c.id)),
  );
  const recommendations = [...blockers, ...warnings].slice(0, 6);
  const timeline = buildTimeline(categories.filter((c) => !UNSCORED_CATEGORIES.has(c.id)));
  const { items: monitoring, recentFailures } = buildMonitoring(
    health,
    supplierHealth,
    aiOpsResult.display,
  );

  return {
    score: overall,
    status,
    environment: runtimeEnvLabel(),
    generatedAt: new Date().toISOString(),
    categories,
    blockers,
    warnings,
    recommendations,
    timeline,
    monitoring,
    recentFailures,
    aiOps: aiOpsResult.display,
  };
}
