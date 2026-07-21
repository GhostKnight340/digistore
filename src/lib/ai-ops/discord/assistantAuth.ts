/**
 * Authorization for the Discord CEO assistant (spec §11: admin-only access).
 *
 * A Discord user may use the assistant only if they are the configured bot owner
 * OR their Discord identity is linked to a Ghost.ma account with the ADMIN role.
 * Everything else is rejected. The Discord user id is matched against BOTH the
 * OAuth-linked `discordId` and the DM-verified `discordDmUserId`, since either
 * proves control of the same Discord account.
 *
 * The decision predicate is pure (testable); only `authorizeDiscordAdmin` hits
 * the database. Fails closed on any error.
 */

import "server-only";

import { prisma } from "@/lib/db/prisma";
import { getDiscordOwnerUserId } from "@/lib/discord/config";

export interface AuthorizationFacts {
  /** Is this Discord id the configured owner id? */
  isOwner: boolean;
  /** Role of the linked customer, if any (e.g. "ADMIN", "CUSTOMER"). */
  linkedRole: string | null;
}

export type AuthorizationDecision =
  | { authorized: true; via: "owner" | "admin_account" }
  | { authorized: false; reason: "not_owner_not_admin" };

/** Pure: decide access from the gathered facts. Fail closed. */
export function decideAuthorization(facts: AuthorizationFacts): AuthorizationDecision {
  if (facts.isOwner) return { authorized: true, via: "owner" };
  if (facts.linkedRole === "ADMIN") return { authorized: true, via: "admin_account" };
  return { authorized: false, reason: "not_owner_not_admin" };
}

/** A Discord snowflake — used to reject obviously malformed ids before any query. */
function isSnowflake(value: string): boolean {
  return /^\d{17,20}$/.test(value);
}

/**
 * Resolve whether a Discord user id is allowed to use the CEO assistant.
 * Returns a decision; never throws.
 */
export async function authorizeDiscordAdmin(
  discordUserId: string,
): Promise<AuthorizationDecision> {
  if (!discordUserId || !isSnowflake(discordUserId)) {
    return { authorized: false, reason: "not_owner_not_admin" };
  }

  const ownerId = getDiscordOwnerUserId();
  const isOwner = Boolean(ownerId) && ownerId === discordUserId;

  let linkedRole: string | null = null;
  try {
    const customer = await prisma.customer.findFirst({
      where: {
        role: "ADMIN",
        OR: [{ discordId: discordUserId }, { discordDmUserId: discordUserId }],
      },
      select: { role: true },
    });
    linkedRole = customer?.role ?? null;
  } catch {
    // Fail closed: a DB error must not grant access. Owner check still applies.
    linkedRole = null;
  }

  return decideAuthorization({ isOwner, linkedRole });
}
