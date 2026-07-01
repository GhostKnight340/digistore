import "server-only";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { randomBytes, scrypt, timingSafeEqual, createHash, createHmac } from "crypto";
import { promisify } from "util";
import { prisma, ensureDatabaseReady } from "@/lib/db/prisma";
import { sendTransactionalEmail } from "@/lib/email/send-email";
import { formatPublicOrderNumber, formatPublicOrderPathSegment } from "@/lib/orderNumber";

const scryptAsync = promisify(scrypt);
const SESSION_COOKIE = "ghost_customer_session";
const EMAIL_VERIFICATION_TTL_HOURS = 24;
const PASSWORD_RESET_TTL_MINUTES = 45;

type AuthTokenType = "email_verification" | "password_reset";

export type AuthCustomer = {
  id: string;
  name: string;
  firstName: string | null;
  lastName: string | null;
  email: string;
  phone: string | null;
  image: string | null;
  googleId: string | null;
  emailVerified: boolean;
  emailVerifiedAt: Date | null;
  lastLoginAt: Date | null;
  lastPasswordChangeAt: Date | null;
  createdAt: Date;
};

export type AuthActionResult = {
  ok: boolean;
  error?: string;
  message?: string;
  redirectTo?: string;
};

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function authSecret() {
  const configured =
    process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET || process.env.SESSION_SECRET;
  if (configured) return configured;
  if (process.env.NODE_ENV === "production") {
    throw new Error("AUTH_SECRET, NEXTAUTH_SECRET, or SESSION_SECRET must be configured.");
  }
  return "ghost.ma-development-session-secret";
}

async function baseUrl() {
  const configured = process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL;
  if (configured) return configured.replace(/\/$/, "");
  let host = "localhost:3000";
  try {
    host = (await headers()).get("host") || host;
  } catch {
    // Some server-side invocations do not expose request headers. Use a stable
    // fallback instead of failing token-email generation.
  }
  const proto = host.includes("localhost") ? "http" : "https";
  return `${proto}://${host}`;
}

function sign(value: string) {
  return createHmac("sha256", authSecret()).update(value).digest("base64url");
}

function encodeSession(customerId: string, expiresAt: Date) {
  const payload = Buffer.from(
    JSON.stringify({ customerId, exp: expiresAt.getTime() }),
  ).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

function decodeSession(value?: string) {
  if (!value) return null;
  const [payload, signature] = value.split(".");
  if (!payload || !signature || sign(payload) !== signature) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
      customerId?: string;
      exp?: number;
    };
    if (!parsed.customerId || !parsed.exp || parsed.exp < Date.now()) return null;
    return parsed.customerId;
  } catch {
    return null;
  }
}

export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("base64url");
  const key = (await scryptAsync(password, salt, 64)) as Buffer;
  return `scrypt:${salt}:${key.toString("base64url")}`;
}

export async function verifyPassword(password: string, stored: string | null) {
  if (!stored) return false;
  const [scheme, salt, key] = stored.split(":");
  if (scheme !== "scrypt" || !salt || !key) return false;
  const derived = (await scryptAsync(password, salt, 64)) as Buffer;
  const saved = Buffer.from(key, "base64url");
  return saved.length === derived.length && timingSafeEqual(saved, derived);
}

export function validatePassword(password: string) {
  if (password.length < 8) return "Le mot de passe doit contenir au moins 8 caractères.";
  if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
    return "Utilisez au moins une lettre et un chiffre.";
  }
  return null;
}

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

async function tokenUrl(path: string, token: string) {
  return `${await baseUrl()}${path}?token=${encodeURIComponent(token)}`;
}

async function createToken(customerId: string, type: AuthTokenType) {
  await ensureDatabaseReady();
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(
    Date.now() +
      (type === "email_verification"
        ? EMAIL_VERIFICATION_TTL_HOURS * 60 * 60 * 1000
        : PASSWORD_RESET_TTL_MINUTES * 60 * 1000),
  );
  await prisma.$transaction(async (tx) => {
    await tx.authToken.updateMany({
      where: {
        customerId,
        type,
        usedAt: null,
        expiresAt: { gt: new Date() },
      },
      data: { usedAt: new Date() },
    });
    await tx.authToken.create({
      data: {
        customerId,
        type,
        tokenHash: hashToken(token),
        expiresAt,
      },
    });
  });
  return token;
}

export async function sendVerificationEmail(customer: {
  id: string;
  name: string;
  email: string;
}) {
  const token = await createToken(customer.id, "email_verification");
  return sendTransactionalEmail({
    to: customer.email,
    customerId: customer.id,
    templateKey: "email_verification",
    type: "email_verification",
    variables: {
      customer_name: customer.name,
      verification_url: await tokenUrl("/verify-email", token),
      account_url: `${await baseUrl()}/account`,
    },
    metadata: { auth_event: "email_verification" },
  });
}

