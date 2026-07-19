/**
 * Server startup self-check (Next.js instrumentation hook).
 *
 * On staging/preview deployments this loudly flags dangerous configuration —
 * live Reloadly, real-email opt-in without an allowlist, or a production-looking
 * database host — so a mis-scoped Vercel env var surfaces in the deploy logs
 * instead of silently spending real money or mailing real customers.
 *
 * It deliberately does NOT throw: a `vercel pull`ed `.env` can set
 * VERCEL_ENV="preview" locally, and a throw would break `next dev`. The real
 * enforcement lives in the code paths themselves (email allowlist in
 * src/lib/email/send-email.ts, robots noindex, GA gating) and in the Vercel
 * env-var scoping documented in docs/pre-launch-audit.md.
 */
import { isPreviewDeployment, runtimeEnvLabel } from "@/lib/env";
import { sentryDsn, sentryOptions } from "@/lib/monitoring/sentry";

/**
 * Error monitoring (Sentry), for the Node and Edge server runtimes. Entirely
 * skipped when no DSN is configured, so the app builds and runs unchanged
 * without one. Like the env self-check below, it never throws: a broken
 * monitoring setup must not be able to take the site down.
 */
async function registerSentry(): Promise<void> {
  const dsn = sentryDsn();
  if (!dsn) return;
  try {
    const Sentry = await import("@sentry/nextjs");
    Sentry.init(
      sentryOptions({
        dsn,
        environment: runtimeEnvLabel(),
        release: process.env.VERCEL_GIT_COMMIT_SHA,
      }),
    );
  } catch (error) {
    console.error("[sentry] initialisation skipped:", error);
  }
}

/** Surfaces server-side React/route errors to Sentry with the route as a tag. */
export async function onRequestError(
  ...args: Parameters<
    NonNullable<typeof import("@sentry/nextjs")["captureRequestError"]>
  >
): Promise<void> {
  if (!sentryDsn()) return;
  try {
    const Sentry = await import("@sentry/nextjs");
    Sentry.captureRequestError(...args);
  } catch {
    // Monitoring is best-effort.
  }
}

export async function register(): Promise<void> {
  await registerSentry();

  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (!isPreviewDeployment()) return;

  const warnings: string[] = [];
  if (process.env.RELOADLY_ENV === "live") {
    warnings.push(
      "RELOADLY_ENV=live on a non-production deployment — real gift cards can be purchased. Set RELOADLY_ENV=sandbox on this environment.",
    );
  }
  if (process.env.PAYPAL_ENV === "live") {
    warnings.push(
      "PAYPAL_ENV=live on a non-production deployment — real payments can be captured. Set PAYPAL_ENV=sandbox on this environment.",
    );
  }
  if (process.env.FAZERCARDS_API_KEY) {
    warnings.push(
      "FAZERCARDS_API_KEY is set on a non-production deployment — FazerCards has NO sandbox, every key is live. Order placement is simulated here (FAZERCARDS_MODE cannot resolve to 'live' off production), but unset the variable on this environment.",
    );
  }
  if ((process.env.FAZERCARDS_MODE || "").trim().toLowerCase() === "live") {
    warnings.push(
      "FAZERCARDS_MODE=live on a non-production deployment — ignored (the mode gate requires a production runtime), but the value should not be present here at all.",
    );
  }
  if (
    process.env.ENABLE_REAL_EMAILS === "true" &&
    !process.env.EMAIL_TEST_ALLOWLIST
  ) {
    warnings.push(
      "ENABLE_REAL_EMAILS=true with no EMAIL_TEST_ALLOWLIST — email is simulated (safe) but the opt-in is set; add an allowlist or unset it.",
    );
  }

  if (warnings.length > 0) {
    console.error(
      `\n[env-guard] ⚠️  ${runtimeEnvLabel().toUpperCase()} deployment configuration warnings:\n` +
        warnings.map((w) => `  - ${w}`).join("\n") +
        "\n",
    );
  }
}
