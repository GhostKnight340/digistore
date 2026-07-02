import AdminDashboard from "@/components/admin/AdminDashboard";
import { requireAdminCustomer } from "@/lib/auth";
import type { AdminIdentity } from "@/components/admin/AdminShell";

export const dynamic = "force-dynamic";

function toIdentity(name: string, role: string): AdminIdentity {
  const trimmed = name.trim() || "Admin";
  const parts = trimmed.split(/\s+/);
  const initials = (parts[0]?.[0] ?? "A") + (parts.length > 1 ? parts[parts.length - 1][0] : "");
  return {
    name: trimmed,
    roleLabel: role === "ADMIN" ? "Administrateur" : role,
    initials: initials.toUpperCase(),
  };
}

export default async function AdminPage() {
  const customer = await requireAdminCustomer();
  return <AdminDashboard admin={toIdentity(customer.name, customer.role)} />;
}
