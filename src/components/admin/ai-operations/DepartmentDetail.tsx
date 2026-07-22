"use client";

/**
 * AI Operations — department (module) detail view (Command Center, Phase 2).
 *
 * The dark per-module page behind /admin/ai-operations/modules/[module]. A
 * header (run now / open conversation) + quick stats + four tabs:
 *   - Vue d'ensemble  — real description, last run summary, performance bars.
 *   - Outils & permissions — editable tool grants (module can call ONLY these).
 *   - Historique — real recent executions.
 *   - Planification & coûts — editable mode / schedule / provider / caps / prompt.
 *
 * Tools and Schedule tabs fold in the full module configuration (there is no
 * separate config form anymore); everything saves via saveModuleConfigAction.
 */

import Link from "next/link";
import { useState, useTransition } from "react";
import { relativeTime } from "@/components/admin/operations/shared";
import type { DepartmentDetail } from "@/lib/ai-ops/departmentDetail";
import type { AiModuleConfigDTO } from "@/lib/ai-ops/store";
import { AI_PROVIDERS, EXECUTION_MODES } from "@/lib/ai-ops/types";
import { runModuleNowAction, saveModuleConfigAction } from "@/app/actions/aiOperations";

const BASE = "/admin/ai-operations";

type DeptStatus = "autonomous" | "active" | "idle" | "error" | "off";
const STATUS_STYLE: Record<DeptStatus, { color: string; bg: string; label: string; pulse: boolean }> = {
  autonomous: { color: "#4ade80", bg: "rgba(74,222,128,.12)", label: "AUTONOME", pulse: true },
  active: { color: "#5b8cff", bg: "rgba(91,140,255,.12)", label: "ACTIF", pulse: false },
  idle: { color: "#38bdf8", bg: "rgba(56,189,248,.12)", label: "VEILLE", pulse: false },
  error: { color: "#f87171", bg: "rgba(248,113,113,.12)", label: "ERREUR", pulse: false },
  off: { color: "#6b6e78", bg: "rgba(255,255,255,.05)", label: "INACTIF", pulse: false },
};

