import { requireAdminCustomer } from "@/lib/auth";
import { toAdminIdentity } from "@/lib/adminIdentity";
import AdminShellRoute from "@/components/admin/AdminShellRoute";
import AiConversationsView, {
  type ConversationRow,
} from "@/components/admin/ai-operations/AiConversationsView";
import { listConversationMetadata } from "@/lib/ai-ops/discord/conversationStore";

export const dynamic = "force-dynamic";

/** /admin/ai-operations/conversations — inspect/clear conversation memory (spec §3). */
export default async function AiConversationsPage() {
  const customer = await requireAdminCustomer();
  const meta = await listConversationMetadata();
  const conversations: ConversationRow[] = meta.map((m) => ({
    key: m.key,
    guildId: m.guildId,
    channelId: m.channelId,
    threadId: m.threadId,
    discordUserId: m.discordUserId,
    module: m.module,
    messageCount: m.messageCount,
    hasSummary: m.hasSummary,
    activeRange: m.activeRange,
    lastActivityAt: m.lastActivityAt.toISOString(),
    expiresAt: m.expiresAt.toISOString(),
  }));

  return (
    <AdminShellRoute active="ai-operations" admin={toAdminIdentity(customer.name, customer.role)}>
      <div className="mb-4">
        <a href="/admin/ai-operations" className="text-xs text-faint hover:text-white">
          ← AI Operations
        </a>
        <h1 className="mt-1 text-lg font-semibold text-white">Mémoire des conversations</h1>
      </div>
      <AiConversationsView conversations={conversations} />
    </AdminShellRoute>
  );
}
