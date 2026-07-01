"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma, ensureDatabaseReady } from "@/lib/db/prisma";
import {
  clearCustomerSession,
  consumeAuthToken,
  getCurrentCustomer,
  hashPassword,
  normalizeEmail,
  sendPasswordChangedEmail,
  sendPasswordResetEmail,
  sendVerificationEmail,
  sendWelcomeEmail,
  setCustomerSession,
  validatePassword,
  verifyPassword,
  type AuthActionResult,
} from "@/lib/auth";

const loginAttempts = new Map<string, { count: number; resetAt: number }>();

function isEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function checkLoginRateLimit(email: string) {
  const now = Date.now();
  const key = email.toLowerCase();
  const bucket = loginAttempts.get(key);
  if (!bucket || bucket.resetAt < now) {
    loginAttempts.set(key, { count: 1, resetAt: now + 15 * 60 * 1000 });
    return true;
  }
  bucket.count += 1;
  return bucket.count <= 8;
}

export async function registerCustomerAction(input: {
  name: string;
  email: string;
  password: string;
  confirmPassword: string;
  acceptTerms: boolean;
  marketingOptIn?: boolean;
}): Promise<AuthActionResult> {
  try {
    await ensureDatabaseReady();
    const name = input.name.trim();
    const email = normalizeEmail(input.email);
    if (!name || !isEmail(email)) return { ok: false, error: "Veuillez vérifier vos informations." };
    if (!input.acceptTerms) return { ok: false, error: "Veuillez accepter les conditions." };
    if (input.password !== input.confirmPassword) {
      return { ok: false, error: "Les mots de passe ne correspondent pas." };
    }
    const passwordError = validatePassword(input.password);
    if (passwordError) return { ok: false, error: passwordError };

    const existing = await prisma.customer.findUnique({ where: { email } });
    if (existing?.passwordHash) {
      return { ok: false, error: "Un compte existe déjà avec cette adresse e-mail." };
    }

    const passwordHash = await hashPassword(input.password);
    const customer = existing
      ? await prisma.customer.update({
          where: { id: existing.id },
          data: { name, passwordHash, emailVerified: false, emailVerifiedAt: null },
        })
      : await prisma.customer.create({
          data: { name, email, passwordHash, emailVerified: false },
        });

    let verificationEmailSent = true;
    try {
      const emailResult = await sendVerificationEmail(customer);
      verificationEmailSent = emailResult.ok;
      if (!emailResult.ok) {
        console.error("[auth:register:verification_email_failed]", {
          customerId: customer.id,
          email,
          status: emailResult.status,
          error: emailResult.error,
        });
      }
    } catch (error) {
      verificationEmailSent = false;
      console.error("[auth:register:verification_email_error]", {
        customerId: customer.id,
        email,
        error,
      });
    }

    try {
      await setCustomerSession(customer.id, false);
    } catch (error) {
      console.error("[auth:register:session_error]", {
        customerId: customer.id,
        email,
        error,
      });
    }

    revalidatePath("/account");
    return {
      ok: true,
      message: verificationEmailSent
        ? "Compte créé. Vérifiez votre e-mail pour activer votre compte."
        : "Compte créé, mais l’e-mail de vérification n’a pas pu être envoyé. Vous pourrez le renvoyer.",
    };
  } catch (error) {
    console.error("[auth:register:error]", {
      name: error instanceof Error ? error.name : "UnknownError",
      message: error instanceof Error ? error.message : String(error),
      code:
        error instanceof Prisma.PrismaClientKnownRequestError
          ? error.code
          : undefined,
    });
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { ok: false, error: "Un compte existe déjà avec cette adresse e-mail." };
    }
    return {
      ok: false,
      error: "Impossible de créer le compte pour le moment. Veuillez réessayer.",
    };
  }
}

export async function loginCustomerAction(input: {
  email: string;
  password: string;
  remember: boolean;
}): Promise<AuthActionResult> {
  await ensureDatabaseReady();
  const email = normalizeEmail(input.email);
  if (!checkLoginRateLimit(email)) {
    return { ok: false, error: "Connexion momentanément indisponible. Réessayez plus tard." };
  }
  const customer = await prisma.customer.findUnique({ where: { email } });
  const valid = await verifyPassword(input.password, customer?.passwordHash ?? null);
  if (!customer || !valid) {
    return { ok: false, error: "E-mail ou mot de passe incorrect." };
  }
  await prisma.customer.update({
    where: { id: customer.id },
    data: { lastLoginAt: new Date() },
  });
  await setCustomerSession(customer.id, input.remember);
  revalidatePath("/account");
  return { ok: true, redirectTo: "/account/orders" };
}

