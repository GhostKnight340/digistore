import { redirect } from "next/navigation";
import { requireAdminCustomer } from "@/lib/auth";
import { toAdminIdentity } from "@/lib/adminIdentity";
import AdminShellRoute from "@/components/admin/AdminShellRoute";
import EmailComposer from "@/components/admin/emails/EmailComposer";
import { getAdminPermissions, resolveEmailPermissions } from "@/lib/admin/permissions";
import { loadDraft } from "@/lib/email/adminEmailService";
import type { ComposerState } from "@/components/admin/emails/types";
import type { EmailModule } from "@/lib/email/composerModules";

export const dynamic = "force-dynamic";

type SP = Record<string, string | string[] | undefined>;

export default async function EmailComposePage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  const admin = await requireAdminCustomer();
  const permissions = resolveEmailPermissions(await getAdminPermissions(admin.id));
  // Server-side gate — never trust the client. An admin needs at least COMPOSE.
  if (!permissions.compose) redirect("/403");

  const sp = await searchParams;
  const draftId = typeof sp.draft === "string" ? sp.draft : "";

  let initialDraft: (ComposerState & { draftId: string }) | null = null;
  if (draftId) {
    const draft = await loadDraft(draftId);
    if (draft) {
      const modules = Array.isArray(draft.modules) ? (draft.modules as EmailModule[]) : [];
      initialDraft = {
        draftId: draft.draftId,
        templateKey: draft.templateKey,
        recipientMode: draft.recipientMode,
        subject: draft.subject,
        preheader: draft.preheader,
        eyebrow: draft.eyebrow,
        title: draft.title,
        modules,
        recipients: draft.recipients.map((r) => ({
          customerId: r.customerId ?? null,
          email: r.email,
          name: r.name ?? "",
        })),
      };
    }
  }

  return (
    <AdminShellRoute active="emails" admin={toAdminIdentity(admin.name, admin.role)}>
      <EmailComposer permissions={permissions} initialDraft={initialDraft} adminTestEmail={admin.email} />
    </AdminShellRoute>
  );
}
