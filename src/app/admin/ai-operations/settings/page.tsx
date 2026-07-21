import { requireAdminCustomer } from "@/lib/auth";
import { toAdminIdentity } from "@/lib/adminIdentity";
import AdminShellRoute from "@/components/admin/AdminShellRoute";
import AiOpsSettingsForm from "@/components/admin/ai-operations/AiOpsSettingsForm";
import { getAiOpsSettings } from "@/lib/ai-ops/store";
import { listChannelMappings } from "@/lib/ai-ops/discordChannels";

export const dynamic = "force-dynamic";

/** /admin/ai-operations/settings — global settings + Discord channel config. */
export default async function AiOpsSettingsPage() {
  const customer = await requireAdminCustomer();
  const [settings, channels] = await Promise.all([getAiOpsSettings(), listChannelMappings()]);

  return (
    <AdminShellRoute active="ai-operations" admin={toAdminIdentity(customer.name, customer.role)}>
      <div className="mb-4">
        <a href="/admin/ai-operations" className="text-xs text-faint hover:text-white">← AI Operations</a>
        <h1 className="mt-1 text-lg font-semibold text-white">Réglages AI Operations</h1>
      </div>
      <AiOpsSettingsForm settings={settings} channels={channels} />
    </AdminShellRoute>
  );
}
