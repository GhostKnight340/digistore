import "server-only";

import { redirect } from "next/navigation";
import { prisma, ensureDatabaseReady } from "@/lib/db/prisma";
import { requireAdminCustomer, type AuthCustomer } from "@/lib/auth";
import {
  EMAIL_PERMISSIONS,
  permissionAllowed,
  type AdminPermission,
} from "./permissionRules";

/**
 * Granular admin permissions for the Admin Email Composer — server-side
 * enforcement layer. The PURE rules (constants + checks) live in
 * ./permissionRules; this file adds the DB read + require/assert helpers.
 *
 * The store's only role today is a coarse "ADMIN". Rather than reworking the
 * whole role model, admins carry an optional explicit permission list
 * (Customer.adminPermissions):
 *
 *   • An ADMIN with NO explicit permissions keeps FULL access (legacy admins are
 *     unaffected — nothing to migrate).
 *   • An ADMIN with an explicit list is RESTRICTED to exactly that list, so a
 *     support agent can be granted EMAIL_VIEW/EMAIL_COMPOSE/EMAIL_SEND but NOT
 *     CREDIT_GRANT — they may compose and send e-mails but can never activate a
 *     real Ghost Credit grant.
 *
 * Permissions are ALWAYS enforced server-side; the client only receives the
 * resolved booleans to hide/disable controls (never as a trust boundary).
 */
export {
  EMAIL_PERMISSIONS,
  ALL_EMAIL_PERMISSIONS,
  permissionAllowed,
  resolveEmailPermissions,
  type AdminPermission,
} from "./permissionRules";

/** Read an admin's explicit permission list from the database. */
export async function getAdminPermissions(customerId: string): Promise<string[]> {
  await ensureDatabaseReady();
  const row = await prisma.customer.findUnique({
    where: { id: customerId },
    select: { adminPermissions: true },
  });
  return row?.adminPermissions ?? [];
}

export type EmailAdmin = {
  id: string;
  name: string;
  permissions: string[];
};

/**
 * Require an authenticated ADMIN and return their identity plus resolved
 * permission list. Redirects to /login or /403 exactly like requireAdminCustomer.
 */
export async function requireEmailAdmin(): Promise<EmailAdmin> {
  const admin = await requireAdminCustomer();
  const permissions = await getAdminPermissions(admin.id);
  return { id: admin.id, name: admin.name, permissions };
}

/**
 * Require an admin that holds a specific permission. Admins missing the
 * permission are sent to /403 — this is the SERVER-SIDE gate that every
 * permission-bearing action and page must call. Never trust a client check.
 */
export async function requireEmailPermission(permission: AdminPermission): Promise<EmailAdmin> {
  const admin = await requireEmailAdmin();
  if (!permissionAllowed(admin.permissions, permission)) redirect("/403");
  return admin;
}

/**
 * Assert a permission for use inside a server action that returns an
 * ActionResult (no redirect). Returns the admin when allowed, or throws a
 * typed error the caller maps to `{ ok: false }`.
 */
export class PermissionError extends Error {
  constructor(public readonly permission: AdminPermission) {
    super(`Permission requise : ${permission}`);
    this.name = "PermissionError";
  }
}

export async function assertEmailPermission(permission: AdminPermission): Promise<EmailAdmin> {
  const admin = await requireEmailAdmin();
  if (!permissionAllowed(admin.permissions, permission)) {
    throw new PermissionError(permission);
  }
  return admin;
}

export function isAdmin(customer: Pick<AuthCustomer, "role"> | null | undefined): boolean {
  return customer?.role === "ADMIN";
}
