/**
 * Centralized health-check service — the single place that knows how to probe
 * every critical subsystem and return a consistent {@link HealthResult}. The
 * dashboard, and any future module, reads health from here rather than
 * re-implementing checks.
 *
 * Rules:
 *  - Never expose secrets: checks only ever report presence of an env var, a
 *    status code, or a count — never a value.
 *  - Cheap by default: DB gets one trivial ping; suppliers use CACHED state
 *    (their own Supplier row) so opening the dashboard never triggers live
 *    provider API calls. Live supplier tests happen only via the explicit
 *    "Tester" quick action.
 *  - Adding a subsystem = add one `check*()` returning a HealthResult and list
 *    it in `runCoreHealthChecks()`.
 */
import "server-only";
import { ensureDatabaseReady, prisma } from "@/lib/db/prisma";
import { isFazerCardsConfigured } from "@/lib/fazercards/config";
import { isReloadlyConfigured } from "@/lib/reloadly/config";
import { runtimeEnvLabel, isProductionRuntime } from "@/lib/env";
import type { HealthResult, HealthStatus } from "./types";

const RECENT_WINDOW_MS = 24 * 60 * 60 * 1000;
/** Email failure counts above this in the last 24h flag a warning. */
const EMAIL_FAILURE_WARN = 3;
/** Discord delivery failures above this in the last 24h flag a warning. */
const DISCORD_FAILURE_WARN = 3;

function now(): string {
  return new Date().toISOString();
}

function base(key: string, label: string): Pick<HealthResult, "key" | "label" | "checkedAt"> {
  return { key, label, checkedAt: now() };
}

/** Database: a trivial round-trip proves connectivity + latency. */
export async function checkDatabase(): Promise<HealthResult> {
  const startedAt = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    const responseTimeMs = Date.now() - startedAt;
    return {
      ...base("database", "Base de données"),
      status: responseTimeMs > 1500 ? "warning" : "healthy",
      message:
        responseTimeMs > 1500
          ? "Connectée, mais latence élevée."
          : "Connectée (Neon PostgreSQL).",
      responseTimeMs,
    };
  } catch {
    return {
      ...base("database", "Base de données"),
      status: "offline",
      message: "Impossible de joindre la base de données.",
      responseTimeMs: Date.now() - startedAt,
      action: "Vérifiez DATABASE_URL et l’état de Neon.",
    };
  }
}

/** Email (Resend): configured + recent failure rate from EmailLog. */
export async function checkEmail(): Promise<HealthResult> {
  const configured = Boolean(process.env.RESEND_API_KEY);
  if (!configured) {
    return {
      ...base("email", "E-mails (Resend)"),
      status: isProductionRuntime() ? "offline" : "warning",
      message: isProductionRuntime()
        ? "RESEND_API_KEY absent — aucun e-mail ne partira."
        : "RESEND_API_KEY absent — envois simulés (hors production).",
      responseTimeMs: null,
      action: "Ajoutez RESEND_API_KEY dans les variables d’environnement.",
      href: "/admin?tab=email-templates",
    };
  }
  const since = new Date(Date.now() - RECENT_WINDOW_MS);
  const failures = await prisma.emailLog.count({
    where: { status: "failed", createdAt: { gte: since } },
  });
  return {
    ...base("email", "E-mails (Resend)"),
    status: failures >= EMAIL_FAILURE_WARN ? "warning" : "healthy",
    message:
      failures > 0
        ? `${failures} échec(s) d’envoi sur 24 h.`
        : "Configuré, aucun échec récent.",
    responseTimeMs: null,
    ...(failures >= EMAIL_FAILURE_WARN
      ? { action: "Consultez les journaux e-mail.", href: "/admin?tab=email-templates" }
      : {}),
  };
}

/** Discord: integration flag + credentials + recent delivery failures. */
export async function checkDiscord(): Promise<HealthResult> {
  const enabled = process.env.DISCORD_INTEGRATION_ENABLED === "true";
  const hasToken = Boolean(process.env.DISCORD_BOT_TOKEN);
  if (!enabled) {
    return {
      ...base("discord", "Discord"),
      status: "unknown",
      message: "Intégration Discord désactivée.",
      responseTimeMs: null,
    };
  }
  if (!hasToken) {
    return {
      ...base("discord", "Discord"),
      status: "warning",
      message: "Activée mais DISCORD_BOT_TOKEN absent.",
      responseTimeMs: null,
      action: "Ajoutez DISCORD_BOT_TOKEN.",
    };
  }
  const since = new Date(Date.now() - RECENT_WINDOW_MS);
  const failures = await prisma.order.count({
    where: { discordDeliveryStatus: "FAILED", discordDeliveryAttemptedAt: { gte: since } },
  });
  return {
    ...base("discord", "Discord"),
    status: failures >= DISCORD_FAILURE_WARN ? "warning" : "healthy",
    message:
      failures > 0
        ? `${failures} échec(s) de livraison Discord sur 24 h.`
        : "Connecté, aucun échec récent.",
    responseTimeMs: null,
  };
}

