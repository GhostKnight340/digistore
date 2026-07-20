import { redirect } from "next/navigation";
import { requireAdminCustomer } from "@/lib/auth";
import { toAdminIdentity } from "@/lib/adminIdentity";
import AdminShellRoute from "@/components/admin/AdminShellRoute";
import EmailHistoryView from "@/components/admin/emails/EmailHistoryView";
import { getAdminPermissions, resolveEmailPermissions } from "@/lib/admin/permissions";
import { listEmailHistory, listDrafts } from "@/lib/email/adminEmailService";

export const dynamic = "force-dynamic";

export default async function EmailHistoryPage() {
  const admin = await requireAdminCustomer();
  const permissions = resolveEmailPermissions(await getAdminPermissions(admin.id));
  if (!permissions.view) redirect("/403");

  const [history, drafts] = await Promise.all([listEmailHistory(), listDrafts()]);

  return (
    <AdminShellRoute active="emails" admin={toAdminIdentity(admin.name, admin.role)}>
      <EmailHistoryView history={history} drafts={drafts} />
    </AdminShellRoute>
  );
}
