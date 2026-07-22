/**
 * Pre-flight health checks for the Fulfillment Test Center. All checks are
 * READ-ONLY and NON-BLOCKING: they probe the environment/dependencies a real
 * fulfillment needs and report status, but never place an order or spend money.
 * No secret value is ever returned — only presence/absence and safe summaries.
 */
import "server-only";
import { prisma } from "@/lib/db/prisma";
import {
  getReloadlyClientId,
  getReloadlyClientSecret,
} from "@/lib/reloadly/config";
import { isDiscordEnabled } from "@/lib/discord/config";
import { getSupplierProvider } from "@/lib/suppliers/registry";
import type { TestEnvironment, HealthCheck } from "./types";

function credsPresent(environment: TestEnvironment): boolean {
  return Boolean(getReloadlyClientId(environment) && getReloadlyClientSecret(environment));
}

async function checkDatabase(): Promise<HealthCheck> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return { name: "Base de données", status: "ok", detail: "Connexion établie." };
  } catch {
    return { name: "Base de données", status: "fail", detail: "Connexion impossible." };
  }
}

async function checkSupplierConnectivity(environment: TestEnvironment): Promise<HealthCheck> {
  if (!credsPresent(environment)) {
    return {
      name: "Connectivité fournisseur",
      status: "fail",
      detail: `Identifiants Reloadly ${environment} manquants.`,
    };
  }
  try {
    const test = await getSupplierProvider("reloadly").testConnection(environment);
    return {
      name: "Connectivité fournisseur",
      status: test.ok ? "ok" : "fail",
      detail: test.message,
    };
  } catch {
    return {
      name: "Connectivité fournisseur",
      status: "fail",
      detail: "Reloadly injoignable.",
    };
  }
}

/**
 * Runs every pre-flight check for the selected environment. The supplier
 * connectivity probe is the only network call; everything else is a cheap
 * presence/DB check. Returns them in display order.
 */
export async function runHealthChecks(environment: TestEnvironment): Promise<HealthCheck[]> {
  const [database, connectivity] = await Promise.all([
    checkDatabase(),
    checkSupplierConnectivity(environment),
  ]);

  const sandboxCreds: HealthCheck = {
    name: "Identifiants Reloadly Sandbox",
    status: credsPresent("sandbox") ? "ok" : "fail",
    detail: credsPresent("sandbox") ? "Configurés." : "RELOADLY_SANDBOX_CLIENT_ID / _SECRET manquants.",
  };
  const liveCreds: HealthCheck = {
    name: "Identifiants Reloadly Production",
    status: credsPresent("live") ? "ok" : "info",
    detail: credsPresent("live")
      ? "Configurés (lecture seule ici)."
      : "RELOADLY_CLIENT_ID / _SECRET absents.",
  };
  const email: HealthCheck = {
    name: "Configuration e-mail",
    status: process.env.RESEND_API_KEY ? "ok" : "info",
    detail: process.env.RESEND_API_KEY
      ? "RESEND_API_KEY présent (aucun e-mail envoyé pendant le test)."
      : "RESEND_API_KEY absent — le rendu est testé, aucun envoi requis.",
  };
  const discord: HealthCheck = {
    name: "Configuration Discord",
    status: isDiscordEnabled() ? "ok" : "info",
    detail: isDiscordEnabled() ? "Intégration active." : "Intégration désactivée (optionnelle).",
  };
  const storage: HealthCheck = {
    name: "Stockage (Vercel Blob)",
    status: process.env.BLOB_READ_WRITE_TOKEN ? "ok" : "info",
    detail: process.env.BLOB_READ_WRITE_TOKEN
      ? "Jeton présent."
      : "Non utilisé pour la livraison de codes (optionnel).",
  };
  const requiredEnv: HealthCheck = {
    name: "Variables d’environnement requises",
    status: process.env.DATABASE_URL ? "ok" : "fail",
    detail: process.env.DATABASE_URL ? "DATABASE_URL présent." : "DATABASE_URL manquant.",
  };

  return [
    database,
    requiredEnv,
    sandboxCreds,
    liveCreds,
    email,
    discord,
    storage,
    connectivity,
  ];
}
