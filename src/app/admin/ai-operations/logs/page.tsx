import { requireAdminCustomer } from "@/lib/auth";
import { toAdminIdentity } from "@/lib/adminIdentity";
import AdminShellRoute from "@/components/admin/AdminShellRoute";
import AiOpsLogsView from "@/components/admin/ai-operations/AiOpsLogsView";
import AiCacheMetricsPanel from "@/components/admin/ai-operations/AiCacheMetricsPanel";
import { listExecutionLogs, listToolCallLogs, type LogFilters } from "@/lib/ai-ops/logsQuery";
import { getCacheMetrics } from "@/lib/ai-ops/cacheMetrics";

export const dynamic = "force-dynamic";

function one(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/** /admin/ai-operations/logs — filtered observability logs (spec §9). */
export default async function AiOpsLogsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const customer = await requireAdminCustomer();
  const sp = await searchParams;
  const filters: LogFilters = {
    module: one(sp.module),
    status: one(sp.status),
    trigger: one(sp.trigger),
    since: one(sp.since),
  };
  const [executions, toolCalls, cacheMetrics] = await Promise.all([
    listExecutionLogs(filters),
    listToolCallLogs(filters),
    getCacheMetrics(7),
  ]);

  return (
    <AdminShellRoute active="ai-operations" admin={toAdminIdentity(customer.name, customer.role)}>
      <div className="mb-4">
        <a href="/admin/ai-operations" className="text-xs text-faint hover:text-white">← AI Operations</a>
        <h1 className="mt-1 text-lg font-semibold text-white">Journaux &amp; observabilité</h1>
      </div>
      <div className="mb-5">
        <AiCacheMetricsPanel metrics={cacheMetrics} />
      </div>
      <AiOpsLogsView executions={executions} toolCalls={toolCalls} filters={filters} />
    </AdminShellRoute>
  );
}
