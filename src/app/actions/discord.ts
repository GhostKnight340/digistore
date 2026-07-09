"use server";

import { revalidatePath } from "next/cache";
import { prisma, ensureDatabaseReady } from "@/lib/db/prisma";
import {
  canDisconnectDiscord,
  getCurrentCustomer,
  type AuthActionResult,
} from "@/lib/auth";
import { generateActivationCode } from "@/lib/discord/activation";

/**
 * Generate (or regenerate) a one-time DM activation code for the current
 * customer. Regenerating invalidates prior unused codes. Returns the plaintext
 * code and its expiry for the activation modal.
 */
export async function generateDiscordActivationCodeAction(): Promise<
  AuthActionResult & { code?: string; expiresAt?: string }
> {
  const customer = await getCurrentCustomer();
  if (!customer) return { ok: false, error: "Veuillez vous connecter." };
  if (!customer.discordId) {
    return { ok: false, error: "Connectez d’abord votre compte Discord." };
  }
  try {
    const { code, expiresAt } = await generateActivationCode(customer.id);
    return { ok: true, code, expiresAt: expiresAt.toISOString() };
  } catch (error) {
    console.error("[discord:activation:generate]", error);
    return { ok: false, error: "Impossible de générer le code pour le moment." };
  }
}

/**
 * Poll used by the "J'ai envoyé le code" button. Reads the authoritative
 * activation state for the current customer (set only by the DM worker).
 */
export async function checkDiscordActivationAction(): Promise<
  AuthActionResult & { activated?: boolean }
> {
  const customer = await getCurrentCustomer();
  if (!customer) return { ok: false, error: "Veuillez vous connecter." };
  if (customer.discordDmActivated) {
    revalidatePath("/account");
    return { ok: true, activated: true };
  }
  return { ok: true, activated: false };
}

/**
 * Global default: whether future eligible orders also go to Discord DM. Saved
 * on the customer; existing orders keep whatever was chosen at order time.
 */
export async function setDiscordDeliveryPreferenceAction(
  enabled: boolean,
): Promise<AuthActionResult> {
  await ensureDatabaseReady();
  const customer = await getCurrentCustomer();
  if (!customer) return { ok: false, error: "Veuillez vous connecter." };
  await prisma.customer.update({
    where: { id: customer.id },
    data: { discordOrderDeliveryEnabled: enabled },
  });
  revalidatePath("/account");
  return { ok: true };
}

export type OrderDiscordState =
  | "guest"
  | "not_connected"
  | "connected_not_activated"
  | "activated";

export type OrderDiscordContext = {
  state: OrderDiscordState;
  /** Whether the acting customer owns this order (required to change anything). */
  owner: boolean;
  /** Current per-order request flag (authoritative for delivery). */
  requested: boolean;
};

/**
 * Read the Discord delivery context for the payment page: the viewer's Discord
 * connection state and the order's current per-order preference. On the first
 * eligible view (activated owner, choice not yet set) the order preference is
 * seeded once from the customer's global default, then becomes independent.
 */
export async function getOrderDiscordContextAction(
  orderId: string,
): Promise<OrderDiscordContext | null> {
  await ensureDatabaseReady();
  const current = await getCurrentCustomer();
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      customerId: true,
      discordDeliveryRequested: true,
      discordDeliveryPreferenceSet: true,
    },
  });
  if (!order) return null;

  const owner = Boolean(current && order.customerId && order.customerId === current.id);
  const state: OrderDiscordState = !current
    ? "guest"
    : !current.discordId
      ? "not_connected"
      : !current.discordDmActivated
        ? "connected_not_activated"
        : "activated";

  let requested = order.discordDeliveryRequested;

  if (state === "activated" && owner && !order.discordDeliveryPreferenceSet) {
    // Seed once from the global default; mark as set so it never re-seeds.
    requested = current!.discordOrderDeliveryEnabled;
    await prisma.order.update({
      where: { id: orderId },
      data: {
        discordDeliveryRequested: requested,
        discordDeliveryPreferenceSet: true,
        discordDeliveryStatus: requested ? "PENDING" : "NOT_REQUESTED",
      },
    });
  }

  return { state, owner, requested };
}

/**
 * Persist the per-order Discord delivery choice. Only the activated owner may
 * set it. Independent of the customer's global preference from here on.
 */
export async function setOrderDiscordDeliveryAction(
  orderId: string,
  enabled: boolean,
): Promise<AuthActionResult> {
  await ensureDatabaseReady();
  const current = await getCurrentCustomer();
  if (!current) return { ok: false, error: "Veuillez vous connecter." };
  if (!current.discordDmActivated) {
    return { ok: false, error: "Activez d’abord les messages Discord." };
  }
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: { customerId: true, discordDeliveryStatus: true },
  });
  if (!order || order.customerId !== current.id) {
    return { ok: false, error: "Commande introuvable." };
  }
  // Never overwrite a terminal delivery status (SENT/FAILED) — a preference
  // toggle after fulfillment must not rewrite delivery history.
  const terminal =
    order.discordDeliveryStatus === "SENT" || order.discordDeliveryStatus === "FAILED";
  await prisma.order.update({
    where: { id: orderId },
    data: {
      discordDeliveryRequested: enabled,
      discordDeliveryPreferenceSet: true,
      ...(terminal ? {} : { discordDeliveryStatus: enabled ? "PENDING" : "NOT_REQUESTED" }),
    },
  });
  return { ok: true };
}

/** Turn off DM delivery and clear the verified DM identity. */
export async function deactivateDiscordDmAction(): Promise<AuthActionResult> {
  await ensureDatabaseReady();
  const customer = await getCurrentCustomer();
  if (!customer) return { ok: false, error: "Veuillez vous connecter." };
  await prisma.customer.update({
    where: { id: customer.id },
    data: {
      discordDmActivated: false,
      discordDmActivatedAt: null,
      discordDmUserId: null,
      discordDmUsername: null,
      discordDmDisplayName: null,
      discordDmAvatar: null,
      discordOrderDeliveryEnabled: false,
    },
  });
  // Invalidate any pending codes too.
  await prisma.discordActivationCode.updateMany({
    where: { customerId: customer.id, usedAt: null },
    data: { usedAt: new Date() },
  });
  revalidatePath("/account");
  return { ok: true, message: "Messages Discord désactivés." };
}

/**
 * Disconnect the Discord OAuth identity entirely. Refused when Discord is the
 * customer's only login method, to avoid locking them out.
 */
export async function disconnectDiscordAction(): Promise<AuthActionResult> {
  await ensureDatabaseReady();
  const customer = await getCurrentCustomer();
  if (!customer) return { ok: false, error: "Veuillez vous connecter." };
  if (!canDisconnectDiscord(customer)) {
    return {
      ok: false,
      error:
        "Définissez d’abord un mot de passe : Discord est votre seule méthode de connexion.",
    };
  }
  await prisma.customer.update({
    where: { id: customer.id },
    data: {
      discordId: null,
      discordUsername: null,
      discordGlobalName: null,
      discordAvatar: null,
      discordDmActivated: false,
      discordDmActivatedAt: null,
      discordDmUserId: null,
      discordDmUsername: null,
      discordDmDisplayName: null,
      discordDmAvatar: null,
      discordOrderDeliveryEnabled: false,
    },
  });
  await prisma.discordActivationCode.updateMany({
    where: { customerId: customer.id, usedAt: null },
    data: { usedAt: new Date() },
  });
  revalidatePath("/account");
  return { ok: true, message: "Compte Discord déconnecté." };
}
