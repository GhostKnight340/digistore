import type { AdminIdentity } from "@/components/admin/AdminShell";

/** Build the sidebar identity (name, role label, initials) from a customer record. */
export function toAdminIdentity(name: string, role: string): AdminIdentity {
  const trimmed = name.trim() || "Admin";
  const parts = trimmed.split(/\s+/);
  const initials = (parts[0]?.[0] ?? "A") + (parts.length > 1 ? parts[parts.length - 1][0] : "");
  return {
    name: trimmed,
    roleLabel: role === "ADMIN" ? "Administrateur" : role,
    initials: initials.toUpperCase(),
  };
}
