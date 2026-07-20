/**
 * Admin permission RULES — pure, dependency-free (no server-only, no next
 * imports) so they are unit-testable and safe to import anywhere. The
 * server-only enforcement helpers (require / assert) live in ./permissions.
 */

export const EMAIL_PERMISSIONS = {
  VIEW: "EMAIL_VIEW",
  COMPOSE: "EMAIL_COMPOSE",
  SEND: "EMAIL_SEND",
  CREDIT_GRANT: "CREDIT_GRANT",
} as const;

export type AdminPermission = (typeof EMAIL_PERMISSIONS)[keyof typeof EMAIL_PERMISSIONS];

export const ALL_EMAIL_PERMISSIONS: AdminPermission[] = [
  EMAIL_PERMISSIONS.VIEW,
  EMAIL_PERMISSIONS.COMPOSE,
  EMAIL_PERMISSIONS.SEND,
  EMAIL_PERMISSIONS.CREDIT_GRANT,
];

/**
 * `granted` is the admin's explicit permission list (Customer.adminPermissions).
 * An empty list means "legacy full admin" and grants everything; a non-empty
 * list restricts the admin to exactly those permissions.
 */
export function permissionAllowed(
  granted: readonly string[] | null | undefined,
  permission: AdminPermission,
): boolean {
  const list = granted ?? [];
  if (list.length === 0) return true; // legacy full-access admin
  return list.includes(permission);
}

export function resolveEmailPermissions(granted: readonly string[] | null | undefined): {
  view: boolean;
  compose: boolean;
  send: boolean;
  creditGrant: boolean;
} {
  return {
    view: permissionAllowed(granted, EMAIL_PERMISSIONS.VIEW),
    compose: permissionAllowed(granted, EMAIL_PERMISSIONS.COMPOSE),
    send: permissionAllowed(granted, EMAIL_PERMISSIONS.SEND),
    creditGrant: permissionAllowed(granted, EMAIL_PERMISSIONS.CREDIT_GRANT),
  };
}
