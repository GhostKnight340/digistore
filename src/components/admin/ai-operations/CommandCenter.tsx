"use client";

/**
 * AI Operations Command Center — the redesigned overview landing.
 *
 * Reframes the AI modules as "AI employees / departments" over a dark command
 * center. Server-rendered from a {@link CommandCenterSnapshot}; every figure is
 * real (see commandCenter.ts). Interactions reuse the existing server actions:
 * the global kill switch, per-module "run now", and the approval queue.
 *
 * The design's own dark palette matches the admin shell (#070809), so this lives
 * inside AdminShellRoute like the other AI-ops pages. Department cards link to
 * the existing per-module detail page.
 */

import Link from "next/link";
import { useState, useTransition } from "react";
import { relativeTime } from "@/components/admin/operations/shared";
import type {
  CommandCenterSnapshot,
  DeptDTO,
  DeptStatus,
} from "@/lib/ai-ops/commandCenter";
import { setGlobalEnabledAction, runModuleNowAction, decideApprovalAction } from "@/app/actions/aiOperations";

const BASE = "/admin/ai-operations";

const DEPT_COLORS: Record<string, string> = {
  daily_reports: "#5b8cff",
  discord_assistant: "#818cf8",
  business_intelligence: "#a78bfa",
  marketing_assistant: "#f472b6",
  meta_ads_intelligence: "#38bdf8",
  supplier_intelligence: "#fb923c",
  support_assistant: "#4ade80",
};

const STATUS_STYLE: Record<DeptStatus, { color: string; bg: string; label: string; pulse: boolean }> = {
  autonomous: { color: "#4ade80", bg: "rgba(74,222,128,.12)", label: "AUTONOME", pulse: true },
  active: { color: "#5b8cff", bg: "rgba(91,140,255,.12)", label: "ACTIF", pulse: false },
  idle: { color: "#38bdf8", bg: "rgba(56,189,248,.12)", label: "VEILLE", pulse: false },
  error: { color: "#f87171", bg: "rgba(248,113,113,.12)", label: "ERREUR", pulse: false },
  off: { color: "#6b6e78", bg: "rgba(255,255,255,.05)", label: "INACTIF", pulse: false },
};

function color(module: string): string {
  return DEPT_COLORS[module] ?? "#5b8cff";
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

const CARD: React.CSSProperties = {
  background: "rgba(255,255,255,.03)",
  border: "1px solid rgba(255,255,255,.07)",
  borderRadius: 16,
  padding: 20,
};
const H2: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 600,
  color: "#c7cad3",
  margin: "0 0 14px",
  letterSpacing: ".02em",
  textTransform: "uppercase",
};

