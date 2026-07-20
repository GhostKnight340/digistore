import "server-only";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { randomBytes, scrypt, timingSafeEqual, createHash, createHmac } from "crypto";
import { promisify } from "util";
import { prisma, ensureDatabaseReady } from "@/lib/db/prisma";
import { sendTransactionalEmail } from "@/lib/email/send-email";
import { formatPublicOrderNumber, formatPublicOrderPathSegment } from "@/lib/orderNumber";
import { isSessionActive } from "@/lib/sessionRevocation";

const scryptAsync = promisify(scrypt);
const SESSION_COOKIE = "ghost_customer_session";
const EMAIL_VERIFICATION_TTL_HOURS = 24;
const PASSWORD_RESET_TTL_MINUTES = 45;

type AuthTokenType = "email_verification" | "password_reset";

export type AuthCustomer = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  /** Optional date of birth (date-only; time component is meaningless). */
  birthday: Date | null;
  image: string | null;
  googleId: string | null;
  role: string;
  /** Admin-managed account status: "active" | "disabled" | "review" | "fraud_hold". */
  status: string;
  emailVerified: boolean;
  emailVerifiedAt: Date | null;
  lastLoginAt: Date | null;
  lastPasswordChangeAt: Date | null;
  createdAt: Date;
  // Whether a password or another OAuth provider still authenticates this
  // customer — used to decide if Discord can be safely disconnected.
  hasPassword: boolean;
  // Discord OAuth identity (login/link).
  discordId: string | null;
  discordUsername: string | null;
  discordGlobalName: string | null;
  discordAvatar: string | null;
  // Verified Discord DM state (set only by the DM worker).
  discordDmUserId: string | null;
  discordDmUsername: string | null;
  discordDmDisplayName: string | null;
  discordDmAvatar: string | null;
  discordDmActivated: boolean;
  discordDmActivatedAt: Date | null;
  discordOrderDeliveryEnabled: boolean;
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

// Discord's `identify` scope returns no email, and Ghost.ma never merges
// accounts on a provider email. A brand-new Discord account therefore gets a
// stable, non-deliverable placeholder address keyed to the Discord id until the
// customer completes their profile with a real email. This domain is internal
// only: placeholder addresses are never shown as the customer email, never
// receive mail, and never count as verified.
const PLACEHOLDER_EMAIL_DOMAIN = "users.noreply.ghost.ma";

export function buildPlaceholderEmail(discordId: string) {
  return `discord-${discordId}@${PLACEHOLDER_EMAIL_DOMAIN}`;
}

export function isPlaceholderEmail(email: string | null | undefined): boolean {
  return typeof email === "string" && email.toLowerCase().endsWith(`@${PLACEHOLDER_EMAIL_DOMAIN}`);
}

/** An account whose email is still the internal placeholder needs onboarding. */
export function isProfileIncomplete(
  customer: Pick<AuthCustomer, "email"> | { email: string },
): boolean {
  return isPlaceholderEmail(customer.email);
}

/**
 * Number of usable login methods for an account. A password only counts when
 * the account also has a real (non-placeholder) email, since email/password
 * login is impossible without a deliverable address. Used to prevent unlinking
 * the last method and locking the customer out.
 */
export function loginMethodCount(
  customer: Pick<AuthCustomer, "hasPassword" | "googleId" | "discordId" | "email">,
): number {
  let count = 0;
  if (customer.hasPassword && !isPlaceholderEmail(customer.email)) count += 1;
  if (customer.googleId) count += 1;
  if (customer.discordId) count += 1;
  return count;
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
  // `iat` (issued-at) is embedded so admin session-revocation can invalidate
  // cookies issued before a Customer.sessionsValidAfter anchor. See
  // src/lib/sessionRevocation.ts.
  const payload = Buffer.from(
    JSON.stringify({ customerId, exp: expiresAt.getTime(), iat: Date.now() }),
  ).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

function decodeSession(value?: string): { customerId: string; iat?: number } | null {
  if (!value) return null;
  const [payload, signature] = value.split(".");
  if (!payload || !signature || sign(payload) !== signature) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
      customerId?: string;
      exp?: number;
      iat?: number;
    };
    if (!parsed.customerId || !parsed.exp || parsed.exp < Date.now()) return null;
    // `iat` is optional so pre-existing cookies (no iat) still decode.
    return { customerId: parsed.customerId, iat: parsed.iat };
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
  const session = decodeSession((await cookies()).get(SESSION_COOKIE)?.value);
  if (!session) return null;
  const customer = await prisma.customer.findUnique({
    where: { id: session.customerId },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      birthday: true,
      image: true,
      googleId: true,
      role: true,
      status: true,
      sessionsValidAfter: true,
      emailVerified: true,
      emailVerifiedAt: true,
      lastLoginAt: true,
      lastPasswordChangeAt: true,
      createdAt: true,
      passwordHash: true,
      discordId: true,
      discordUsername: true,
      discordGlobalName: true,
      discordAvatar: true,
      discordDmUserId: true,
      discordDmUsername: true,
      discordDmDisplayName: true,
      discordDmAvatar: true,
      discordDmActivated: true,
      discordDmActivatedAt: true,
      discordOrderDeliveryEnabled: true,
    },
  });
  // A session is valid as long as SOME credential still authenticates the
  // customer: a password, Google, or Discord.
  if (!customer || (!customer.passwordHash && !customer.googleId && !customer.discordId)) {
    return null;
  }
  // A disabled account is treated as logged-out server-side (blocks login/
  // purchases) without deleting any data. A "deleted" (anonymized) account has
  // its credentials scrubbed and must never authenticate either.
  if (customer.status === "disabled" || customer.status === "deleted") return null;
  // Admin session revocation: reject cookies issued before the anchor.
  if (!isSessionActive(session.iat, customer.sessionsValidAfter)) return null;
  return {
    id: customer.id,
    name: customer.name,
    email: customer.email,
    phone: customer.phone,
    birthday: customer.birthday,
    image: customer.image,
    googleId: customer.googleId,
    role: customer.role,
    status: customer.status,
    emailVerified: customer.emailVerified,
    emailVerifiedAt: customer.emailVerifiedAt,
    lastLoginAt: customer.lastLoginAt,
    lastPasswordChangeAt: customer.lastPasswordChangeAt,
    createdAt: customer.createdAt,
    hasPassword: Boolean(customer.passwordHash),
    discordId: customer.discordId,
    discordUsername: customer.discordUsername,
    discordGlobalName: customer.discordGlobalName,
    discordAvatar: customer.discordAvatar,
    discordDmUserId: customer.discordDmUserId,
    discordDmUsername: customer.discordDmUsername,
    discordDmDisplayName: customer.discordDmDisplayName,
    discordDmAvatar: customer.discordDmAvatar,
    discordDmActivated: customer.discordDmActivated,
    discordDmActivatedAt: customer.discordDmActivatedAt,
    discordOrderDeliveryEnabled: customer.discordOrderDeliveryEnabled,
  };
}

