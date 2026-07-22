import type { InstagramCapability } from "./capabilities";
import type { SocialIntegrationStatus } from "./status";

/**
 * Browser-safe DTOs for the Instagram integration. These are the ONLY shapes
 * that cross to client components — they deliberately omit the Composio
 * connected-account id, auth-config id and user id (operational secrets).
 */

export interface InstagramCapabilityView {
  key: InstagramCapability;
  label: string;
  write: boolean;
  available: boolean;
}

/** Connection status + profile card. No Composio ids. */
export interface InstagramStatusDTO {
  configured: boolean;
  connected: boolean;
  status: SocialIntegrationStatus;
  statusLabel: string;
  username: string | null;
  profileName: string | null;
  profilePictureUrl: string | null;
  accountId: string | null;
  accountType: string | null;
  facebookPageId: string | null;
  facebookPageName: string | null;
  profileUrl: string | null;
  capabilities: InstagramCapabilityView[];
  connectedAt: string | null;
  lastVerifiedAt: string | null;
  lastSyncAt: string | null;
  lastError: { message: string } | null;
}

/** One row of the "select an existing Composio connection" discovery list. */
export interface DiscoveredAccountDTO {
  /** Opaque token the client echoes back to link — NOT the raw Composio id. */
  ref: string;
  status: string;
  username: string | null;
  createdAt: string | null;
}

export interface InstagramMediaDTO {
  id: string;
  caption: string | null;
  mediaType: string | null;
  mediaUrl: string | null;
  thumbnailUrl: string | null;
  permalink: string | null;
  timestamp: string | null;
  commentsCount: number | null;
  likeCount: number | null;
}

export interface InstagramCommentDTO {
  id: string;
  username: string | null;
  text: string | null;
  timestamp: string | null;
  mediaId: string | null;
  replied: boolean;
}

/** Generic action result mirroring the repo's `{ ok, error }` convention. */
export interface InstagramActionResult<T = undefined> {
  ok: boolean;
  error?: string;
  data?: T;
}

/** Result of a verification / connection test. */
export interface VerifyResult {
  ok: boolean;
  status: SocialIntegrationStatus;
  message: string;
  username: string | null;
  capabilities: InstagramCapability[];
}
