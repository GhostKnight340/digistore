/**
 * Shared operational-dashboard vocabulary. Kept dependency-free (no server-only,
 * no Prisma) so pure logic + tests can import it. The DTOs the client renders
 * live in src/lib/dto.ts and mirror these shapes.
 */

/** The four-state health verdict used everywhere on the dashboard. */
export type HealthStatus = "healthy" | "warning" | "offline" | "unknown";

/**
 * A consistent health response every subsystem returns. Never carries secrets
 * or raw provider payloads — `message`/`action` are admin-safe French strings.
 */
export type HealthResult = {
  /** Stable key, e.g. "database", "email", "supplier:reloadly". */
  key: string;
  /** Display label (French). */
  label: string;
  status: HealthStatus;
  /** One-line human summary. */
  message: string;
  /** ISO timestamp of when this check ran. */
  checkedAt: string;
  /** Round-trip time in ms when the check actually pinged something. */
  responseTimeMs: number | null;
  /** Optional recommended next step (French), shown on non-healthy states. */
  action?: string;
  /** Optional admin link to act on the issue. */
  href?: string;
};

export type WarningSeverity = "critical" | "warning" | "info";

/** A single operational warning surfaced by the warning engine. */
export type OperationalWarning = {
  /** Stable identity so the same issue de-duplicates across refreshes. */
  id: string;
  severity: WarningSeverity;
  title: string;
  description: string;
  detectedAt: string;
  /** Admin link that leads to where the issue can be resolved. */
  resolveHref?: string;
};

/** Rolls a set of health results up to the worst status present. */
export function rollUpHealth(results: { status: HealthStatus }[]): HealthStatus {
  if (results.some((r) => r.status === "offline")) return "offline";
  if (results.some((r) => r.status === "warning")) return "warning";
  if (results.length > 0 && results.every((r) => r.status === "healthy")) return "healthy";
  return "unknown";
}

const SEVERITY_RANK: Record<WarningSeverity, number> = { critical: 0, warning: 1, info: 2 };

/** Sorts warnings most-severe first, then newest first. */
export function sortWarnings<T extends OperationalWarning>(warnings: T[]): T[] {
  return [...warnings].sort(
    (a, b) =>
      SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] ||
      b.detectedAt.localeCompare(a.detectedAt),
  );
}