export default function CommandCenter({ initial }: { initial: CommandCenterSnapshot }) {
  const [snap, setSnap] = useState(initial);
  const [pending, startTransition] = useTransition();
  const [busyModule, setBusyModule] = useState<string | null>(null);
  const [expandedFeed, setExpandedFeed] = useState<Record<number, boolean>>({});
  const [approvalDecisions, setApprovalDecisions] = useState<Record<string, string>>({});

  const base = snap.base;

  const toggleGlobal = () => {
    startTransition(async () => {
      const next = !base.globalEnabled;
      const res = await setGlobalEnabledAction(next);
      if (res.ok) {
        setSnap((s) => ({ ...s, base: { ...s.base, globalEnabled: next, globalStatus: next ? "healthy" : "unknown" } }));
      }
    });
  };
  const runNow = (module: string) => {
    setBusyModule(module);
    startTransition(async () => {
      await runModuleNowAction(module);
      setBusyModule(null);
    });
  };
  const decideApproval = (id: string, decision: "APPROVED" | "REJECTED") => {
    setApprovalDecisions((d) => ({ ...d, [id]: decision }));
    startTransition(async () => {
      await decideApprovalAction(id, decision);
    });
  };

  const pendingApprovalCount = snap.approvals.filter((a) => !approvalDecisions[a.id]).length;

  const statCards = [
    { label: "Statut IA", value: base.globalEnabled ? "Actif" : "Inactif", suffix: "", valueColor: base.globalEnabled ? "#4ade80" : "#6b6e78", sub: `${snap.departments.length} modules configurés` },
    { label: "Exécutions aujourd'hui", value: String(base.usage.executionsToday), suffix: "", valueColor: "#eef0f4", sub: "toutes exécutions" },
    { label: "Conversations actives", value: String(snap.activeConversations), suffix: "", valueColor: "#eef0f4", sub: `${snap.conversations.length} récentes` },
    { label: "Approbations en attente", value: String(pendingApprovalCount), suffix: "", valueColor: pendingApprovalCount ? "#f5a623" : "#eef0f4", sub: "à traiter" },
    { label: "Appels d'outils (jour)", value: String(base.usage.toolCallsToday), suffix: "", valueColor: "#eef0f4", sub: "aujourd'hui" },
    { label: "Coût estimé (mois)", value: usd(base.usage.monthSpendUsd), suffix: base.usage.monthlyBudgetUsd > 0 ? `/ $${base.usage.monthlyBudgetUsd.toFixed(0)}` : "", valueColor: "#eef0f4", sub: "budget mensuel" },
    { label: "Provider actuel", value: base.defaultProvider, suffix: "", valueColor: "#eef0f4", sub: base.defaultModel },
    { label: "Score de santé global", value: String(snap.healthScore), suffix: "%", valueColor: healthColor(snap.healthScore), sub: base.warnings.length ? `${base.warnings.length} avertissement(s)` : "aucun avertissement" },
  ];

  return (
    <div style={{ color: "#eef0f4", margin: "-26px -28px", padding: "0 0 60px", background: "radial-gradient(1200px 600px at 15% -10%,rgba(91,140,255,.08),transparent),radial-gradient(900px 500px at 90% 0%,rgba(167,139,250,.06),transparent)" }}>
      <style>{`@keyframes cc-pulse{0%,100%{opacity:1}50%{opacity:.35}}`}</style>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "20px 28px", borderBottom: "1px solid rgba(255,255,255,.07)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ width: 30, height: 30, borderRadius: 8, background: "linear-gradient(135deg,#5b8cff,#a78bfa)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 13, color: "#0a0b0e" }}>G</div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600 }}>AI Operations</div>
            <div style={{ fontSize: 11, color: "#7d818c" }}>ghost.ma · Centre de contrôle</div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#9498a3", padding: "6px 10px", borderRadius: 20, background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.07)" }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: base.globalEnabled ? "#4ade80" : "#6b6e78", animation: base.globalEnabled ? "cc-pulse 2.4s ease-in-out infinite" : "none" }} />
            {base.globalEnabled ? "Système actif" : "Système désactivé"}
          </div>
          <Link href={`${BASE}/conversations`} style={btnGhost}>Conversations</Link>
          <Link href={`${BASE}/settings`} style={btnGhost}>Réglages</Link>
          <button type="button" onClick={toggleGlobal} disabled={pending} style={base.globalEnabled ? btnGhost : btnPrimary}>
            {base.globalEnabled ? "Désactiver" : "Activer"}
          </button>
        </div>
      </div>

      <div style={{ maxWidth: 1440, margin: "0 auto", padding: "28px" }}>
        {/* Executive header + stat cards */}
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 16 }}>
          <h1 style={{ fontSize: 15, fontWeight: 600, color: "#c7cad3", margin: 0, letterSpacing: ".02em", textTransform: "uppercase" }}>Vue exécutive</h1>
          <div style={{ fontSize: 12, color: "#6b6e78" }}>{base.defaultProvider} · {base.defaultModel} · {base.timezone}</div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))", gap: 12, marginBottom: 32 }}>
          {statCards.map((s, i) => (
            <div key={i} style={{ ...CARD, padding: "16px 18px", display: "flex", flexDirection: "column", gap: 8, borderRadius: 14 }}>
              <div style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: ".04em", textTransform: "uppercase", color: "#6b6e78" }}>{s.label}</div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                <div style={{ fontSize: 22, fontWeight: 600, color: s.valueColor }}>{s.value}</div>
                {s.suffix && <div style={{ fontSize: 12, color: "#6b6e78" }}>{s.suffix}</div>}
              </div>
              <div style={{ fontSize: 11.5, color: "#8b8f99" }}>{s.sub}</div>
            </div>
          ))}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1.75fr 1fr", gap: 20, alignItems: "start" }} className="cc-grid">
          {/* Left column */}
          <div style={{ display: "flex", flexDirection: "column", gap: 20, minWidth: 0 }}>
            {/* Departments */}
            <div>
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 14 }}>
                <h2 style={{ ...H2, margin: 0, fontSize: 15 }}>Employés IA</h2>
                <div style={{ fontSize: 12, color: "#6b6e78" }}>{snap.departments.length} départements</div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(300px,1fr))", gap: 14 }}>
                {snap.departments.map((d) => (
                  <DeptCard key={d.module} d={d} busy={busyModule === d.module} canRun={base.globalEnabled && d.status !== "off"} onRun={() => runNow(d.module)} />
                ))}
              </div>
            </div>

            {/* Live activity */}
            <div style={CARD}>
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 14 }}>
                <h2 style={{ ...H2, margin: 0, fontSize: 15 }}>Activité en direct</h2>
                <Link href={`${BASE}/logs`} style={{ fontSize: 12, color: "#6b6e78" }}>Journal complet →</Link>
              </div>
              {base.recentActivity.length === 0 ? (
                <p style={{ fontSize: 13, color: "#8b8f99" }}>Aucune activité pour l&apos;instant.</p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column" }}>
                  {base.recentActivity.map((ev, i) => {
                    const ok = ev.status === "success" || ev.status === "COMPLETED" || ev.status === "APPROVED";
                    return (
                      <div key={i} onClick={() => setExpandedFeed((e) => ({ ...e, [i]: !e[i] }))} style={{ cursor: "pointer", display: "flex", alignItems: "flex-start", gap: 12, padding: "11px 4px", borderBottom: "1px solid rgba(255,255,255,.05)" }}>
                        <div style={{ width: 7, height: 7, borderRadius: "50%", marginTop: 5, flex: "none", background: ok ? "#4ade80" : "#f87171" }} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, color: "#dfe1e7" }}>
                            <span style={{ color: color(ev.module), fontWeight: 600 }}>{ev.module}</span> {ev.label}
                          </div>
                          {expandedFeed[i] && (
                            <div style={{ marginTop: 6, fontSize: 12, color: "#8b8f99", background: "rgba(255,255,255,.03)", border: "1px solid rgba(255,255,255,.06)", borderRadius: 8, padding: "8px 10px" }}>
                              Statut : {ev.status} · {new Date(ev.at).toLocaleString("fr-FR")}
                            </div>
                          )}
                        </div>
                        <div style={{ fontSize: 11.5, color: "#6b6e78", flex: "none" }}>{relativeTime(ev.at)}</div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Usage charts */}
            <div style={CARD}>
              <h2 style={H2}>Utilisation &amp; analyses (7j)</h2>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 18 }}>
                <UsageChart label="Exécutions" series={snap.usageSeries.executions} color="#5b8cff" />
                <UsageChart label="Appels d'outils" series={snap.usageSeries.toolCalls} color="#a78bfa" />
                <UsageChart label="Coût ($)" series={snap.usageSeries.costUsd} color="#38bdf8" />
              </div>
            </div>
          </div>

          {/* Right column */}
          <div style={{ display: "flex", flexDirection: "column", gap: 20, minWidth: 0 }}>
            {/* Conversations */}
            <div style={{ ...CARD, padding: 18 }}>
              <h2 style={H2}>Conversations</h2>
              {snap.conversations.length === 0 ? (
                <p style={{ fontSize: 12.5, color: "#8b8f99" }}>Aucune conversation récente.</p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {snap.conversations.map((c) => (
                    <Link key={c.key} href={`${BASE}/conversations`} style={{ display: "flex", alignItems: "center", gap: 10, padding: 9, borderRadius: 10, background: "rgba(255,255,255,.02)", textDecoration: "none" }}>
                      <div style={{ width: 30, height: 30, borderRadius: 8, background: withAlpha(color(c.module), 0.15), display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, color: color(c.module), flex: "none" }}>
                        {c.label.slice(0, 2).toUpperCase()}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                          <div style={{ fontSize: 12.5, fontWeight: 600, color: "#dfe1e7" }}>{c.label}</div>
                          <div style={{ fontSize: 10.5, color: "#6b6e78" }}>{relativeTime(c.lastActivityAt)}</div>
                        </div>
                        <div style={{ fontSize: 11.5, color: "#8b8f99", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.preview}</div>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </div>

            {/* Approvals */}
            <div style={{ ...CARD, padding: 18 }}>
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 14 }}>
                <h2 style={{ ...H2, margin: 0 }}>Approbations</h2>
                <div style={{ fontSize: 11, color: "#6b6e78" }}>{pendingApprovalCount} en attente</div>
              </div>
              {snap.approvals.length === 0 ? (
                <p style={{ fontSize: 12.5, color: "#8b8f99" }}>Aucune approbation en attente.</p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {snap.approvals.map((ap) => {
                    const decision = approvalDecisions[ap.id];
                    return (
                      <div key={ap.id} style={{ border: "1px solid rgba(255,255,255,.08)", borderRadius: 12, padding: 12, background: "rgba(255,255,255,.02)" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                          <div style={{ fontSize: 12, fontWeight: 600, color: color(ap.module) }}>{ap.deptLabel}</div>
                          <div style={{ fontSize: 10.5, color: "#6b6e78", marginLeft: "auto" }}>
                            {decision === "APPROVED" ? "Approuvé" : decision === "REJECTED" ? "Rejeté" : relativeTime(ap.createdAt)}
                          </div>
                        </div>
                        <div style={{ fontSize: 12.5, color: "#c7cad3", lineHeight: 1.45, marginBottom: decision ? 0 : 10 }}>{ap.summary}</div>
                        {!decision && (
                          <div style={{ display: "flex", gap: 6 }}>
                            <button onClick={() => decideApproval(ap.id, "APPROVED")} disabled={pending} style={{ flex: 1, fontSize: 11.5, fontWeight: 600, color: "#0a0b0e", background: "#4ade80", border: "none", borderRadius: 7, padding: "7px 0", cursor: "pointer" }}>Approuver</button>
                            <button onClick={() => decideApproval(ap.id, "REJECTED")} disabled={pending} style={{ flex: 1, fontSize: 11.5, fontWeight: 600, color: "#f2b8b8", background: "rgba(248,113,113,.12)", border: "1px solid rgba(248,113,113,.3)", borderRadius: 7, padding: "7px 0", cursor: "pointer" }}>Rejeter</button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Reports */}
            <div style={{ ...CARD, padding: 18 }}>
              <h2 style={H2}>Rapports</h2>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {snap.reports.map((r) => (
                  <div key={r.reportType}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
                      <div style={{ fontSize: 12.5, fontWeight: 600, color: "#dfe1e7" }}>{r.name}</div>
                      <div style={{ fontSize: 10, fontWeight: 600, color: r.status === "failure" ? "#f87171" : r.enabled ? "#4ade80" : "#6b6e78", textTransform: "uppercase" }}>
                        {r.enabled ? r.status : "off"}
                      </div>
                    </div>
                    <div style={{ fontSize: 11, color: "#7d818c" }}>
                      Dernier {r.lastRunAt ? relativeTime(r.lastRunAt) : "—"} · Prochain {r.nextRunAt ? relativeTime(r.nextRunAt) : "—"}
                    </div>
                  </div>
                ))}
              </div>
              <Link href={`${BASE}/reports`} style={{ marginTop: 12, display: "inline-flex", fontSize: 11, color: "#7d818c" }}>Configurer les rapports →</Link>
            </div>

            {/* Integrations */}
            <div style={{ ...CARD, padding: 18 }}>
              <h2 style={H2}>Santé des intégrations</h2>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {snap.integrations.map((it) => (
                  <div key={it.name} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ width: 6, height: 6, borderRadius: "50%", background: it.ok ? "#4ade80" : "#f5a623", flex: "none" }} />
                    <div style={{ flex: 1, fontSize: 12.5, color: "#dfe1e7" }}>{it.name}</div>
                    <div style={{ fontSize: 11, color: "#7d818c" }}>{it.detail}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Insights */}
            <div style={{ background: "linear-gradient(160deg,rgba(91,140,255,.08),rgba(167,139,250,.05))", border: "1px solid rgba(255,255,255,.08)", borderRadius: 16, padding: 18 }}>
              <h2 style={H2}>Insights IA</h2>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {snap.insights.map((ins, i) => (
                  <div key={i} style={{ fontSize: 12.5, color: "#c7cad3", lineHeight: 1.5, paddingLeft: 12, borderLeft: "2px solid rgba(255,255,255,.15)" }}>{ins}</div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <p style={{ textAlign: "center", fontSize: 11, color: "#6b6e78", marginTop: 28 }}>Instantané généré {relativeTime(snap.generatedAt)}</p>
      </div>

      <style>{`@media (max-width:1100px){.cc-grid{grid-template-columns:1fr !important}}`}</style>
    </div>
  );
}

function DeptCard({ d, busy, canRun, onRun }: { d: DeptDTO; busy: boolean; canRun: boolean; onRun: () => void }) {
  const c = color(d.module);
  const st = STATUS_STYLE[d.status];
  const max = Math.max(1, ...d.spark);
  return (
    <div style={{ background: "linear-gradient(180deg,rgba(255,255,255,.035),rgba(255,255,255,.02))", border: "1px solid rgba(255,255,255,.08)", borderRadius: 16, padding: 18, display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: withAlpha(c, 0.14), border: `1px solid ${withAlpha(c, 0.35)}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div style={{ width: 14, height: 14, borderRadius: "50%", border: `2px solid ${c}` }} />
          </div>
          <div style={{ minWidth: 0 }}>
            <Link href={`${BASE}/modules/${d.module}`} style={{ fontSize: 14, fontWeight: 600, color: "#eef0f4", textDecoration: "none" }}>{d.label}</Link>
            <div style={{ fontSize: 11.5, color: "#7d818c" }}>{d.model}</div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 10.5, fontWeight: 600, letterSpacing: ".03em", textTransform: "uppercase", color: st.color, background: st.bg, padding: "4px 8px", borderRadius: 20 }}>
          <span style={{ width: 5, height: 5, borderRadius: "50%", background: st.color, animation: st.pulse ? "cc-pulse 2s ease-in-out infinite" : "none" }} />
          {st.label}
        </div>
      </div>
      <div style={{ fontSize: 12.5, color: "#aeb1ba", lineHeight: 1.5, minHeight: 18, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{d.currentActivity}</div>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 2, height: 26 }}>
        {d.spark.map((v, i) => (
          <div key={i} style={{ width: 5, borderRadius: 2, background: withAlpha(c, 0.35), height: `${Math.max(8, (v / max) * 100)}%` }} />
        ))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, paddingTop: 10, borderTop: "1px solid rgba(255,255,255,.06)" }}>
        <Stat label="Exéc." value={String(d.execToday)} />
        <Stat label="Coût" value={usd(d.costTodayUsd)} />
        <Stat label="Santé" value={`${d.health}%`} valueColor={healthColor(d.health)} />
      </div>
      <button type="button" onClick={onRun} disabled={!canRun || busy} style={{ ...btnGhost, textAlign: "center", justifyContent: "center", opacity: canRun ? 1 : 0.5, cursor: canRun ? "pointer" : "not-allowed" }} title={canRun ? "Exécuter maintenant" : "Module désactivé"}>
        {busy ? "…" : "Exécuter maintenant"}
      </button>
    </div>
  );
}

function Stat({ label, value, valueColor = "#dfe1e7" }: { label: string; value: string; valueColor?: string }) {
  return (
    <div>
      <div style={{ fontSize: 9.5, color: "#6b6e78", textTransform: "uppercase", letterSpacing: ".03em" }}>{label}</div>
      <div style={{ fontSize: 13, fontWeight: 600, color: valueColor }}>{value}</div>
    </div>
  );
}

function UsageChart({ label, series, color: c }: { label: string; series: number[]; color: string }) {
  const max = Math.max(1, ...series);
  return (
    <div>
      <div style={{ fontSize: 11.5, color: "#8b8f99", marginBottom: 10 }}>{label}</div>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height: 70 }}>
        {series.map((b, i) => (
          <div key={i} style={{ flex: 1, borderRadius: "3px 3px 0 0", background: c, height: `${Math.max(3, (b / max) * 100)}%`, opacity: 0.85 }} />
        ))}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6, fontSize: 10, color: "#6b6e78" }}>
        <span>J-6</span><span>Aujourd&apos;hui</span>
      </div>
    </div>
  );
}

const btnGhost: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  background: "rgba(255,255,255,.05)",
  border: "1px solid rgba(255,255,255,.09)",
  color: "#dfe1e7",
  fontSize: 13,
  padding: "8px 14px",
  borderRadius: 8,
  cursor: "pointer",
  textDecoration: "none",
};
const btnPrimary: React.CSSProperties = {
  ...btnGhost,
  background: "#5b8cff",
  border: "1px solid #5b8cff",
  color: "#0a0b0e",
  fontWeight: 600,
};