function deptStatus(c: AiModuleConfigDTO): DeptStatus {
  if (!c.enabled) return "off";
  if (c.lastStatus === "failure") return "error";
  if (c.executionMode === "AUTONOMOUS") return "autonomous";
  if (!c.lastRunAt) return "idle";
  return "active";
}
function withAlpha(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
function healthColor(h: number): string {
  return h >= 90 ? "#4ade80" : h >= 70 ? "#f5a623" : "#f87171";
}
function usd(n: number): string {
  return `$${n.toFixed(n < 1 ? 3 : 2)}`;
}
function statusColor(s: string): string {
  return s === "success" ? "#4ade80" : s === "failure" ? "#f87171" : "#6b6e78";
}

const CARD: React.CSSProperties = { background: "rgba(255,255,255,.03)", border: "1px solid rgba(255,255,255,.07)", borderRadius: 16, padding: 20 };
const H3: React.CSSProperties = { fontSize: 13, fontWeight: 600, color: "#c7cad3", margin: "0 0 12px", textTransform: "uppercase", letterSpacing: ".02em" };

const TABS = [
  { key: "overview", label: "Vue d'ensemble" },
  { key: "tools", label: "Outils & permissions" },
  { key: "history", label: "Historique" },
  { key: "schedule", label: "Planification & coûts" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

export default function DepartmentDetailView({ detail }: { detail: DepartmentDetail }) {
  const c = detail.color;
  const [tab, setTab] = useState<TabKey>("overview");
  const [busy, setBusy] = useState(false);
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  const [form, setForm] = useState<AiModuleConfigDTO>(detail.config);
  const [tools, setTools] = useState<Set<string>>(new Set(detail.config.grantedTools));
  const set = <K extends keyof AiModuleConfigDTO>(key: K, value: AiModuleConfigDTO[K]) => setForm((f) => ({ ...f, [key]: value }));

  const status = deptStatus(form);
  const st = STATUS_STYLE[status];
  const perf = detail.performance;
  const grantedCount = tools.size;

  const runNow = () => {
    setBusy(true);
    startTransition(async () => {
      await runModuleNowAction(form.module);
      setBusy(false);
    });
  };
  const save = () => {
    setMessage(null);
    startTransition(async () => {
      const res = await saveModuleConfigAction(form.module, {
        enabled: form.enabled,
        executionMode: form.executionMode,
        providerOverride: form.providerOverride,
        modelOverride: form.modelOverride,
        discordChannelId: form.discordChannelId,
        schedule: form.schedule,
        maxExecutionsPerDay: form.maxExecutionsPerDay,
        maxDailyCostUsd: form.maxDailyCostUsd,
        notifyOnFailure: form.notifyOnFailure,
        instructions: form.instructions,
        grantedTools: [...tools],
      });
      setMessage(res.ok ? "Module enregistré." : res.error ?? "Échec.");
    });
  };

  const quickStats = [
    { label: "Exécutions", value: String(perf.execToday) },
    { label: "Coût aujourd'hui", value: usd(perf.costTodayUsd) },
    { label: "Santé", value: `${perf.health}%`, color: healthColor(perf.health) },
    { label: "Modèle", value: form.modelOverride || detail.defaultModel },
    { label: "Outils", value: `${grantedCount}/${detail.tools.length}` },
  ];

  return (
    <div style={{ color: "#eef0f4", margin: "-26px -28px", padding: "28px", minHeight: "100%", background: "radial-gradient(1200px 600px at 15% -10%,rgba(91,140,255,.08),transparent),#070809" }}>
      <style>{`@keyframes cc-pulse{0%,100%{opacity:1}50%{opacity:.35}} .cc-input{width:100%;border-radius:.6rem;border:1px solid rgba(255,255,255,.08);background:#121319;padding:.5rem .7rem;font-size:.85rem;color:#f3f4f7}`}</style>

      <div style={{ maxWidth: 1120, margin: "0 auto" }}>
        <Link href={BASE} style={{ fontSize: 12, color: "#7d818c", textDecoration: "none" }}>← Centre de contrôle</Link>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: 16, margin: "16px 0 24px" }}>
          <div style={{ width: 56, height: 56, borderRadius: 14, background: withAlpha(c, 0.14), border: `1px solid ${withAlpha(c, 0.35)}`, display: "flex", alignItems: "center", justifyContent: "center", flex: "none" }}>
            <div style={{ width: 22, height: 22, borderRadius: "50%", border: `2px solid ${c}` }} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <h1 style={{ fontSize: 22, fontWeight: 600, margin: 0, letterSpacing: "-.01em" }}>{form.label}</h1>
              <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 10.5, fontWeight: 600, letterSpacing: ".03em", textTransform: "uppercase", color: st.color, background: st.bg, padding: "4px 8px", borderRadius: 20 }}>
                <span style={{ width: 5, height: 5, borderRadius: "50%", background: st.color, animation: st.pulse ? "cc-pulse 2s ease-in-out infinite" : "none" }} />
                {st.label}
              </div>
            </div>
            <div style={{ fontSize: 13, color: "#8b8f99", marginTop: 4 }}>{detail.description}</div>
          </div>
          <button type="button" onClick={runNow} disabled={busy || pending || !form.enabled} style={{ background: c, color: "#0a0b0e", fontWeight: 600, fontSize: 13, border: "none", padding: "10px 16px", borderRadius: 9, cursor: form.enabled ? "pointer" : "not-allowed", opacity: form.enabled ? 1 : 0.5 }} title={form.enabled ? "Exécuter maintenant" : "Module désactivé"}>
            {busy ? "…" : "Exécuter maintenant"}
          </button>
          <Link href={`${BASE}/conversations`} style={{ background: "rgba(255,255,255,.05)", border: "1px solid rgba(255,255,255,.09)", color: "#dfe1e7", fontSize: 13, padding: "10px 16px", borderRadius: 9, textDecoration: "none" }}>Ouvrir conversation</Link>
        </div>

        {/* Quick stats */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 12, marginBottom: 24 }}>
          {quickStats.map((q) => (
            <div key={q.label} style={{ ...CARD, padding: "14px 16px", borderRadius: 12 }}>
              <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: ".04em", textTransform: "uppercase", color: "#6b6e78", marginBottom: 6 }}>{q.label}</div>
              <div style={{ fontSize: 18, fontWeight: 600, color: q.color ?? "#dfe1e7", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{q.value}</div>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", gap: 4, borderBottom: "1px solid rgba(255,255,255,.08)", marginBottom: 22 }}>
          {TABS.map((t) => (
            <button key={t.key} type="button" onClick={() => setTab(t.key)} style={{ background: "none", border: "none", padding: "10px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer", color: tab === t.key ? "#eef0f4" : "#7d818c", borderBottom: `2px solid ${tab === t.key ? c : "transparent"}`, marginBottom: -1 }}>
              {t.label}
            </button>
          ))}
        </div>

        {tab === "overview" && <Overview detail={detail} color={c} />}
        {tab === "history" && <History detail={detail} />}
        {tab === "tools" && <Tools tools={detail.tools} selected={tools} color={c} onToggle={(name) => setTools((prev) => { const n = new Set(prev); n.has(name) ? n.delete(name) : n.add(name); return n; })} onSave={save} pending={pending} message={message} />}
        {tab === "schedule" && <Schedule form={form} set={set} onSave={save} pending={pending} message={message} defaultModel={detail.defaultModel} />}
      </div>
    </div>
  );
}

function Overview({ detail, color }: { detail: DepartmentDetail; color: string }) {
  const perf = detail.performance;
  const bars = [
    { label: "Taux de succès", value: perf.successRatePct == null ? "—" : `${perf.successRatePct}%`, pct: perf.successRatePct ?? 0 },
    { label: "Temps de réponse moyen", value: perf.avgResponseMs == null ? "—" : `${(perf.avgResponseMs / 1000).toFixed(1)}s`, pct: perf.avgResponseMs == null ? 0 : Math.min(100, (perf.avgResponseMs / 5000) * 100) },
    { label: "Utilisation du budget (jour)", value: `${perf.budgetUsagePct}%`, pct: perf.budgetUsagePct },
  ];
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 20 }} className="dd-grid">
      <div style={CARD}>
        <h3 style={H3}>Ce que fait ce module</h3>
        <div style={{ fontSize: 13, color: "#c7cad3", lineHeight: 1.6, marginBottom: 18 }}>{detail.description}</div>
        <h3 style={{ ...H3, marginTop: 4 }}>Outils autorisés</h3>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {detail.tools.filter((t) => t.granted).map((t) => (
            <code key={t.name} style={{ fontSize: 11.5, color: "#dfe1e7", background: withAlpha(color, 0.14), border: `1px solid ${withAlpha(color, 0.3)}`, borderRadius: 6, padding: "3px 7px" }}>{t.name}</code>
          ))}
          {detail.grantedCount === 0 && <span style={{ fontSize: 12.5, color: "#8b8f99" }}>Aucun outil accordé.</span>}
        </div>
        <h3 style={{ ...H3, marginTop: 24 }}>Dernier résultat</h3>
        <div style={{ fontSize: 13, color: "#c7cad3", background: "rgba(255,255,255,.02)", border: "1px solid rgba(255,255,255,.06)", borderRadius: 10, padding: 14, lineHeight: 1.6 }}>
          {detail.config.lastError && detail.config.lastStatus === "failure"
            ? `⚠️ ${detail.config.lastError}`
            : detail.lastSummary ?? "Aucune exécution enregistrée."}
        </div>
      </div>
      <div style={CARD}>
        <h3 style={H3}>Performance (7 jours)</h3>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {bars.map((b) => (
            <div key={b.label}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 5 }}>
                <span style={{ color: "#8b8f99" }}>{b.label}</span>
                <span style={{ color: "#dfe1e7", fontWeight: 600 }}>{b.value}</span>
              </div>
              <div style={{ height: 6, borderRadius: 4, background: "rgba(255,255,255,.06)" }}>
                <div style={{ height: "100%", borderRadius: 4, background: color, width: `${b.pct}%` }} />
              </div>
            </div>
          ))}
        </div>
        <div style={{ fontSize: 11, color: "#6b6e78", marginTop: 14 }}>{perf.totalRuns7d} exécution(s) sur 7 jours</div>
      </div>
      <style>{`@media (max-width:820px){.dd-grid{grid-template-columns:1fr !important}}`}</style>
    </div>
  );
}

