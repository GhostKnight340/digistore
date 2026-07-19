import { runtimeEnv } from "@/lib/env";

const PUBLIC_ORDER_NUMBER_LENGTH = 6;

export function formatPublicOrderNumber(sequence: number): string {
  return `#${String(sequence).padStart(PUBLIC_ORDER_NUMBER_LENGTH, "0")}`;
}

export function formatPublicOrderPathSegment(sequence: number): string {
  return String(sequence).padStart(PUBLIC_ORDER_NUMBER_LENGTH, "0");
}

export function publicOrderNumberToPathSegment(publicOrderNumber: string): string {
  return publicOrderNumber.trim().replace(/^#/, "");
}

export function getPublicOrderLabel(order: { publicOrderNumber?: string | null }): string {
  return order.publicOrderNumber || "Commande";
}

export function parsePublicOrderNumber(input: string): number | null {
  const decoded = decodeURIComponent(input.trim());
  const normalized = decoded.replace(/^#/, "").replace(/^0+/, "") || "0";
  if (!/^\d+$/.test(normalized)) return null;

  const sequence = Number(normalized);
  if (!Number.isSafeInteger(sequence) || sequence < 1) return null;
  return sequence;
}

export function customerOrderRedirectPath(status: string, id: string): string {
  if (status === "delivered") return `/delivery/${id}`;
  if (status === "cancelled" || status === "refunded") return `/order/${id}`;
  return `/payment/${id}`;
}

/** The live production origin — never a valid self-reference off production. */
const PRODUCTION_HOSTS = new Set(["ghost.ma", "www.ghost.ma"]);

function isProductionOrigin(url: string): boolean {
  try {
    return PRODUCTION_HOSTS.has(new URL(url).host.toLowerCase());
  } catch {
    return false;
  }
}

/** `https://<deployment>.vercel.app` for the CURRENT deployment, when on Vercel. */
function vercelOrigin(): string | null {
  const host = process.env.VERCEL_URL;
  return host ? `https://${host.replace(/^https?:\/\//, "").replace(/\/$/, "")}` : null;
}

/**
 * Absolute origin for links WE issue (verification codes, order/payment pages,
 * admin deep links). Must always point at the deployment that issued them:
 * a staging link back to production 404s against the production database.
 *
 * `NEXT_PUBLIC_SITE_URL` and friends are commonly set at PROJECT scope, so a
 * preview/staging deployment inherits the production origin. Off production we
 * therefore ignore a configured production origin and self-reference via
 * `VERCEL_URL` instead (a staging-specific value like staging.ghost.ma is kept).
 */
export function appBaseUrl(): string {
  const env = runtimeEnv();
  const configured =
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.APP_URL ||
    process.env.SITE_URL;

  if (configured && !(env !== "production" && isProductionOrigin(configured))) {
    return configured.replace(/\/$/, "");
  }

  // Preview/staging with no (usable) configuration: the deployment's own URL.
  const vercel = vercelOrigin();
  if (vercel) return vercel;

  if (env === "production") {
    throw new Error(
      "NEXT_PUBLIC_APP_URL, NEXT_PUBLIC_SITE_URL, APP_URL, or SITE_URL must be configured.",
    );
  }

  return "http://localhost:3000";
}

export function absoluteAppUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  return `${appBaseUrl()}${path.startsWith("/") ? path : `/${path}`}`;
}
