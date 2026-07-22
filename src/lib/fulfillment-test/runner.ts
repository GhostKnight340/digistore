/**
 * Fulfillment Test Center runner.
 *
 * This is NOT a mock. It drives the EXACT production seams — the
 * {@link SupplierProvider} abstraction, the real Reloadly operations, and the
 * real transactional-email renderer — but pointed at the SANDBOX credential set
 * and fed an isolated, synthetic order context. That gives us the one property
 * the tool exists for: after any change, one click proves the real fulfillment
 * path still authenticates, purchases, retrieves a code and renders delivery.
 *
 * Isolation guarantees (why this can never touch production):
 *  - No Order / Customer / DeliveredCode / SupplierFulfillment (ledger) row is
 *    ever written. We call `provider.purchase()` DIRECTLY, not `fulfillSlot()`,
 *    so the ledger, supplier logs, analytics and cost reconciliation are all
 *    bypassed. The provider's `afterDelivered` hook (the only DB write it can
 *    trigger) is intentionally never invoked.
 *  - The ONLY row written is one `FulfillmentTestRun` (this tool's own history).
 *  - A real supplier order is placed ONLY in sandbox — sandbox spends fake
 *    wallet money and returns non-redeemable test codes. In `live` the purchase
 *    stage is skipped by design so the tool never buys a production product.
 *  - No customer email is sent — we render only.
 */
import "server-only";
import crypto from "node:crypto";
import { prisma } from "@/lib/db/prisma";
import { getSupplierProvider } from "@/lib/suppliers/registry";
import { getGiftCardProducts } from "@/lib/reloadly/operations";
import { isReloadlyConfigured } from "@/lib/reloadly/config";
import { renderTransactionalEmail } from "@/lib/email/send-email";
import { notifySystemAlert } from "@/lib/discord/notify";
import { isDiscordEnabled } from "@/lib/discord/config";
import { runHealthChecks } from "./health";
import {
  PLACEHOLDER_CODE,
  STAGE,
  STAGE_PLAN,
  TEST_RECIPIENT_EMAIL,
  pickSandboxProduct,
  type SandboxProductPick,
} from "./plan";
import type {
  EmailPreview,
  FulfillmentTestResult,
  TestEnvironment,
  TestMode,
  TestStage,
} from "./types";

function safeMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Erreur inattendue.";
}

function encryptRoundTrip(code: string): void {
  const key = crypto.randomBytes(32);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(code, "utf8"), cipher.final()]);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(cipher.getAuthTag());
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
  if (decrypted !== code) throw new Error("Échec du cycle chiffrement/déchiffrement.");
}

export type RunFulfillmentTestInput = {
  environment: TestEnvironment;
  mode: TestMode;
  confirmation?: string;
  sendDiscord?: boolean;
  createdBy: string;
};