export async function sendPasswordResetEmail(customer: {
  id: string;
  name: string;
  email: string;
}) {
  const token = await createToken(customer.id, "password_reset");
  return sendTransactionalEmail({
    to: customer.email,
    customerId: customer.id,
    templateKey: "password_reset",
    type: "password_reset",
    variables: {
      customer_name: customer.name,
      reset_password_url: await tokenUrl("/reset-password", token),
      account_url: `${await baseUrl()}/account`,
    },
    metadata: { auth_event: "password_reset" },
  });
}

export async function sendPasswordChangedEmail(customer: {
  id: string;
  name: string;
  email: string;
}) {
  return sendTransactionalEmail({
    to: customer.email,
    customerId: customer.id,
    templateKey: "password_changed",
    type: "password_changed",
    variables: {
      customer_name: customer.name,
      account_url: `${await baseUrl()}/account/security`,
    },
    metadata: { auth_event: "password_changed" },
  });
}

export async function sendWelcomeEmail(customer: { id: string; name: string; email: string }) {
  return sendTransactionalEmail({
    to: customer.email,
    customerId: customer.id,
    templateKey: "welcome",
    type: "welcome",
    variables: {
      customer_name: customer.name,
      account_url: `${await baseUrl()}/account`,
    },
    metadata: { auth_event: "welcome" },
  });
}

export async function setCustomerSession(customerId: string, remember: boolean) {
  const expiresAt = new Date(Date.now() + (remember ? 30 : 1) * 24 * 60 * 60 * 1000);
  (await cookies()).set(SESSION_COOKIE, encodeSession(customerId, expiresAt), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
}

export async function clearCustomerSession() {
  (await cookies()).delete(SESSION_COOKIE);
}

export async function getCurrentCustomer(): Promise<AuthCustomer | null> {
  await ensureDatabaseReady();
  const customerId = decodeSession((await cookies()).get(SESSION_COOKIE)?.value);
  if (!customerId) return null;
  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    select: {
      id: true,
      name: true,
      firstName: true,
      lastName: true,
      email: true,
      phone: true,
      image: true,
      googleId: true,
      emailVerified: true,
      emailVerifiedAt: true,
      lastLoginAt: true,
      lastPasswordChangeAt: true,
      createdAt: true,
      passwordHash: true,
    },
  });
  if (!customer || (!customer.passwordHash && !customer.googleId)) return null;
  return {
    id: customer.id,
    name: customer.name,
    firstName: customer.firstName,
    lastName: customer.lastName,
    email: customer.email,
    phone: customer.phone,
    image: customer.image,
    googleId: customer.googleId,
    emailVerified: customer.emailVerified,
    emailVerifiedAt: customer.emailVerifiedAt,
    lastLoginAt: customer.lastLoginAt,
    lastPasswordChangeAt: customer.lastPasswordChangeAt,
    createdAt: customer.createdAt,
  };
}

export async function requireCustomer() {
  const customer = await getCurrentCustomer();
  if (!customer) redirect("/login");
  return customer;
}

export async function consumeAuthToken(token: string, type: AuthTokenType) {
  await ensureDatabaseReady();
  if (!token) return null;
  const now = new Date();
  const found = await prisma.authToken.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { customer: true },
  });
  if (!found || found.type !== type || found.usedAt || found.expiresAt < now) {
    return null;
  }
  await prisma.authToken.update({
    where: { id: found.id },
    data: { usedAt: now },
  });
  return found.customer;
}

export async function getAccountOrders(customerId: string) {
  await ensureDatabaseReady();
  const orders = await prisma.order.findMany({
    where: { customerId },
    orderBy: { createdAt: "desc" },
    take: 25,
    select: {
      id: true,
      status: true,
      totalMad: true,
      createdAt: true,
      items: {
        select: {
          id: true,
          quantity: true,
          unitPriceMad: true,
          product: { select: { name: true } },
          variant: { select: { name: true, faceValue: true, faceCurrency: true } },
        },
      },
    },
  });

  return Promise.all(
    orders.map(async (order) => {
      const earlierOrders = await prisma.order.count({
        where: {
          OR: [
            { createdAt: { lt: order.createdAt } },
            { createdAt: order.createdAt, id: { lt: order.id } },
          ],
        },
      });
      return {
        ...order,
        publicOrderNumber: formatPublicOrderNumber(earlierOrders + 1),
        publicOrderPathSegment: formatPublicOrderPathSegment(earlierOrders + 1),
      };
    }),
  );
}

export { normalizeEmail };