function History({ detail }: { detail: DepartmentDetail }) {
  if (detail.history.length === 0) {
    return <div style={CARD}><p style={{ fontSize: 13, color: "#8b8f99", margin: 0 }}>Aucune exécution enregistrée.</p></div>;
  }
  return (
    <div style={{ ...CARD, padding: "6px 20px" }}>
      {detail.history.map((h) => (
        <div key={h.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "13px 0", borderBottom: "1px solid rgba(255,255,255,.05)" }}>
          <div style={{ fontSize: 13, color: "#dfe1e7", flex: 1, minWidth: 0 }}>
            <span style={{ textTransform: "capitalize" }}>{h.trigger}</span>
            {h.summary ? <span style={{ color: "#8b8f99" }}> · {h.summary}</span> : h.error ? <span style={{ color: "#f2b8b8" }}> · {h.error}</span> : null}
          </div>
          {h.durationMs != null && <div style={{ fontSize: 11.5, color: "#6b6e78", flex: "none" }}>{(h.durationMs / 1000).toFixed(1)}s</div>}
          <div style={{ fontSize: 11.5, fontWeight: 600, color: statusColor(h.status), textTransform: "uppercase", width: 70, textAlign: "right" }}>{h.status}</div>
          <div style={{ fontSize: 11.5, color: "#6b6e78", width: 90, textAlign: "right" }}>{relativeTime(h.startedAt)}</div>
        </div>
      ))}
    </div>
  );
}

