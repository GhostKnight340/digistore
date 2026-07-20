import { notFound, redirect } from "next/navigation";
import { requireAdminCustomer } from "@/lib/auth";
import { toAdminIdentity } from "@/lib/adminIdentity";
import AdminShellRoute from "@/components/admin/AdminShellRoute";
import EmailSendDetail from "@/components/admin/emails/EmailSendDetail";
import { getAdminPermissions, resolveEmailPermissions } from "@/lib/admin/permissions";
import { getEmailSendDetail } from "@/lib/email/adminEmailService";

export const dynamic = "force-dynamic";

export default async function EmailSendDetailPage({
  params,
}: {
  params: Promise<{ sendId: string }>;
}) {
  const admin = await requireAdminCustomer();
  const permissions = resolveEmailPermissions(await getAdminPermissions(admin.id));
  if (!permissions.view) redirect("/403");

  const { sendId } = await params;
  const detail = await getEmailSendDetail(sendId);
  if (!detail) notFound();

  return (
    <AdminShellRoute active="emails" admin={toAdminIdentity(admin.name, admin.role)}>
      <EmailSendDetail detail={detail} canRetry={permissions.send} />
    </AdminShellRoute>
  );
}
