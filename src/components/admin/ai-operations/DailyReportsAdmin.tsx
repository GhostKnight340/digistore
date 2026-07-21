"use client";

/**
 * Daily Reports admin (spec: Daily Reports admin page). Configure each of the
 * four executive reports independently — enabled, schedule, timezone, channel,
 * model, max tokens, retries — plus Run now, Preview, and last/next execution.
 * A history table shows recent runs. Mirrors AiModuleConfigForm's styling.
 */

import { useState, useTransition } from "react";
import { OpsCard } from "@/components/admin/operations/shared";
import {
  saveReportScheduleAction,
  runReportNowAction,
  previewReportAction,
} from "@/app/actions/aiReports";

interface ReportRow {
  reportType: string;
  title: string;
  emoji: string;
  description: string;
  enabled: boolean;
  schedule: string;
  defaultSchedule: string;
  timezone: string | null;
  discordChannelId: string | null;
  modelOverride: string | null;
  maxTokens: number | null;
  maxRetries: number;
  status: string;
  lastError: string | null;
  lastRunAtIso: string | null;
  lastSuccessAtIso: string | null;
  nextRunAtIso: string | null;
}

interface HistoryRow {
  id: string;
  trigger: string;
  status: string;
  startedAtIso: string;
  durationMs: number | null;
  model: string | null;
  estimatedCostUsd: number | null;
  summary: string | null;
  error: string | null;
}

interface Props {
  reports: ReportRow[];
  history: HistoryRow[];
  defaultTimezone: string;
  globalEnabled: boolean;
  moduleEnabled: boolean;
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" });
  } catch {
    return iso;
  }
}

