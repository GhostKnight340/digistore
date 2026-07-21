import { requireAdminCustomer } from "@/lib/auth";
import { toAdminIdentity } from "@/lib/adminIdentity";
import AdminShellRoute from "@/components/admin/AdminShellRoute";
import DailyReportsAdmin from "@/components/admin/ai-operations/DailyReportsAdmin";
import { getAiOpsSettings, getModuleConfig } from "@/lib/ai-ops/store";
import { listReportSchedules, listReportExecutions, nextRunAt } from "@/lib/ai-ops/reports/reportStore";
import { reportDefinition } from "@/lib/ai-ops/reports/reportTypes";

export const dynamic = "force-dynamic";

/**
 * /admin/ai-operations/reports — the Daily Reports control page. Configure the
 * four executive reports (schedule, timezone, channel, model, tokens), enable/
 * disable each, run now, preview, and see last/next execution + history.
 */
export default async function DailyReportsPage() {
  const customer = await requireAdminCustomer();
  const [settings, moduleConfig, schedules, executions] = await Promise.all([
    getAiOpsSettings(),
    getModuleConfig("daily_reports"),
    listReportSchedules(),
    listReportExecutions(20),
  ]);

  const reports = schedules.map((s) => {
    const def = reportDefinition(s.reportType);
    const next = nextRunAt(s, settings.timezone);
    return {
      ...s,
      title: def.title,
      emoji: def.emoji,
      description: def.description,
      defaultSchedule: def.defaultSchedule,
      lastRunAtIso: s.lastRunAt ? s.lastRunAt.toISOString() : null,
      lastSuccessAtIso: s.lastSuccessAt ? s.lastSuccessAt.toISOString() : null,
      nextRunAtIso: next ? next.toISOString() : null,
    };
  });

  const history = executions.map((e) => ({
    id: e.id,
    trigger: e.trigger,
    status: e.status,
    startedAtIso: e.startedAt.toISOString(),
    durationMs: e.durationMs,
    model: e.model,
    estimatedCostUsd: e.estimatedCostUsd,
    summary: e.summary,
    error: e.error,
  }));

  return (
    <AdminShellRoute active="ai-operations" admin={toAdminIdentity(customer.name, customer.role)}>
      <div className="mb-4">
        <a href="/admin/ai-operations" className="text-xs text-faint hover:text-white">← AI Operations</a>
        <h1 className="mt-1 text-lg font-semibold text-white">Daily Reports</h1>
        <p className="text-xs text-muted">
          Executive morning, evening, weekly and monthly reports posted to Discord. Numbers are computed from
          the safe tool layer; the AI writes only the narrative.
        </p>
      </div>
      <DailyReportsAdmin
        reports={reports}
        history={history}
        defaultTimezone={settings.timezone}
        globalEnabled={settings.globalEnabled}
        moduleEnabled={moduleConfig?.enabled ?? false}
      />
    </AdminShellRoute>
  );
}