function Tools({ tools, selected, color, onToggle, onSave, pending, message }: { tools: DepartmentDetail["tools"]; selected: Set<string>; color: string; onToggle: (name: string) => void; onSave: () => void; pending: boolean; message: string | null }) {
  return (
    <div style={CARD}>
      <div style={{ fontSize: 13, color: "#8b8f99", marginBottom: 16 }}>Le module ne peut appeler QUE les outils cochés ici. Aucune permission « admin » universelle.</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px 24px" }} className="dd-tools">
        {tools.map((t) => {
          const on = selected.has(t.name);
          return (
            <label key={t.name} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 0", borderBottom: "1px solid rgba(255,255,255,.05)", cursor: "pointer" }}>
              <span style={{ width: 16, height: 16, borderRadius: 4, border: `1.5px solid ${on ? color : "rgba(255,255,255,.15)"}`, background: on ? withAlpha(color, 0.15) : "transparent", flex: "none", display: "flex", alignItems: "center", justifyContent: "center" }}>
                {on && <span style={{ width: 8, height: 8, borderRadius: 1, background: color }} />}
              </span>
              <input type="checkbox" checked={on} onChange={() => onToggle(t.name)} style={{ display: "none" }} />
              <code style={{ fontSize: 13, color: on ? "#dfe1e7" : "#6b6e78" }}>{t.name}</code>
            </label>
          );
        })}
      </div>
      <SaveBar onSave={onSave} pending={pending} message={message} />
      <style>{`@media (max-width:640px){.dd-tools{grid-template-columns:1fr !important}}`}</style>
    </div>
  );
}

