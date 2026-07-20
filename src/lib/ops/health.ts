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
import { CRON_JOBS, getJobRuns, isJobOverdue } from "./jobRuns";
import { isFazerCardsConfigured } from "@/lib/fazercards/config";
import { isReloadlyConfigured } from "@/lib/reloadly/config";
import { runtimeEnvLabel, isProductionRuntime } from "@/lib/env";
import { withHealthTimeout } from "@/lib/monitoring/healthTimeout";
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

// The deadline wrapper itself lives in @/lib/monitoring/healthTimeout so it can
// be tested without pulling in Prisma. Re-exported here because this module is
// the single entry point callers use for health.
export { withHealthTimeout } from "@/lib/monitoring/healthTimeout";

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
export async function checkStorage(): Promise<HealthResult> {
  const startedAt = Date.now();
  try {
    // A real probe, not a claim: count products that actually carry an image.
    // In production that image data IS the storage, so this exercises it.
    const withImage = await prisma.product.count({ where: { imageUrl: { not: null } } });
    return {
      ...base("storage", "Stockage des images"),
      status: withImage > 0 ? "healthy" : "warning",
      message:
        withImage > 0
          ? `${withImage} produit(s) avec image — stockage lisible.`
          : "Aucun produit n’a d’image — stockage vide ou illisible.",
      responseTimeMs: Date.now() - startedAt,
    };
  } catch {
    return {
      ...base("storage", "Stockage des images"),
      status: "unknown",
      message: "Impossible de vérifier le stockage des images.",
      responseTimeMs: Date.now() - startedAt,
    };
  }
}

/**
 * Payments (PayPal): credentials present, and the sandbox/live mode matches the
 * runtime. `PAYPAL_ENV=sandbox` on production means no real money can be taken;
 * `live` on staging is the dangerous direction and is flagged at boot too
 * (src/instrumentation.ts).
 */
export function checkPayments(): HealthResult {
  const mode = process.env.PAYPAL_ENV ?? "sandbox";
  const configured = Boolean(
    process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET,
  );
  if (!configured) {
    return {
      ...base("payments", "Paiements (PayPal)"),
      status: isProductionRuntime() ? "offline" : "unknown",
      message: isProductionRuntime()
        ? "Identifiants PayPal absents — aucun paiement PayPal possible."
        : "PayPal non configuré sur cet environnement.",
      responseTimeMs: null,
      action: "Ajoutez PAYPAL_CLIENT_ID et PAYPAL_CLIENT_SECRET.",
    };
  }
  if (isProductionRuntime() && mode !== "live") {
    return {
      ...base("payments", "Paiements (PayPal)"),
      status: "warning",
      message: `Configuré en mode « ${mode} » sur la production — paiements non réels.`,
      responseTimeMs: null,
      action: "Passez PAYPAL_ENV=live.",
    };
  }
  if (!isProductionRuntime() && mode === "live") {
    return {
      ...base("payments", "Paiements (PayPal)"),
      status: "warning",
      message: "PAYPAL_ENV=live hors production — de vrais paiements peuvent être capturés.",
      responseTimeMs: null,
      action: "Passez PAYPAL_ENV=sandbox sur cet environnement.",
    };
  }
  return {
    ...base("payments", "Paiements (PayPal)"),
    status: "healthy",
    message: `Identifiants présents, mode « ${mode} ».`,
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
 * Cron jobs, from RECORDED EXECUTIONS.
 *
 * This used to return a flat "unknown" with the honest note that no last-run
 * tracking existed, so a job broken for a week looked identical to a healthy
 * one. The ScheduledJobRun table now records every run (see lib/ops/jobRuns),
 * so this can answer the real question.
 *
 * The honesty property is kept: a job that has never recorded a success is
 * reported as "unknown", never as healthy. Being configured is still not being
 * healthy — but now, having actually run recently is.
 */
export async function checkCron(): Promise<HealthResult> {
  const onVercel = Boolean(process.env.VERCEL);
  if (!onVercel) {
    return {
      ...base("cron", "Tâches planifiées (cron)"),
      status: "unknown",
      message: "Les tâches cron ne s’exécutent que sur Vercel.",
      responseTimeMs: null,
    };
  }

  const runs = await getJobRuns();
  const byJob = new Map(runs.map((run) => [run.job, run]));
  const total = CRON_JOBS.length;

  const neverRan = CRON_JOBS.filter((job) => !byJob.get(job)?.lastSuccessAt);
  const failing = CRON_JOBS.filter((job) => (byJob.get(job)?.consecutiveFailures ?? 0) > 0);
  const overdue = CRON_JOBS.filter((job) => {
    const run = byJob.get(job);
    return run?.lastSuccessAt ? isJobOverdue(job, run.lastSuccessAt) : false;
  });

  if (failing.length > 0) {
    return {
      ...base("cron", "Tâches planifiées (cron)"),
      status: "offline",
      message: `${failing.length}/${total} tâche(s) en échec : ${failing.join(", ")}.`,
      responseTimeMs: null,
      action: "Ouvrez les journaux Vercel de la tâche concernée pour la cause exacte.",
    };
  }
  if (overdue.length > 0) {
    return {
      ...base("cron", "Tâches planifiées (cron)"),
      status: "warning",
      message: `${overdue.length}/${total} tâche(s) en retard : ${overdue.join(", ")}.`,
      responseTimeMs: null,
      action: "Vérifiez que les tâches planifiées sont toujours actives sur Vercel.",
    };
  }
  if (neverRan.length > 0) {
    return {
      ...base("cron", "Tâches planifiées (cron)"),
      status: "unknown",
      message: `${neverRan.length}/${total} tâche(s) sans exécution enregistrée : ${neverRan.join(", ")}.`,
      responseTimeMs: null,
      action: "Normal juste après un déploiement ; à revoir après un cycle complet.",
    };
  }
  return {
    ...base("cron", "Tâches planifiées (cron)"),
    status: "healthy",
    message: `${total} tâches planifiées, toutes exécutées récemment.`,
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
  // Each DB-touching check gets its own deadline, so one hung connection
  // degrades a single card instead of freezing the whole dashboard render.
  const [database, email, discord, storage, cron] = await Promise.all([
    withHealthTimeout("database", "Base de données", checkDatabase),
    withHealthTimeout("email", "E-mails (Resend)", checkEmail),
    withHealthTimeout("discord", "Discord", checkDiscord),
    withHealthTimeout("storage", "Stockage des images", checkStorage),
    // checkCron now reads recorded executions from the database, so it needs the
    // same deadline treatment as every other DB-touching check.
    withHealthTimeout("cron", "Tâches planifiées (cron)", checkCron),
  ]);
  return [
    database,
    checkAuth(),
    checkWebsite(),
    email,
    discord,
    storage,
    checkPayments(),
    cron,
  ];
}
