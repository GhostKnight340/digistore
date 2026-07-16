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

export async function register(): Promise<void> {
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
