"use server";

import { revalidatePath } from "next/cache";
import {
  getCurrentCustomer,
  hashPassword,
  normalizeEmail,
  setCustomerSession,
  validatePassword,
} from "@/lib/auth";
import {
  confirmVerificationCode,
  getCheckoutSessionId,
  hasVerifiedProof,
  requestVerificationCode,
  type ConfirmCodeResult,
  type RequestCodeResult,
} from "@/lib/checkout/emailVerification";
import { createVerifiedAccountAndOrder } from "@/lib/db/orders";
import { isOrderingCurrentlyEnabled } from "@/lib/db/ordering";

function isEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

/**
 * Send a six-digit verification code to the entered email. Creates NO account
 * and NO order, and never returns the code. Guides an existing account to login
 * instead of silently doing nothing.
 */
export async function requestCheckoutCodeAction(input: {
  email: string;
  name?: string;
}): Promise<RequestCodeResult> {
  // A logged-in customer verifying their own account email must still receive a
  // code (they are not creating a new account).
  const customer = await getCurrentCustomer();
  return requestVerificationCode(input.email, input.name, { selfEmail: customer?.email ?? null });
}

/** Confirm the six-digit code for the entered email against the checkout session. */
export async function confirmCheckoutCodeAction(input: {
  email: string;
  code: string;
}): Promise<ConfirmCodeResult> {
  // A logged-in customer verifying their OWN account email marks that account
  // verified — pass their identity so confirm can update it.
  const customer = await getCurrentCustomer();
  const result = await confirmVerificationCode(
    input.email,
    input.code,
    customer ? { id: customer.id, email: customer.email } : null,
  );
  if (result.status === "verified" && customer) {
    revalidatePath("/checkout");
    revalidatePath("/account/security");
  }
  return result;
}

export type RegisterAndOrderResult =
  | {
      ok: true;
      order: {
        id: string;
        publicOrderNumber: string;
        publicOrderPathSegment: string;
        accessToken: string | null;
      };
    }
  | { ok: false; error?: string; accountExists?: boolean };

/**
 * Atomic inline registration + order creation. The server independently
 * re-validates the email-verification proof (never a client flag), the password
 * rules, and that no real account already exists — then creates the account and
 * order in one transaction, logs the customer in, and returns the payment link.
 */
export async function registerAndCreateOrderAction(input: {
  name: string;
  email: string;
  password: string;
  confirmPassword: string;
  acceptTerms: boolean;
  phone?: string;
  items: { productId: string; quantity: number }[];
  promoCode?: string;
}): Promise<RegisterAndOrderResult> {
  if (!(await isOrderingCurrentlyEnabled())) {
    return { ok: false, error: "Les commandes sont momentanément indisponibles." };
  }

  // Already authenticated? Registration does not apply — the normal authenticated
  // checkout action handles this customer. Ask the client to refresh.
  const existingSession = await getCurrentCustomer();
  if (existingSession) {
    return { ok: false, error: "Vous êtes déjà connecté. Actualisez la page pour continuer." };
  }

  const name = input.name.trim();
  const email = normalizeEmail(input.email);
  if (name.length < 2) return { ok: false, error: "Veuillez saisir votre nom complet." };
  if (!isEmail(email)) return { ok: false, error: "Veuillez saisir une adresse e-mail valide." };
  if (!input.acceptTerms) return { ok: false, error: "Veuillez accepter les conditions." };
  if (input.password !== input.confirmPassword) {
    return { ok: false, error: "Les mots de passe ne correspondent pas." };
  }
  const passwordError = validatePassword(input.password);
  if (passwordError) return { ok: false, error: passwordError };

  const sessionId = await getCheckoutSessionId();
  if (!sessionId || !(await hasVerifiedProof(email, sessionId))) {
    return {
      ok: false,
      error: "Vérifiez votre adresse e-mail pour continuer vers le paiement.",
    };
  }

  const passwordHash = await hashPassword(input.password);
  const result = await createVerifiedAccountAndOrder({
    name,
    email,
    passwordHash,
    phone: input.phone,
    sessionId,
    items: input.items,
    promoCode: input.promoCode,
  });

  if (!result) {
    return { ok: false, error: "Une erreur est survenue. Veuillez réessayer." };
  }
  if ("accountExists" in result) {
    return { ok: false, accountExists: true };
  }
  if ("error" in result) {
    return { ok: false, error: result.error };
  }

  // Authenticate the brand-new customer so the payment page uses normal
  // authenticated order authorization.
  await setCustomerSession(result.customerId, false);
  revalidatePath("/account");
  revalidatePath("/account/orders");

  return {
    ok: true,
    order: {
      id: result.id,
      publicOrderNumber: result.publicOrderNumber,
      publicOrderPathSegment: result.publicOrderPathSegment,
      accessToken: result.accessToken,
    },
  };
}
