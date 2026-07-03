/**
 * Maintenance-mode gating. Single source of truth for deciding whether the
 * public maintenance page should be shown for a given request.
 *
 * Safety guarantees (do NOT weaken these):
 * - /login and /admin are ALWAYS reachable, so an admin can log in and turn
 *   maintenance off even after being logged out.
 * - A DISABLE_MAINTENANCE=true env var is a global kill switch.
 * - A MAINTENANCE_BYPASS_SECRET env var enables an emergency bypass URL.
 * - Authenticated admins never see the maintenance wall.
 */

export const MAINTENANCE_BYPASS_COOKIE = "mm_bypass";

/**
 * Public path prefixes that stay reachable while maintenance is ON.
 * The storefront/checkout (/, /products, /cart, /checkout, …) is intentionally
 * NOT listed, so it gets blocked.
 */
export const MAINTENANCE_ALLOWED_PREFIXES = [
  "/admin", // admin dashboard (its own auth still applies)
  "/login", // admin + customer login — must never be blocked
  "/logout",
  "/forgot-password",
  "/reset-password",
  "/verify-email",
  "/account", // authenticated customer account
  "/payment", // pay for an existing order
  "/order", // track an existing order
  "/delivery", // access delivered codes
  "/find-order",
];

export function isPathAllowedDuringMaintenance(pathname: string) {
  return MAINTENANCE_ALLOWED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

/** Global env kill switch — works even with no DB/admin access. */
export function isMaintenanceDisabledByEnv() {
  return process.env.DISABLE_MAINTENANCE === "true";
}

/** Emergency bypass: the cookie set from the ?maintenance_bypass=<secret> URL. */
export function isMaintenanceBypassSecretValid(cookieValue: string | undefined) {
  const secret = process.env.MAINTENANCE_BYPASS_SECRET;
  return Boolean(secret && cookieValue && cookieValue === secret);
}

export function shouldShowMaintenance(opts: {
  enabled: boolean;
  pathname: string;
  isAdmin: boolean;
  bypassCookie?: string;
}): boolean {
  if (!opts.enabled) return false;
  if (isMaintenanceDisabledByEnv()) return false;
  if (isMaintenanceBypassSecretValid(opts.bypassCookie)) return false;
  if (opts.isAdmin) return false;
  return !isPathAllowedDuringMaintenance(opts.pathname);
}
