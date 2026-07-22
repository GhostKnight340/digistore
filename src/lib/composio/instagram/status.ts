import "server-only";

/**
 * Ghost.ma-side status of the Instagram integration (schema `status` on
 * SocialIntegration). Kept as a string union (this repo has no Prisma enums —
 * allowed values live in TypeScript). Distinct from Composio's own connected-
 * account status, which is mapped into these via {@link mapComposioStatus}.
 */
export const SOCIAL_INTEGRATION_STATUSES = [
  "CONNECTED",
  "DISCONNECTED",
  "EXPIRED",
  "ERROR",
  "REAUTH_REQUIRED",
] as const;

export type SocialIntegrationStatus = (typeof SOCIAL_INTEGRATION_STATUSES)[number];

export function isSocialIntegrationStatus(value: string): value is SocialIntegrationStatus {
  return (SOCIAL_INTEGRATION_STATUSES as readonly string[]).includes(value);
}

/** Composio connected-account statuses (from the SDK's ConnectedAccountStatuses). */
export type ComposioAccountStatus =
  | "INITIALIZING"
  | "INITIATED"
  | "ACTIVE"
  | "FAILED"
  | "EXPIRED"
  | "INACTIVE"
  | "REVOKED";

/**
 * Maps a Composio connected-account status onto the Ghost.ma integration status.
 * REVOKED/INACTIVE mean the OAuth grant is gone → the admin must reconnect.
 */
export function mapComposioStatus(status: ComposioAccountStatus | string): SocialIntegrationStatus {
  switch (status) {
    case "ACTIVE":
      return "CONNECTED";
    case "EXPIRED":
      return "EXPIRED";
    case "REVOKED":
    case "INACTIVE":
    case "FAILED":
      return "REAUTH_REQUIRED";
    case "INITIALIZING":
    case "INITIATED":
      return "DISCONNECTED";
    default:
      return "ERROR";
  }
}

/** French label for an integration status (admin UI). */
export function statusLabel(status: SocialIntegrationStatus): string {
  switch (status) {
    case "CONNECTED":
      return "Connecté";
    case "DISCONNECTED":
      return "Non connecté";
    case "EXPIRED":
      return "Expiré";
    case "REAUTH_REQUIRED":
      return "Reconnexion requise";
    case "ERROR":
      return "Erreur";
  }
}
