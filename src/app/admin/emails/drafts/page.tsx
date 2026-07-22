import { redirect } from "next/navigation";
import { requireAdminCustomer } from "@/lib/auth";
import { toAdminIdentity } from "@/lib/adminIdentity";
import AdminShellRoute from "@/components/admin/AdminShellRoute";
import EmailDraftsView from "@/components/admin/emails/EmailDraftsView";
import { getAdminPermissions, resolveEmailPermissions } from "@/lib/admin/permissions";
import { listDrafts } from "@/lib/email/adminEmailService";

export const dynamic = "force-dynamic";

export default async function EmailDraftsPage() {
  const admin = await requireAdminCustomer();
  const permissions = resolveEmailPermissions(await getAdminPermissions(admin.id));
  if (!permissions.view) redirect("/403");

  const drafts = await listDrafts();

  return (
    <AdminShellRoute active="emails" admin={toAdminIdentity(admin.name, admin.role)}>
      <EmailDraftsView drafts={drafts} canCompose={permissions.compose} />
    </AdminShellRoute>
  );
}