export async function logoutCustomerAction(): Promise<AuthActionResult> {
  await clearCustomerSession();
  revalidatePath("/account");
  return { ok: true, redirectTo: "/login" };
}

export async function requestPasswordResetAction(emailInput: string): Promise<AuthActionResult> {
  await ensureDatabaseReady();
  const email = normalizeEmail(emailInput);
  const customer = isEmail(email)
    ? await prisma.customer.findUnique({ where: { email } })
    : null;
  if (customer?.passwordHash) {
    await sendPasswordResetEmail(customer);
  }
  return {
    ok: true,
    message: "Si un compte existe pour cette adresse, un lien de réinitialisation vient d'être envoyé.",
  };
}

export async function resetPasswordAction(input: {
  token: string;
  password: string;
  confirmPassword: string;
}): Promise<AuthActionResult> {
  await ensureDatabaseReady();
  if (input.password !== input.confirmPassword) {
    return { ok: false, error: "Les mots de passe ne correspondent pas." };
  }
  const passwordError = validatePassword(input.password);
  if (passwordError) return { ok: false, error: passwordError };

  const customer = await consumeAuthToken(input.token, "password_reset");
  if (!customer) return { ok: false, error: "Lien invalide ou expiré." };
  const updated = await prisma.customer.update({
    where: { id: customer.id },
    data: {
      passwordHash: await hashPassword(input.password),
      lastPasswordChangeAt: new Date(),
    },
  });
  await sendPasswordChangedEmail(updated);
  return { ok: true, message: "Mot de passe modifié.", redirectTo: "/login" };
}

export async function verifyEmailAction(token: string): Promise<AuthActionResult> {
  await ensureDatabaseReady();
  const customer = await consumeAuthToken(token, "email_verification");
  if (!customer) return { ok: false, error: "Lien invalide ou expiré." };
  const firstVerification = !customer.emailVerified;
  const updated = await prisma.customer.update({
    where: { id: customer.id },
    data: { emailVerified: true, emailVerifiedAt: new Date() },
  });
  if (firstVerification) await sendWelcomeEmail(updated);
  revalidatePath("/account");
  return { ok: true, message: "Votre e-mail est vérifié.", redirectTo: "/account" };
}

export async function resendVerificationAction(): Promise<AuthActionResult> {
  try {
    const customer = await getCurrentCustomer();
    if (!customer) return { ok: false, error: "Veuillez vous connecter." };
    if (customer.emailVerified) return { ok: true, message: "Votre e-mail est déjà vérifié." };

    const result = await sendVerificationEmail(customer);
    if (!result.ok) {
      console.error("[auth:resend_verification:email_failed]", {
        customerId: customer.id,
        email: customer.email,
        status: result.status,
        logId: result.logId,
        error: result.error,
        hasResendApiKey: Boolean(process.env.RESEND_API_KEY),
        enableRealEmails: process.env.ENABLE_REAL_EMAILS,
      });
      return {
        ok: false,
        error: "L'e-mail de vérification n'a pas pu être envoyé. Réessayez plus tard.",
      };
    }
    return { ok: true, message: "E-mail de vérification envoyé." };
  } catch (error) {
    console.error("[auth:resend_verification:error]", {
      name: error instanceof Error ? error.name : "UnknownError",
      message: error instanceof Error ? error.message : String(error),
    });
    return {
      ok: false,
      error: "L'e-mail de vérification n'a pas pu être envoyé. Réessayez plus tard.",
    };
  }
}

export async function changePasswordAction(input: {
  currentPassword: string;
  password: string;
  confirmPassword: string;
}): Promise<AuthActionResult> {
  await ensureDatabaseReady();
  const sessionCustomer = await getCurrentCustomer();
  if (!sessionCustomer) return { ok: false, error: "Veuillez vous connecter." };
  if (input.password !== input.confirmPassword) {
    return { ok: false, error: "Les mots de passe ne correspondent pas." };
  }
  const passwordError = validatePassword(input.password);
  if (passwordError) return { ok: false, error: passwordError };

  const customer = await prisma.customer.findUnique({ where: { id: sessionCustomer.id } });
  const valid = await verifyPassword(input.currentPassword, customer?.passwordHash ?? null);
  if (!customer || !valid) return { ok: false, error: "Mot de passe actuel incorrect." };

  const updated = await prisma.customer.update({
    where: { id: customer.id },
    data: {
      passwordHash: await hashPassword(input.password),
      lastPasswordChangeAt: new Date(),
    },
  });
  await sendPasswordChangedEmail(updated);
  revalidatePath("/account/security");
  return { ok: true, message: "Mot de passe modifié." };
}