/**
 * Whether a given provider can be safely disconnected without leaving the
 * customer with zero usable login methods. Safe only when at least one OTHER
 * method remains.
 */
export function canDisconnectProvider(
  customer: Pick<AuthCustomer, "hasPassword" | "googleId" | "discordId" | "email">,
  provider: "discord" | "google",
): boolean {
  const remaining = loginMethodCount(customer) - (provider === "discord" ? (customer.discordId ? 1 : 0) : (customer.googleId ? 1 : 0));
  return remaining >= 1;
}

/** Back-compat shim for the Discord DM card. */
export function canDisconnectDiscord(
  customer: Pick<AuthCustomer, "hasPassword" | "googleId" | "discordId" | "email">,
): boolean {
  return canDisconnectProvider(customer, "discord");
}

export async function requireCustomer() {
  const customer = await getCurrentCustomer();
  if (!customer) redirect("/login");
  return customer;
}

export function isAdminCustomer(customer: Pick<AuthCustomer, "role"> | null | undefined) {
  return customer?.role === "ADMIN";
}

export async function getCurrentAdminCustomer() {
  const customer = await getCurrentCustomer();
  return isAdminCustomer(customer) ? customer : null;
}

export async function requireAdminCustomer() {
  const customer = await getCurrentCustomer();
  if (!customer) redirect("/login?next=/admin");
  if (!isAdminCustomer(customer)) redirect("/403");
  return customer;
}

/**
 * Moves a Discord identity (OAuth + verified DM state) from an incomplete,
 * Discord-only account onto an existing target account, preserving the source's
 * orders and email history, then deletes the now-empty source. Transactional.
 * The caller must have proven control of BOTH accounts (OAuth for the Discord
 * source, a password/Google login for the target). Returns a typed result; on
 * success the caller should refresh the session to the target.
 */
export async function transferDiscordIdentity(
  fromId: string,
  toId: string,
): Promise<{ ok: boolean; error?: string }> {
  if (fromId === toId) return { ok: false, error: "same_account" };
  await ensureDatabaseReady();
  return prisma.$transaction(async (tx) => {
    const [from, to] = await Promise.all([
      tx.customer.findUnique({ where: { id: fromId } }),
      tx.customer.findUnique({ where: { id: toId } }),
    ]);
    if (!from || !to) return { ok: false, error: "not_found" };
    if (!from.discordId) return { ok: false, error: "no_discord" };
    if (to.discordId) return { ok: false, error: "already_linked" };

    // Preserve the source account's data before removing it.
    await tx.order.updateMany({ where: { customerId: fromId }, data: { customerId: toId } });
    await tx.emailLog.updateMany({ where: { customerId: fromId }, data: { customerId: toId } });

    // Delete the source FIRST so its unique discordId is freed before we assign
    // the same id to the target (unique constraint is checked per statement).
    await tx.customer.delete({ where: { id: fromId } });

    await tx.customer.update({
      where: { id: toId },
      data: {
        discordId: from.discordId,
        discordUsername: from.discordUsername,
        discordGlobalName: from.discordGlobalName,
        discordAvatar: from.discordAvatar,
        discordDmUserId: from.discordDmUserId,
        discordDmUsername: from.discordDmUsername,
        discordDmDisplayName: from.discordDmDisplayName,
        discordDmAvatar: from.discordDmAvatar,
        discordDmActivated: from.discordDmActivated,
        discordDmActivatedAt: from.discordDmActivatedAt,
        // Keep the target's own delivery preference if already on.
        discordOrderDeliveryEnabled:
          to.discordOrderDeliveryEnabled || from.discordOrderDeliveryEnabled,
        image: to.image ?? from.discordAvatar,
        authProvider: to.passwordHash
          ? "password_discord"
          : to.googleId
            ? "google_discord"
            : "discord",
      },
    });
    return { ok: true };
  });
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
