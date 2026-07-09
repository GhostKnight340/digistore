"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma, ensureDatabaseReady } from "@/lib/db/prisma";
import {
  canDisconnectDiscord,
  getCurrentCustomer,
  isPlaceholderEmail,
  normalizeEmail,
  sendVerificationEmail,
  setCustomerSession,
  transferDiscordIdentity,
  verifyPassword,
  type AuthActionResult,
} from "@/lib/auth";
import { generateActivationCode } from "@/lib/discord/activation";

function isEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function normalizePhone(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function isValidOptionalPhone(value: string) {
  if (!value) return true;
  if (!/^\+?[0-9][0-9\s().-]*$/.test(value)) return false;
  const digits = value.replace(/\D/g, "");
  return digits.length >= 9 && digits.length <= 15;
}

/**
 * Path A of Discord onboarding: replace the internal placeholder email with a
 * real name/email/phone and send email verification. Never merges on a matching
 * email — a collision is surfaced so the customer uses the link-existing path.
 */
export async function completeDiscordProfileAction(input: {
  name: string;
  email: string;
  phone?: string;
}): Promise<AuthActionResult> {
  await ensureDatabaseReady();
  const customer = await getCurrentCustomer();
  if (!customer) return { ok: false, error: "Veuillez vous connecter." };
  if (!customer.discordId) return { ok: false, error: "Compte Discord introuvable." };

  const name = input.name.trim();
  const email = normalizeEmail(input.email);
  const phone = normalizePhone(input.phone ?? "");
  if (!name) return { ok: false, error: "Veuillez saisir votre nom complet." };
  if (!isEmail(email)) return { ok: false, error: "Veuillez saisir une adresse e-mail valide." };
  if (!isValidOptionalPhone(phone)) {
    return { ok: false, error: "Veuillez saisir un numéro de téléphone valide." };
  }

  const emailOwner = await prisma.customer.findUnique({ where: { email } });
  if (emailOwner && emailOwner.id !== customer.id) {
    return {
      ok: false,
      error:
        "Un compte existe déjà avec cette adresse e-mail. Utilisez « J’ai déjà un compte » pour y associer Discord.",
    };
  }

  try {
    const updated = await prisma.customer.update({
      where: { id: customer.id },
      data: {
        name,
        email,
        phone: phone || null,
        emailVerified: false,
        emailVerifiedAt: null,
      },
    });
    // Real email now — verification can actually be delivered.
    try {
      await sendVerificationEmail(updated);
    } catch (error) {
      console.error("[discord:complete:verification_email]", error);
    }
    revalidatePath("/account");
    return {
      ok: true,
      message: "Profil finalisé. Vérifiez votre e-mail pour confirmer votre adresse.",
      redirectTo: "/account",
    };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return {
        ok: false,
        error:
          "Un compte existe déjà avec cette adresse e-mail. Utilisez « J’ai déjà un compte » pour y associer Discord.",
      };
    }
    console.error("[discord:complete]", error);
    return { ok: false, error: "Impossible de finaliser le profil pour le moment." };
  }
}

/**
 * Path B (email/password): authenticate an existing account and move the
 * current Discord identity onto it, then switch the session to that account.
 */
export async function linkDiscordToExistingByPasswordAction(input: {
  email: string;
  password: string;
}): Promise<AuthActionResult> {
  await ensureDatabaseReady();
  const current = await getCurrentCustomer();
  if (!current) return { ok: false, error: "Veuillez vous connecter." };
  if (!current.discordId || !isPlaceholderEmail(current.email)) {
    return { ok: false, error: "Cette action n’est disponible que pendant la finalisation Discord." };
  }

  const email = normalizeEmail(input.email);
  const target = await prisma.customer.findUnique({ where: { email } });
  const valid = await verifyPassword(input.password, target?.passwordHash ?? null);
  if (!target || !valid) {
    return { ok: false, error: "E-mail ou mot de passe incorrect." };
  }
  if (target.id === current.id) {
    return { ok: false, error: "Choisissez un autre compte." };
  }
  if (target.discordId) {
    return { ok: false, error: "Ce compte a déjà un Discord associé." };
  }

  const result = await transferDiscordIdentity(current.id, target.id);
  if (!result.ok) {
    return {
      ok: false,
      error:
        result.error === "already_linked"
          ? "Ce compte a déjà un Discord associé."
          : "Association impossible pour le moment.",
    };
  }
  await setCustomerSession(target.id, true);
  revalidatePath("/account");
  return { ok: true, message: "Discord associé à votre compte.", redirectTo: "/account" };
}

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