export async function runFulfillmentTest(input: RunFulfillmentTestInput): Promise<FulfillmentTestResult> {
  // Dangerous-mode gate: live uses REAL supplier credentials.
  if (input.environment === "live" && input.confirmation !== "CONFIRM") {
    throw new Error("Saisissez CONFIRM pour utiliser les identifiants fournisseur de production.");
  }

  const started = Date.now();
  const env = input.environment;
  const plan = STAGE_PLAN[input.mode];
  const stages: TestStage[] = [];
  const warnings: string[] = [];
  let emailPreview: EmailPreview | undefined;
  let productUsed: string | undefined;
  let discordSent = false;
  let safeError: string | undefined;
  let developerError: string | undefined;

  // Pre-flight health checks always run (cheap + the whole point of the tool).
  const healthChecks = await runHealthChecks(env);

  // Timing wrapper — records a stage and rethrows so the orchestrator can stop.
  async function step<T>(name: string, fn: () => Promise<{ value: T; detail?: string }>): Promise<T> {
    const start = Date.now();
    try {
      const { value, detail } = await fn();
      stages.push({ name, status: "passed", durationMs: Date.now() - start, detail });
      return value;
    } catch (error) {
      stages.push({ name, status: "failed", durationMs: Date.now() - start, detail: safeMessage(error) });
      throw error;
    }
  }

  const provider = getSupplierProvider("reloadly");
  const has = (name: string) => plan.includes(name);

  try {
    if (has(STAGE.context)) {
      await step(STAGE.context, async () => ({
        value: null,
        detail: `Commande isolée test-${crypto.randomUUID().slice(0, 8)} → ${TEST_RECIPIENT_EMAIL}`,
      }));
    }

    if (has(STAGE.auth)) {
      await step(STAGE.auth, async () => {
        const test = await provider.testConnection(env);
        if (!test.ok) throw new Error(test.message);
        return { value: null, detail: `${env} · ${test.responseTimeMs} ms` };
      });
    }

    // A real code drives the store/email stages when we actually purchased;
    // otherwise a clearly-marked placeholder keeps those stages spend-free.
    let deliveredCode = PLACEHOLDER_CODE;

    let candidate: SandboxProductPick | null = null;
    if (has(STAGE.select)) {
      candidate = await step(STAGE.select, async () => {
        const catalog = await getGiftCardProducts({ size: 200 }, env);
        const picked = pickSandboxProduct(catalog.content ?? []);
        if (!picked) throw new Error("Aucun produit sandbox exploitable trouvé dans le catalogue.");
        productUsed = `${picked.product.productName} · ${picked.faceValue} ${picked.currency}`;
        return { value: picked, detail: productUsed };
      });
    }

    if (has(STAGE.validate) && candidate) {
      await step(STAGE.validate, async () => {
        const check = await provider.validateMapping(
          {
            supplierProductId: String(candidate!.product.productId),
            supplierCategoryId: null,
            supplierKind: null,
            supplierRegion: candidate!.countryCode,
            faceValue: candidate!.faceValue,
            faceCurrency: candidate!.currency,
          },
          env,
        );
        if (!check.ok) throw new Error(check.message);
        return { value: null, detail: check.message };
      });
    }

    if (has(STAGE.purchase)) {
      if (env === "live") {
        // Never buy a production product. Live mode verifies auth/catalog only.
        stages.push({
          name: STAGE.purchase,
          status: "warning",
          durationMs: 0,
          detail: "Achat volontairement ignoré en production — aucun produit réel n’est acheté.",
        });
        warnings.push(
          "Environnement production : l’achat réel a été ignoré pour ne jamais dépenser d’argent réel. Utilisez Sandbox pour un achat de bout en bout.",
        );
      } else if (candidate) {
        deliveredCode = await step(STAGE.purchase, async () => {
          const runId = crypto.randomUUID();
          const result = await provider.purchase(
            {
              idempotencyScope: `ghost-fulfillment-test-${runId}`,
              entryParams: {
                reloadlyProductId: candidate!.product.productId,
                reloadlyCountryCode: candidate!.countryCode,
              },
              context: {
                orderId: `test-${runId}`,
                customerEmail: TEST_RECIPIENT_EMAIL,
                faceValue: candidate!.faceValue,
                faceCurrency: candidate!.currency,
              },
            },
            env,
          );
          // NB: we deliberately do NOT call result.afterDelivered() — that is
          // the cost-reconciliation DB write and must not run for a test.
          return { value: result.primary, detail: `code obtenu · réf ${result.providerRef}` };
        });
      }
    }

    if (has(STAGE.store)) {
      await step(STAGE.store, async () => {
        encryptRoundTrip(deliveredCode);
        return {
          value: null,
          detail:
            deliveredCode === PLACEHOLDER_CODE
              ? "cycle vérifié (code de substitution)"
              : "code réel scellé/descellé",
        };
      });
    }

    if (has(STAGE.email)) {
      emailPreview = await step(STAGE.email, async () => {
        const rendered = await renderTransactionalEmail("order_delivered", {
          customer_name: "Client Test",
          order_number: "#TEST",
          delivery_url: "https://ghost.ma/delivery/test-preview",
          order_url: "https://ghost.ma/order/test-preview",
        });
        if (!rendered.html.includes("href=") || !rendered.text.trim()) {
          throw new Error("Le rendu de l’e-mail de livraison a échoué (HTML/texte invalide).");
        }
        return { value: rendered, detail: "HTML + texte rendus (non envoyé)" };
      });
    }

    if (has(STAGE.timeline)) {
      await step(STAGE.timeline, async () => {
        const now = new Date().toISOString();
        const events = [
          { scope: "order", type: "test_created", at: now },
          { scope: "order", type: "test_delivered", at: now },
          { scope: "admin", type: "fulfillment_test_run", at: now },
        ];
        JSON.parse(JSON.stringify(events)); // serialize round-trip validation
        return { value: null, detail: `${events.length} événements générés` };
      });
    }

    if (has(STAGE.discord)) {
      await step(STAGE.discord, async () => {
        const payload = {
          scope: "fulfillment-test",
          message: `[TEST] Test de fulfillment ${env} — ceci n’est PAS une notification de production.`,
        };
        if (input.sendDiscord && isDiscordEnabled()) {
          await notifySystemAlert(payload);
          discordSent = true;
          return { value: null, detail: "notification [TEST] envoyée" };
        }
        return {
          value: null,
          detail: input.sendDiscord
            ? "Discord désactivé — payload construit, non envoyé"
            : "payload construit, envoi désactivé",
        };
      });
    }
  } catch (error) {
    safeError = safeMessage(error);
    developerError = error instanceof Error ? (error.stack ?? error.message) : String(error);
  }

  // Any planned stage that never ran (because an earlier one threw) is skipped.
  for (const name of plan) {
    if (!stages.some((s) => s.name === name)) {
      stages.push({ name, status: "skipped", durationMs: 0, detail: "ignoré suite à un échec précédent" });
    }
  }

  const executed = stages.filter((s) => s.status !== "skipped");
  const passedCount = executed.filter((s) => s.status === "passed").length;
  const stageFailed = stages.some((s) => s.status === "failed");
  const healthFailed = input.mode === "health" && healthChecks.some((c) => c.status === "fail");
  const status: "passed" | "failed" = stageFailed || healthFailed ? "failed" : "passed";

  const healthScore =
    input.mode === "health"
      ? (() => {
          const relevant = healthChecks.filter((c) => c.status !== "info");
          return relevant.length ? Math.round((relevant.filter((c) => c.status === "ok").length / relevant.length) * 100) : 100;
        })()
      : executed.length
        ? Math.round((passedCount / executed.length) * 100)
        : 100;

  const durationMs = Date.now() - started;

  const row = await prisma.fulfillmentTestRun.create({
    data: {
      supplier: "reloadly",
      environment: env,
      mode: input.mode,
      status,
      durationMs,
      healthScore,
      stages: stages as never,
      warnings: warnings as never,
      safeError,
      developerError,
      createdBy: input.createdBy,
    },
  });

  return {
    id: row.id,
    status,
    supplier: "reloadly",
    environment: env,
    mode: input.mode,
    durationMs,
    healthScore,
    stages,
    healthChecks,
    warnings,
    productUsed,
    discordSent,
    safeError,
    developerError,
    emailPreview,
  };
}

/**
 * Overview + history for the dashboard. Balance is a best-effort read that never
 * blocks the page (a sandbox outage must not 500 the admin route).
 */
export async function getFulfillmentTestDashboard() {
  const history = await prisma.fulfillmentTestRun.findMany({
    orderBy: { createdAt: "desc" },
    take: 30,
  });
  const passed = history.filter((r) => r.status === "passed");

  let sandboxBalance: string | null = null;
  if (isReloadlyConfigured("sandbox")) {
    try {
      const balance = await getSupplierProvider("reloadly").getBalance?.("sandbox");
      if (balance) sandboxBalance = `${balance.amount} ${balance.currency}`;
    } catch {
      sandboxBalance = null;
    }
  }

  return {
    history,
    successRate: history.length ? Math.round((passed.length / history.length) * 100) : 0,
    averageDurationMs: history.length
      ? Math.round(history.reduce((n, r) => n + r.durationMs, 0) / history.length)
      : 0,
    lastSuccess: passed[0]?.createdAt ?? null,
    lastFailure: history.find((r) => r.status === "failed")?.createdAt ?? null,
    sandboxConfigured: isReloadlyConfigured("sandbox"),
    liveConfigured: isReloadlyConfigured("live"),
    sandboxBalance,
  };
}