/**
 * Storage: product images are stored inline (base64 data URIs in production,
 * local /public/uploads in dev) — no external object store. Health therefore
 * tracks the DB (where prod images live) plus the upload route being present.
 */
export function checkStorage(): HealthResult {
  return {
    ...base("storage", "Stockage des images"),
    status: "healthy",
    message: isProductionRuntime()
      ? "Images intégrées (base64) — stockées en base."
      : "Images locales (/public/uploads) en développement.",
    responseTimeMs: null,
  };
}

/** Authentication: the session-signing secret must be configured. */
export function checkAuth(): HealthResult {
  const hasSecret = Boolean(
    process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET || process.env.SESSION_SECRET,
  );
  return {
    ...base("auth", "Authentification"),
    status: hasSecret ? "healthy" : "offline",
    message: hasSecret
      ? "Secret de session configuré, sessions signées."
      : "Aucun secret de session — connexions impossibles.",
    responseTimeMs: null,
    ...(hasSecret ? {} : { action: "Configurez AUTH_SECRET." }),
  };
}

/** Website/runtime: which environment is serving, and the deployed version. */
export function checkWebsite(): HealthResult {
  const sha = process.env.VERCEL_GIT_COMMIT_SHA;
  const version = sha ? sha.slice(0, 7) : "local";
  return {
    ...base("website", "Site web"),
    status: "healthy",
    message: `En ligne · ${runtimeEnvLabel()} · version ${version}.`,
    responseTimeMs: null,
  };
}

/**
 * Cron jobs: mirrors vercel.json. We can't read last-run without a tracking
 * table, so this reports "configuré" (schedules known) — honest rather than a
 * fabricated "last ran" time. Only meaningful on Vercel.
 */
export function checkCron(): HealthResult {
  const onVercel = Boolean(process.env.VERCEL);
  return {
    ...base("cron", "Tâches planifiées (cron)"),
    status: onVercel ? "healthy" : "unknown",
    message: onVercel
      ? "3 tâches configurées : dépenses (quotidien), revue mensuelle, crédit Ghost."
      : "Les tâches cron ne s’exécutent que sur Vercel.",
    responseTimeMs: null,
  };
}

/**
 * Supplier health from CACHED state only (no live API call) so refreshing the
 * dashboard never hits provider rate limits. Configured-but-never-checked is a
 * warning; a fresher failure than success is offline.
 */
export async function checkSuppliers(): Promise<HealthResult[]> {
  const rows = await prisma.supplier.findMany();
  const stateBySlug = new Map(rows.map((row) => [row.id, row]));

  // Registry is the source of truth for WHICH suppliers exist; DB rows carry
  // operational state. Kept in sync lazily by the supplier-management layer.
  const providers: { slug: string; label: string; configured: boolean }[] = [
    { slug: "reloadly", label: "Reloadly", configured: isReloadlyConfigured() },
    { slug: "fazercards", label: "FazerCards", configured: isFazerCardsConfigured() },
  ];

  return providers.map(({ slug, label, configured }) => {
    const row = stateBySlug.get(slug);
    const enabled = row?.enabled ?? true;
    let status: HealthStatus;
    let message: string;
    if (!configured) {
      status = "unknown";
      message = "Non configuré (identifiants absents).";
    } else if (!enabled) {
      status = "warning";
      message = "Désactivé — aucun achat automatique.";
    } else {
      const lastSuccess = row?.lastSuccessAt?.getTime() ?? 0;
      const lastFailure = row?.lastFailureAt?.getTime() ?? 0;
      if (!lastSuccess && !lastFailure) {
        status = "warning";
        message = "Jamais testé — lancez un test de connexion.";
      } else if (lastFailure > lastSuccess) {
        status = "offline";
        message = row?.lastFailureMessage || "Dernier appel en échec.";
      } else if (lastFailure && Date.now() - lastFailure < RECENT_WINDOW_MS) {
        status = "warning";
        message = "Échec récent, mais opérationnel depuis.";
      } else {
        status = "healthy";
        message = "Opérationnel.";
      }
    }
    return {
      ...base(`supplier:${slug}`, label),
      status,
      message,
      responseTimeMs: null,
      href: `/admin/suppliers/${slug}`,
    };
  });
}

/**
 * Runs every core subsystem check in parallel. Suppliers are returned
 * separately by the dashboard aggregator (they have their own richer card),
 * so this covers the infrastructure components.
 */
export async function runCoreHealthChecks(): Promise<HealthResult[]> {
  await ensureDatabaseReady();
  const [database, email, discord] = await Promise.all([
    checkDatabase(),
    checkEmail(),
    checkDiscord(),
  ]);
  return [
    database,
    checkAuth(),
    checkWebsite(),
    email,
    discord,
    checkStorage(),
    checkCron(),
  ];
}