export default function DailyReportsAdmin({ reports, history, defaultTimezone, globalEnabled, moduleEnabled }: Props) {
  return (
    <div className="flex flex-col gap-5">
      {(!globalEnabled || !moduleEnabled) && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
          {!globalEnabled
            ? "AI Operations is globally disabled — no report will run until it is enabled in Settings."
            : "The Daily Reports module is disabled — enable it on the module page for scheduled reports to run."}
        </div>
      )}

      {reports.map((r) => (
        <ReportCard key={r.reportType} report={r} defaultTimezone={defaultTimezone} />
      ))}

      <OpsCard title="Execution history">
        {history.length === 0 ? (
          <p className="text-xs text-muted">No executions yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="text-faint">
                <tr>
                  <th className="py-1.5 pr-3">When</th>
                  <th className="py-1.5 pr-3">Trigger</th>
                  <th className="py-1.5 pr-3">Status</th>
                  <th className="py-1.5 pr-3">Model</th>
                  <th className="py-1.5 pr-3">Cost</th>
                  <th className="py-1.5">Summary</th>
                </tr>
              </thead>
              <tbody className="text-muted">
                {history.map((h) => (
                  <tr key={h.id} className="border-t border-border/50">
                    <td className="py-1.5 pr-3 whitespace-nowrap">{fmtDate(h.startedAtIso)}</td>
                    <td className="py-1.5 pr-3">{h.trigger}</td>
                    <td className="py-1.5 pr-3">
                      <StatusPill status={h.status} />
                    </td>
                    <td className="py-1.5 pr-3 whitespace-nowrap">{h.model ?? "—"}</td>
                    <td className="py-1.5 pr-3 whitespace-nowrap">
                      {h.estimatedCostUsd == null ? "—" : `$${h.estimatedCostUsd.toFixed(4)}`}
                    </td>
                    <td className="py-1.5">{h.error ? `⚠️ ${h.error}` : h.summary ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </OpsCard>

      <style jsx>{`
        :global(.ai-input) {
          width: 100%;
          border-radius: 0.6rem;
          border: 1px solid rgba(255, 255, 255, 0.08);
          background: #121319;
          padding: 0.5rem 0.7rem;
          font-size: 0.85rem;
          color: #f3f4f7;
        }
      `}</style>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const color =
    status === "success"
      ? "text-emerald-300"
      : status === "failure"
        ? "text-red-300"
        : status === "running"
          ? "text-blue-300"
          : "text-muted";
  return <span className={color}>{status}</span>;
}

function ReportCard({ report, defaultTimezone }: { report: ReportRow; defaultTimezone: string }) {
  const [form, setForm] = useState(report);
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);

  const set = <K extends keyof ReportRow>(key: K, value: ReportRow[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const save = () => {
    setMessage(null);
    startTransition(async () => {
      const res = await saveReportScheduleAction(form.reportType, {
        enabled: form.enabled,
        schedule: form.schedule,
        timezone: form.timezone,
        discordChannelId: form.discordChannelId,
        modelOverride: form.modelOverride,
        maxTokens: form.maxTokens,
        maxRetries: form.maxRetries,
      });
      setMessage(res.ok ? "Enregistré." : res.error ?? "Échec.");
    });
  };

  const runNow = () => {
    setMessage(null);
    startTransition(async () => {
      const res = await runReportNowAction(form.reportType);
      setMessage(res.ok ? "Rapport envoyé sur Discord." : res.error ?? "Échec.");
    });
  };

  const doPreview = () => {
    setMessage(null);
    setPreview(null);
    startTransition(async () => {
      const res = await previewReportAction(form.reportType);
      if (res.ok) setPreview(res.text || "(vide)");
      else setMessage(res.error);
    });
  };

  return (
    <OpsCard title={`${report.emoji} ${report.title}`}>
      <p className="mb-3 text-xs text-muted">{report.description}</p>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Toggle label="Activé (planifié)" checked={form.enabled} onChange={(v) => set("enabled", v)} />
        <Field label={`Planification (cron, ${report.timezone ?? defaultTimezone})`}>
          <input
            className="ai-input"
            placeholder={report.defaultSchedule}
            value={form.schedule}
            onChange={(e) => set("schedule", e.target.value)}
          />
        </Field>
        <Field label="Fuseau horaire (override)">
          <input
            className="ai-input"
            placeholder={defaultTimezone}
            value={form.timezone ?? ""}
            onChange={(e) => set("timezone", e.target.value || null)}
          />
        </Field>
        <Field label="Canal Discord (override, ID)">
          <input
            className="ai-input"
            placeholder="(défaut : canal rapports)"
            value={form.discordChannelId ?? ""}
            onChange={(e) => set("discordChannelId", e.target.value || null)}
          />
        </Field>
        <Field label="Modèle (override)">
          <input
            className="ai-input"
            placeholder="(défaut du module)"
            value={form.modelOverride ?? ""}
            onChange={(e) => set("modelOverride", e.target.value || null)}
          />
        </Field>
        <Field label="Tokens max">
          <input
            type="number"
            min={64}
            max={8000}
            className="ai-input"
            placeholder="(défaut)"
            value={form.maxTokens ?? ""}
            onChange={(e) => set("maxTokens", e.target.value ? Number(e.target.value) : null)}
          />
        </Field>
        <Field label="Réessais max">
          <input
            type="number"
            min={0}
            max={5}
            className="ai-input"
            value={form.maxRetries}
            onChange={(e) => set("maxRetries", Number(e.target.value))}
          />
        </Field>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3 text-xs text-muted sm:grid-cols-4">
        <Meta label="Dernière exécution" value={fmtDate(report.lastRunAtIso)} />
        <Meta label="Dernier succès" value={fmtDate(report.lastSuccessAtIso)} />
        <Meta label="Prochaine exécution" value={fmtDate(report.nextRunAtIso)} />
        <Meta label="Statut" value={report.status + (report.lastError ? ` — ${report.lastError}` : "")} />
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button type="button" onClick={save} disabled={pending} className="btn-primary text-sm">
          Enregistrer
        </button>
        <button
          type="button"
          onClick={runNow}
          disabled={pending}
          className="rounded-lg border border-border px-3 py-1.5 text-sm text-white hover:bg-surface2/60"
        >
          Exécuter maintenant
        </button>
        <button
          type="button"
          onClick={doPreview}
          disabled={pending}
          className="rounded-lg border border-border px-3 py-1.5 text-sm text-white hover:bg-surface2/60"
        >
          Aperçu
        </button>
        {message && <span className="text-xs text-muted">{message}</span>}
      </div>

      {preview && (
        <pre className="mt-3 max-h-96 overflow-auto whitespace-pre-wrap rounded-lg border border-border bg-[#121319] p-3 text-xs text-[#f3f4f7]">
          {preview}
        </pre>
      )}
    </OpsCard>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-medium text-muted">{label}</label>
      {children}
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[11px] text-faint">{label}</span>
      <span className="text-white">{value}</span>
    </div>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-border bg-surface2/40 px-3 py-2.5">
      <span className="text-sm text-white">{label}</span>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="h-4 w-4" />
    </label>
  );
}
