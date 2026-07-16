/**
 * Runtime environment detection — the single source of truth for
 * "is this the real production site (ghost.ma)?" decisions: sending real email,
 * allowing search indexing, injecting production analytics, and the staging
 * banner.
 *
 * Why not NODE_ENV: Vercel sets `NODE_ENV="production"` on EVERY deployment
 * (production, preview, and the `staging` custom environment alike), so it
 * cannot tell the live site apart from staging. The authoritative signal is
 * `VERCEL_ENV`:
 *   - production deployment (main → ghost.ma) ......... VERCEL_ENV="production"
 *   - the `staging` custom environment + previews ..... VERCEL_ENV="preview"
 *   - local `next dev` / `next start` ................. VERCEL_ENV unset*
 *
 * *Caveat: a `vercel pull`ed `.env` / `.env.local` can bake `VERCEL_ENV="preview"`
 * into local runs. That is fine for these helpers — locally we WANT the
 * non-production (safe) behavior. It is exactly why nothing here throws at boot.
 *
 * Server-only: VERCEL_ENV / VERCEL_URL are not exposed to the browser. These
 * helpers must only be evaluated in Server Components, server actions, route
 * handlers, or scripts — never in client components.
 */

export type RuntimeEnv = "production" | "preview" | "development";

/** The resolved runtime environment. */
export function runtimeEnv(): RuntimeEnv {
  switch (process.env.VERCEL_ENV) {
    case "production":
      return "production";
    case "preview":
      return "preview";
    case "development":
      return "development";
    default:
      // Non-Vercel (local dev / CLI scripts): only "production" NODE_ENV counts,
      // and even then only when not obviously a Vercel-pulled preview env.
      return process.env.NODE_ENV === "production" ? "production" : "development";
  }
}

/** True only on the real production deployment (main → ghost.ma). */
export function isProductionRuntime(): boolean {
  return runtimeEnv() === "production";
}

/**
 * True on Vercel preview deployments AND the `staging` custom environment.
 * Drives the staging banner and the "do not touch real customers" guards.
 */
export function isPreviewDeployment(): boolean {
  return runtimeEnv() === "preview";
}

/** Human-readable label for the current environment (banner, logs, audit). */
export function runtimeEnvLabel(): string {
  const target = process.env.VERCEL_TARGET_ENV; // custom env name, e.g. "staging"
  if (target && target !== "production" && target !== "preview") return target;
  return runtimeEnv();
}
