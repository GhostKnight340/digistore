import "server-only";

import { Composio, ComposioError } from "@composio/core";

/**
 * Single, reusable server-side Composio client.
 *
 * The rest of Ghost.ma talks to Composio *only* through this module (and the
 * feature services built on top of it) so the SDK is instantiated once, the API
 * key is validated in one place, and Composio errors are normalized into a small
 * stable shape before they reach UI/actions.
 *
 * Server-only: the Composio secret key (`COMPOSIO_API_KEY`) must never reach the
 * browser. Importing this file from a client component throws at build time.
 */

/** Env var that holds the Composio secret key (SDK default name). */
const COMPOSIO_API_KEY_ENV = "COMPOSIO_API_KEY";

/** Thrown when Composio is not configured. Carries an admin-safe French message. */
export class ComposioConfigError extends Error {
  readonly code = "not_configured" as const;
  constructor(message = "L’intégration Composio n’est pas configurée sur ce serveur.") {
    super(message);
    this.name = "ComposioConfigError";
  }
}

/** True when the Composio secret key is present (non-empty) in the environment. */
export function isComposioConfigured(): boolean {
  const key = process.env[COMPOSIO_API_KEY_ENV];
  return typeof key === "string" && key.trim().length > 0;
}

let cached: Composio | null = null;

/**
 * Returns the shared Composio client, creating it on first use.
 *
 * Throws {@link ComposioConfigError} (never a raw SDK error that could leak the
 * key) when the key is missing, so callers can surface a clean admin message.
 */
export function getComposio(): Composio {
  if (!isComposioConfigured()) {
    throw new ComposioConfigError();
  }
  if (!cached) {
    cached = new Composio({
      apiKey: process.env[COMPOSIO_API_KEY_ENV]!,
      // Telemetry off — this is a server integration, not a dev tool, and we
      // don't want the SDK phoning home from production request paths.
      allowTracking: false,
    });
  }
  return cached;
}

/** For tests only: drop the memoized client so a fresh env is picked up. */
export function __resetComposioForTests(): void {
  cached = null;
}

/**
 * Stable, non-identifying error categories for Composio failures. Callers branch
 * on these; the browser only ever sees the paired French `message`, never the
 * raw SDK error (which can echo request params / internal URLs).
 */
export type ComposioErrorCode =
  | "not_configured"
  | "account_not_found"
  | "reauth_required"
  | "permission_denied"
  | "unsupported_action"
  | "rate_limited"
  | "invalid_media"
  | "network"
  | "provider_error"
  | "unknown";

export interface NormalizedComposioError {
  code: ComposioErrorCode;
  /** Admin-facing French message. Safe to show in the UI. */
  message: string;
  /** Short technical hint kept for server logs only — never rendered. */
  logHint: string;
}

/** Maps an HTTP status (when the SDK exposes one) to a coarse category. */
function codeFromStatus(status: number | undefined): ComposioErrorCode | null {
  if (status === undefined) return null;
  if (status === 401 || status === 403) return "permission_denied";
  if (status === 404) return "account_not_found";
  if (status === 429) return "rate_limited";
  if (status >= 500) return "provider_error";
  return null;
}

const MESSAGES: Record<ComposioErrorCode, string> = {
  not_configured: "L’intégration Composio n’est pas configurée sur ce serveur.",
  account_not_found:
    "Le compte connecté est introuvable dans Composio. Reconnectez le compte pour continuer.",
  reauth_required: "La connexion Instagram doit être renouvelée. Reconnectez le compte.",
  permission_denied:
    "Cette action n’est pas autorisée avec les autorisations actuelles du compte.",
  unsupported_action:
    "Cette fonctionnalité n’est pas disponible avec la version actuelle de Composio.",
  rate_limited: "Trop de requêtes vers Instagram. Réessayez dans quelques instants.",
  invalid_media: "Le média fourni est invalide ou inaccessible.",
  network: "Impossible de joindre Composio. Vérifiez la connexion et réessayez.",
  provider_error: "Le service Composio a renvoyé une erreur. Réessayez plus tard.",
  unknown: "Une erreur inattendue est survenue avec l’intégration Instagram.",
};

/**
 * Normalizes any thrown value from a Composio call into a small, safe shape.
 *
 * Never returns the raw SDK message to callers — Composio error bodies can echo
 * the request arguments or internal endpoints. We branch on the SDK error
 * *class name* / `code` / HTTP status, then hand back a fixed French message.
 */
export function normalizeComposioError(error: unknown): NormalizedComposioError {
  if (error instanceof ComposioConfigError) {
    return { code: "not_configured", message: MESSAGES.not_configured, logHint: "config_missing" };
  }

  // The SDK ships named subclasses (ComposioConnectedAccountNotFoundError, …).
  // We can't import every one without coupling to internals, so we match on the
  // class name + code, which are stable and documented.
  const name = error instanceof Error ? error.name : "";
  const composioCode = error instanceof ComposioError ? error.code : undefined;
  const status =
    error && typeof error === "object" && "statusCode" in error
      ? (error as { statusCode?: number }).statusCode
      : undefined;

  let code: ComposioErrorCode = "unknown";

  if (/NoAPIKey/i.test(name)) code = "not_configured";
  else if (/ConnectedAccountNotFound|AuthConfigNotFound|MultipleConnectedAccounts/i.test(name))
    code = "account_not_found";
  else if (/ToolNotFound|ToolkitNotFound|ToolVersionRequired|InvalidToolArguments/i.test(name))
    code = "unsupported_action";
  else if (/Cancelled|BlockedInternalUrl/i.test(name)) code = "network";
  else {
    const byStatus = codeFromStatus(status);
    if (byStatus) code = byStatus;
    else if (name === "TypeError" || /fetch|network|ENOTFOUND|ECONN/i.test(errText(error)))
      code = "network";
  }

  return {
    code,
    message: MESSAGES[code],
    // logHint carries only the class name + code + status — no message body,
    // so nothing that could contain arguments or URLs is retained.
    logHint: `${name || "Error"}${composioCode ? `:${composioCode}` : ""}${
      status ? `:${status}` : ""
    }`,
  };
}

function errText(error: unknown): string {
  return error instanceof Error ? error.message : String(error ?? "");
}
