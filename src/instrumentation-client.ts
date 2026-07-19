/**
 * Browser-side Sentry init (Next.js `instrumentation-client` hook).
 *
 * No DSN → nothing is loaded at all: `NEXT_PUBLIC_SENTRY_DSN` is inlined at
 * build time, so with it unset this file compiles down to a no-op and the
 * client bundle is unchanged. That is the current state — the DSN does not
 * exist yet.
 *
 * The environment/release come from the NEXT_PUBLIC_ mirrors Vercel injects
 * automatically; VERCEL_ENV itself is server-only.
 */
import { sentryOptions } from "@/lib/monitoring/sentry";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  import("@sentry/nextjs")
    .then((Sentry) => {
      Sentry.init(
        sentryOptions({
          dsn,
          environment: process.env.NEXT_PUBLIC_VERCEL_ENV || "development",
          release: process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA,
        }),
      );
    })
    .catch(() => {
      // Monitoring must never break the page.
    });
}

/** Reports client-side navigation timing to Sentry when it is enabled. */
export async function onRouterTransitionStart(
  ...args: Parameters<
    NonNullable<typeof import("@sentry/nextjs")["captureRouterTransitionStart"]>
  >
): Promise<void> {
  if (!dsn) return;
  try {
    const Sentry = await import("@sentry/nextjs");
    Sentry.captureRouterTransitionStart(...args);
  } catch {
    // Best-effort.
  }
}
