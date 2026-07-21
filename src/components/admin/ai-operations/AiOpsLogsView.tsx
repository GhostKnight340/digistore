"use client";

/**
 * AI Operations observability logs (spec §9) with filters by module, status,
 * execution type (trigger), and date. Server-filtered: changing a filter pushes
 * query params and the page re-renders. Read-only.
 */

import { useRouter, useSearchParams } from "next/navigation";
import { OpsCard, relativeTime } from "@/components/admin/operations/shared";
import type { ExecutionLogDTO, ToolCallLogDTO } from "@/lib/ai-ops/logsQuery";
import { MODULE_KEYS, moduleLabel } from "@/lib/ai-ops/types";

const EXEC_STATUSES = ["running", "success", "failure", "skipped"];
const TOOL_STATUSES = ["success", "denied", "invalid_input", "rate_limited", "error"];
const TRIGGERS = ["schedule", "manual", "discord", "webhook"];

export default function AiOpsLogsView({
  executions,
  toolCalls,
  filters,
}: {
  executions: ExecutionLogDTO[];
  toolCalls: ToolCallLogDTO[];
  filters: { module?: string; status?: string; trigger?: string; since?: string };
}) {
  const router = useRouter();
  const params = useSearchParams();

  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    router.push(`/admin/ai-operations/logs?${next.toString()}`);
  };

  return (
    <div className="flex flex-col gap-5">
      <section className="card flex flex-wrap items-end gap-3 p-4">
        <Filter label="Module" value={filters.module ?? ""} onChange={(v) => setParam("module", v)} options={[["", "Tous"], ...MODULE_KEYS.map((m) => [m, moduleLabel(m)] as [string, string])]} />
        <Filter label="Statut" value={filters.status ?? ""} onChange={(v) => setParam("status", v)} options={[["", "Tous"], ...[...new Set([...EXEC_STATUSES, ...TOOL_STATUSES])].map((s) => [s, s] as [string, string])]} />
        <Filter label="Type d'exécution" value={filters.trigger ?? ""} onChange={(v) => setParam("trigger", v)} options={[["", "Tous"], ...TRIGGERS.map((t) => [t, t] as [string, string])]} />
        <div className="flex flex-col gap-1">
          <label className="text-[11px] font-medium text-faint">Depuis</label>
          <input type="date" className="ai-log-input" value={filters.since ?? ""} onChange={(e) => setParam("since", e.target.value)} />
        </div>
      </section>

      <OpsCard title={`Exécutions (${executions.length})`}>
        {executions.length === 0 ? (
          <p className="text-sm text-muted">Aucune exécution.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-[11px] uppercase text-faint">
                <tr>
                  <Th>Module</Th><Th>Type</Th><Th>Mode</Th><Th>Statut</Th><Th>Provider</Th><Th>Coût</Th><Th>Quand</Th>
                </tr>
              </thead>
              <tbody>
                {executions.map((e) => (
                  <tr key={e.id} className="border-t border-border">
                    <Td>{moduleLabel(e.module)}</Td>
                    <Td>{e.trigger}</Td>
                    <Td>{e.executionMode}</Td>
                    <Td><StatusText status={e.status} /></Td>
                    <Td>{e.provider ? `${e.provider}/${e.model}` : "—"}</Td>
                    <Td>{e.estimatedCostUsd != null ? `$${e.estimatedCostUsd.toFixed(4)}` : "—"}</Td>
                    <Td>{relativeTime(e.createdAt)}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </OpsCard>

      <OpsCard title={`Appels d'outils (${toolCalls.length})`}>
        {toolCalls.length === 0 ? (
          <p className="text-sm text-muted">Aucun appel d'outil.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-[11px] uppercase text-faint">
                <tr>
                  <Th>Module</Th><Th>Outil</Th><Th>Statut</Th><Th>Raison</Th><Th>Durée</Th><Th>Quand</Th>
                </tr>
              </thead>
              <tbody>
                {toolCalls.map((t) => (
                  <tr key={t.id} className="border-t border-border">
                    <Td>{moduleLabel(t.module)}</Td>
                    <Td><code className="text-[13px] text-white">{t.tool}</code></Td>
                    <Td><StatusText status={t.status} /></Td>
                    <Td>{t.reason ?? "—"}</Td>
                    <Td>{t.durationMs != null ? `${t.durationMs}ms` : "—"}</Td>
                    <Td>{relativeTime(t.createdAt)}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </OpsCard>

      <style jsx>{`
        :global(.ai-log-input) {
          border-radius: 0.5rem;
          border: 1px solid rgba(255, 255, 255, 0.08);
          background: #121319;
          padding: 0.4rem 0.6rem;
          font-size: 0.8rem;
          color: #f3f4f7;
        }
      `}</style>
    </div>
  );
}

function Filter({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: [string, string][] }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[11px] font-medium text-faint">{label}</label>
      <select className="ai-log-input" value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map(([val, lbl]) => (
          <option key={val} value={val}>{lbl}</option>
        ))}
      </select>
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="py-1.5 pr-4 font-medium">{children}</th>;
}
function Td({ children }: { children: React.ReactNode }) {
  return <td className="py-2 pr-4 text-muted">{children}</td>;
}
function StatusText({ status }: { status: string }) {
  const color =
    status === "success" ? "#5BC98C" : status === "failure" || status === "error" || status === "denied" ? "#F08084" : status === "rate_limited" || status === "invalid_input" ? "#F0C466" : "#9A9FAB";
  return <span style={{ color }}>{status}</span>;
}
