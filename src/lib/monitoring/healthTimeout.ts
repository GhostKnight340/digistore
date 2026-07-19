/**
 * Deadline wrapper for health checks.
 *
 * Lives here rather than in src/lib/ops/health.ts so it stays free of
 * `server-only` and Prisma — the wrapper is the part with real logic, and it
 * has to be testable without a database.
 *
 * Why it exists: `runCoreHealthChecks` runs its checks under one `Promise.all`,
 * and the dashboard awaits that alongside a dozen other queries in another
 * `Promise.all`. With no deadline, a single hung Neon socket freezes the entire
 * server-rendered admin page. A check that overruns degrades to "unknown" —
 * never to a fabricated "healthy", which would be worse than no check at all.
 */
import type { HealthResult } from "@/lib/ops/types";

/** Default deadline. Generous enough for a cold Neon connection, short enough
 *  that a stuck check never dominates a page render. */
export const CHECK_TIMEOUT_MS = 2500;

function fallback(
  key: string,
  label: string,
  message: string,
  responseTimeMs: number,
  action?: string,
): HealthResult {
  return {
    key,
    label,
    status: "unknown",
    message,
    checkedAt: new Date().toISOString(),
    responseTimeMs,
    ...(action ? { action } : {}),
  };
}

/**
 * Runs `run()` under a deadline. Resolves to the check's own result, or to an
 * "unknown" HealthResult if it hangs or throws. Never rejects.
 */
export async function withHealthTimeout(
  key: string,
  label: string,
  run: () => Promise<HealthResult>,
  timeoutMs: number = CHECK_TIMEOUT_MS,
): Promise<HealthResult> {
  const startedAt = Date.now();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<HealthResult>((resolve) => {
    timer = setTimeout(
      () =>
        resolve(
          fallback(
            key,
            label,
            `Vérification interrompue après ${timeoutMs} ms — état inconnu.`,
            timeoutMs,
            "Réessayez ; si cela persiste, le service ne répond plus.",
          ),
        ),
      timeoutMs,
    );
  });
  try {
    return await Promise.race([run(), deadline]);
  } catch {
    return fallback(
      key,
      label,
      "La vérification a échoué — état inconnu.",
      Date.now() - startedAt,
    );
  } finally {
    // Always clear: a pending timer would keep the serverless function alive.
    if (timer) clearTimeout(timer);
  }
}