function Schedule({ form, set, onSave, pending, message, defaultModel }: { form: AiModuleConfigDTO; set: <K extends keyof AiModuleConfigDTO>(k: K, v: AiModuleConfigDTO[K]) => void; onSave: () => void; pending: boolean; message: string | null; defaultModel: string }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }} className="dd-grid">
      <div style={{ ...CARD, display: "flex", flexDirection: "column", gap: 14 }}>
        <h3 style={H3}>Exécution</h3>
        <Toggle label="Activé" checked={form.enabled} onChange={(v) => set("enabled", v)} />
        <Toggle label="Notifier en cas d'échec" checked={form.notifyOnFailure} onChange={(v) => set("notifyOnFailure", v)} />
        <FieldDD label="Mode d'exécution">
          <select className="cc-input" value={form.executionMode} onChange={(e) => set("executionMode", e.target.value as AiModuleConfigDTO["executionMode"])}>
            {EXECUTION_MODES.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </FieldDD>
        <FieldDD label="Planification (cron, fuseau AI Operations)">
          <input className="cc-input" placeholder="ex. 0 7 * * *" value={form.schedule ?? ""} onChange={(e) => set("schedule", e.target.value || null)} />
        </FieldDD>
        <FieldDD label="Canal Discord (override, ID)">
          <input className="cc-input" placeholder="(par défaut)" value={form.discordChannelId ?? ""} onChange={(e) => set("discordChannelId", e.target.value || null)} />
        </FieldDD>
      </div>
      <div style={{ ...CARD, display: "flex", flexDirection: "column", gap: 14 }}>
        <h3 style={H3}>Modèle & coûts</h3>
        <FieldDD label="Provider (override)">
          <select className="cc-input" value={form.providerOverride ?? ""} onChange={(e) => set("providerOverride", e.target.value || null)}>
            <option value="">(par défaut)</option>
            {AI_PROVIDERS.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </FieldDD>
        <FieldDD label="Modèle (override)">
          <input className="cc-input" placeholder={`(par défaut : ${defaultModel})`} value={form.modelOverride ?? ""} onChange={(e) => set("modelOverride", e.target.value || null)} />
        </FieldDD>
        <FieldDD label="Exécutions max / jour">
          <input type="number" min={0} className="cc-input" value={form.maxExecutionsPerDay} onChange={(e) => set("maxExecutionsPerDay", Number(e.target.value))} />
        </FieldDD>
        <FieldDD label="Coût quotidien max estimé (USD)">
          <input type="number" min={0} step="0.01" className="cc-input" value={form.maxDailyCostUsd} onChange={(e) => set("maxDailyCostUsd", Number(e.target.value))} />
        </FieldDD>
      </div>
      <div style={{ ...CARD, gridColumn: "1 / -1" }}>
        <h3 style={H3}>Instructions / prompt</h3>
        <textarea className="cc-input" rows={5} value={form.instructions} onChange={(e) => set("instructions", e.target.value)} />
        {form.module === "daily_reports" && (
          <Link href={`${BASE}/reports`} style={{ display: "inline-flex", marginTop: 12, fontSize: 12, color: "#7fa6ff", textDecoration: "none" }}>
            → Configurer les quatre rapports (horaires, canaux, exécuter, aperçu)
          </Link>
        )}
        <SaveBar onSave={onSave} pending={pending} message={message} />
      </div>
      <style>{`@media (max-width:820px){.dd-grid{grid-template-columns:1fr !important}}`}</style>
    </div>
  );
}

function SaveBar({ onSave, pending, message }: { onSave: () => void; pending: boolean; message: string | null }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 16 }}>
      <button type="button" onClick={onSave} disabled={pending} style={{ background: "#5b8cff", color: "#0a0b0e", fontWeight: 600, fontSize: 13, border: "none", padding: "9px 16px", borderRadius: 8, cursor: "pointer" }}>Enregistrer</button>
      {message && <span style={{ fontSize: 12, color: "#8b8f99" }}>{message}</span>}
    </div>
  );
}

function FieldDD({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <label style={{ fontSize: 11, color: "#6b6e78", textTransform: "uppercase", letterSpacing: ".03em" }}>{label}</label>
      {children}
    </div>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, cursor: "pointer" }}>
      <span style={{ fontSize: 13, color: "#dfe1e7" }}>{label}</span>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} style={{ width: 16, height: 16 }} />
    </label>
  );
}
