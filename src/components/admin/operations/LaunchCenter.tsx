"use client";

/**
 * Launch Center — the mission-control launch-readiness board.
 *
 * Server-seeded (initialReadiness/initialTasks) so the first paint is complete;
 * "Lancer l’audit" re-runs every automatic check server-side and swaps in the
 * fresh snapshot. Manual tasks are edited inline through server actions.
 *
 * Colour discipline: green/amber/red communicate operational state ONLY (via the
 * shared StatusDot/Badge). Everything else stays neutral so the signals read.
 */

import Link from "next/link";
import { useState, useTransition } from "react";
import type { ReactNode } from "react";
import {
  OpsCard,
  StatusDot,
  StatusBadge,
  WarningRow,
  relativeTime,
} from "./shared";
import type {
  LaunchReadiness,
  LaunchCategory,
  LaunchCheck,
  TimelineTask,
} from "@/lib/ops/launchReadiness";
import type { ManualTask, ManualTaskPriority } from "@/lib/ops/launchTasks";
import {
  runLaunchAuditAction,
  createManualTaskAction,
  updateManualTaskAction,
  deleteManualTaskAction,
} from "@/app/actions/launchCenter";

// ─── Status palette (state only) ─────────────────────────────────────────────

const READINESS = {
  ready: { color: "#2EA067", label: "Prêt", emoji: "🟢" },
  almost: { color: "#E8A838", label: "Presque prêt", emoji: "🟡" },
  not_ready: { color: "#E5484D", label: "Pas prêt", emoji: "🔴" },
} as const;

const PRIORITY_META: Record<ManualTaskPriority, { label: string; color: string }> = {
  critical: { label: "Critique", color: "#E5484D" },
  recommended: { label: "Recommandé", color: "#E8A838" },
  optional: { label: "Optionnel", color: "#7FA6FF" },
};

function scoreColor(score: number): string {
  return score >= 90 ? "#2EA067" : score >= 70 ? "#E8A838" : "#E5484D";
}

// ─── Readiness gauge ─────────────────────────────────────────────────────────

function Gauge({ score, color }: { score: number; color: string }) {
  const r = 52;
  const c = 2 * Math.PI * r;
  const dash = (score / 100) * c;
  return (
    <div className="relative h-32 w-32 shrink-0">
      <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90">
        <circle cx="60" cy="60" r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="10" />
        <circle
          cx="60"
          cy="60"
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={`${dash} ${c}`}
          style={{ transition: "stroke-dasharray 0.6s ease" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-3xl font-bold tabular-nums" style={{ color }}>
          {score}%
        </span>
        <span className="text-[10px] uppercase tracking-wide text-faint">Prêt</span>
      </div>
    </div>
  );
}

// ─── Category card ───────────────────────────────────────────────────────────

function CheckRow({ check }: { check: LaunchCheck }) {
  const body = (
    <div className="flex items-start gap-2.5 py-1.5">
      <span className="mt-1">
        <StatusDot status={check.status} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[12.5px] font-medium text-white/90">
          {check.label}
          {check.blocking && check.status === "offline" && (
            <span className="ml-1.5 rounded bg-[#E5484D]/15 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-[#F08084]">
              Bloquant
            </span>
          )}
        </p>
        <p className="mt-0.5 text-[11.5px] leading-snug text-muted">{check.detail}</p>
      </div>
      {check.href && (check.status === "offline" || check.status === "warning") && (
        <span className="mt-0.5 shrink-0 text-xs text-faint">→</span>
      )}
    </div>
  );
  return check.href ? (
    <Link href={check.href} className="block rounded-lg px-1.5 transition-colors hover:bg-white/[0.03]">
      {body}
    </Link>
  ) : (
    <div className="px-1.5">{body}</div>
  );
}

function CategoryCard({ category }: { category: LaunchCategory }) {
  const issues = category.checks.filter(
    (c) => c.status === "offline" || c.status === "warning",
  ).length;
  return (
    <OpsCard
      title={category.label}
      status={category.status}
      headerRight={
        category.score !== null ? (
          <span
            className="text-[13px] font-semibold tabular-nums"
            style={{ color: scoreColor(category.score) }}
          >
            {category.score}%
          </span>
        ) : (
          <span className="text-[11px] text-faint">Info</span>
        )
      }
    >
      {category.score !== null && (
        <div className="mb-2 h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
          <div
            className="h-full rounded-full"
            style={{ width: `${category.score}%`, background: scoreColor(category.score) }}
          />
        </div>
      )}
      <div className="mb-2 flex items-center justify-between text-[11px] text-faint">
        <span>{category.checks.length} vérifications</span>
        <span>{issues === 0 ? "Aucun problème" : `${issues} à traiter`}</span>
      </div>
      <div className="-mx-1.5 divide-y divide-white/[0.04]">
        {category.checks.map((c) => (
          <CheckRow key={c.id} check={c} />
        ))}
      </div>
      {category.actionHref && (
        <Link
          href={category.actionHref}
          className="mt-3 inline-flex w-full items-center justify-center rounded-lg border border-border bg-surface2/40 px-3 py-2 text-[12px] font-medium text-white/85 transition-colors hover:border-border-strong"
        >
          {category.actionLabel ?? "Ouvrir"}
        </Link>
      )}
    </OpsCard>
  );
}

// ─── Timeline ────────────────────────────────────────────────────────────────

const TIMELINE_GROUPS: { key: TimelineTask["group"]; label: string; color: string }[] = [
  { key: "critical", label: "Critique", color: "#E5484D" },
  { key: "recommended", label: "Recommandé", color: "#E8A838" },
  { key: "optional", label: "Optionnel", color: "#7FA6FF" },
  { key: "completed", label: "Terminé", color: "#2EA067" },
];

function Timeline({ tasks }: { tasks: TimelineTask[] }) {
  return (
    <section className="card p-4">
      <h2 className="mb-3 text-[13.5px] font-semibold text-white">Chronologie de lancement</h2>
      <div className="grid gap-4 lg:grid-cols-2">
        {TIMELINE_GROUPS.map((g) => {
          const items = tasks.filter((t) => t.group === g.key);
          return (
            <div key={g.key}>
              <div className="mb-1.5 flex items-center gap-2">
                <span className="h-2 w-2 rounded-full" style={{ background: g.color }} />
                <h3 className="text-[12px] font-semibold uppercase tracking-wide" style={{ color: g.color }}>
                  {g.label}
                </h3>
                <span className="text-[11px] text-faint">{items.length}</span>
              </div>
              {items.length === 0 ? (
                <p className="px-1 py-2 text-[11.5px] text-faint">Rien ici.</p>
              ) : (
                <ul className="space-y-1">
                  {items.map((t) => {
                    const row = (
                      <div className="flex items-center gap-2.5 rounded-lg border border-border/60 bg-surface2/30 px-3 py-2">
                        <StatusDot status={t.status} />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[12px] font-medium text-white/90">{t.title}</p>
                          <p className="truncate text-[10.5px] text-faint">
                            {t.system} · Effort {t.effort} · {t.priority}
                          </p>
                        </div>
                        {t.href && t.group !== "completed" && (
                          <span className="shrink-0 text-[11px] text-faint">Ouvrir →</span>
                        )}
                      </div>
                    );
                    return (
                      <li key={t.id}>
                        {t.href ? (
                          <Link href={t.href} className="block transition-opacity hover:opacity-90">
                            {row}
                          </Link>
                        ) : (
                          row
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

// ─── Quick actions ───────────────────────────────────────────────────────────

function QuickActions({ onAudit, busy }: { onAudit: () => void; busy: boolean }) {
  const links: { label: string; href: string }[] = [
    { label: "Test de commande", href: "/admin/operations/fulfillment-test" },
    { label: "Mode maintenance", href: "/admin?tab=settings" },
    { label: "Journaux / activité", href: "/admin?tab=activity" },
    { label: "AI Ops", href: "/admin/ai-operations" },
    { label: "Produits", href: "/admin?tab=products" },
    { label: "Paiements", href: "/admin?tab=payment-methods" },
    { label: "Commandes", href: "/admin?tab=orders" },
  ];
  const cls =
    "inline-flex items-center justify-center rounded-lg border border-border bg-surface2/40 px-3 py-2 text-[12px] font-medium text-white/85 transition-colors hover:border-border-strong";
  return (
    <section className="card p-4">
      <h2 className="mb-3 text-[13.5px] font-semibold text-white">Actions rapides</h2>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={onAudit} disabled={busy} className={`${cls} disabled:opacity-50`}>
          {busy ? "Vérification…" : "Vérifier la santé"}
        </button>
        {links.map((l) => (
          <Link key={l.href + l.label} href={l.href} className={cls}>
            {l.label}
          </Link>
        ))}
      </div>
    </section>
  );
}

// ─── AI Ops display ──────────────────────────────────────────────────────────

function AiOpsCard({ aiOps }: { aiOps: LaunchReadiness["aiOps"] }) {
  const rows: { label: string; value: string }[] = [
    { label: "Support client IA", value: aiOps.coverageState },
    { label: "Mode", value: aiOps.automationMode },
    { label: "Base de connaissances", value: aiOps.knowledgeLoaded ? "Chargée" : "Non chargée" },
    { label: "Règles d’automatisation", value: aiOps.automationRules },
    { label: "Dernière activation", value: aiOps.lastActivation ? relativeTime(aiOps.lastActivation) : "—" },
    { label: "Fournisseur IA", value: `${aiOps.provider} · ${aiOps.model}` },
    { label: "Consommation (mois)", value: `$${aiOps.monthSpendUsd.toFixed(2)} / $${aiOps.monthlyBudgetUsd.toFixed(0)}` },
    { label: "Intégration e-mail", value: aiOps.emailIntegration },
  ];
  return (
    <OpsCard
      title="Opérations IA"
      headerRight={<span className="text-[11px] text-faint">N’affecte pas le score</span>}
    >
      <dl className="divide-y divide-white/[0.04]">
        {rows.map((r) => (
          <div key={r.label} className="flex items-center justify-between gap-3 py-1.5">
            <dt className="text-[11.5px] text-muted">{r.label}</dt>
            <dd className="truncate text-right text-[12px] font-medium text-white/85">{r.value}</dd>
          </div>
        ))}
      </dl>
      <Link
        href="/admin/ai-operations"
        className="mt-3 inline-flex w-full items-center justify-center rounded-lg border border-border bg-surface2/40 px-3 py-2 text-[12px] font-medium text-white/85 transition-colors hover:border-border-strong"
      >
        Ouvrir AI Ops
      </Link>
    </OpsCard>
  );
}

// ─── Monitoring ──────────────────────────────────────────────────────────────

function Monitoring({ readiness }: { readiness: LaunchReadiness }) {
  return (
    <OpsCard
      title="Surveillance"
      headerRight={
        <span className="text-[11px]" style={{ color: readiness.recentFailures > 0 ? "#F08084" : "#5BC98C" }}>
          {readiness.recentFailures} échec(s) récent(s)
        </span>
      }
    >
      <div className="grid gap-2 sm:grid-cols-2">
        {readiness.monitoring.map((m) => {
          const inner = (
            <div className="flex items-center gap-2.5 rounded-xl border border-border bg-surface2/30 px-3 py-2.5">
              <StatusDot status={m.status} pulse={m.status === "healthy"} />
              <div className="min-w-0 flex-1">
                <p className="text-[12px] font-medium text-white/90">{m.label}</p>
                <p className="truncate text-[11px] text-muted">{m.message}</p>
              </div>
            </div>
          );
          return m.href ? (
            <Link key={m.key} href={m.href} className="block transition-opacity hover:opacity-90">
              {inner}
            </Link>
          ) : (
            <div key={m.key}>{inner}</div>
          );
        })}
      </div>
    </OpsCard>
  );
}

// ─── Manual tasks ────────────────────────────────────────────────────────────

function ManualTasks({
  tasks,
  onChange,
}: {
  tasks: ManualTask[];
  onChange: (tasks: ManualTask[]) => void;
}) {
  const [pending, start] = useTransition();
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [priority, setPriority] = useState<ManualTaskPriority>("recommended");

  const done = tasks.filter((t) => t.completed).length;

  const toggle = (t: ManualTask) =>
    start(async () => {
      const res = await updateManualTaskAction(t.id, { completed: !t.completed });
      if (res.ok && res.tasks) onChange(res.tasks);
    });

  const remove = (id: string) =>
    start(async () => {
      const res = await deleteManualTaskAction(id);
      if (res.ok && res.tasks) onChange(res.tasks);
    });

  const add = () =>
    start(async () => {
      if (!title.trim()) return;
      const res = await createManualTaskAction({ title, priority });
      if (res.ok && res.tasks) {
        onChange(res.tasks);
        setTitle("");
        setPriority("recommended");
        setAdding(false);
      }
    });

  const saveEdit = (id: string, patch: Partial<ManualTask>) =>
    start(async () => {
      const res = await updateManualTaskAction(id, patch);
      if (res.ok && res.tasks) {
        onChange(res.tasks);
        setEditingId(null);
      }
    });

  const inputCls =
    "w-full rounded-lg border border-border bg-surface2/40 px-3 py-2 text-[12px] text-white placeholder:text-faint focus:border-border-strong focus:outline-none";

  return (
    <section className="card p-4">
      <div className="mb-3 flex items-center gap-2">
        <h2 className="text-[13.5px] font-semibold text-white">Tâches manuelles</h2>
        <span className="text-[11px] text-faint">
          {done}/{tasks.length} terminées
        </span>
        <span className="flex-1" />
        <button
          type="button"
          onClick={() => setAdding((v) => !v)}
          className="rounded-lg border border-border bg-surface2/40 px-2.5 py-1.5 text-[11.5px] font-medium text-white/85 transition-colors hover:border-border-strong"
        >
          {adding ? "Annuler" : "+ Ajouter"}
        </button>
      </div>

      {adding && (
        <div className="mb-3 flex flex-col gap-2 rounded-xl border border-border bg-surface2/20 p-3 sm:flex-row">
          <input
            className={inputCls}
            placeholder="Titre de la tâche…"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && add()}
          />
          <select
            className={`${inputCls} sm:w-44`}
            value={priority}
            onChange={(e) => setPriority(e.target.value as ManualTaskPriority)}
          >
            <option value="critical">Critique</option>
            <option value="recommended">Recommandé</option>
            <option value="optional">Optionnel</option>
          </select>
          <button
            type="button"
            onClick={add}
            disabled={pending || !title.trim()}
            className="shrink-0 rounded-lg bg-white/10 px-4 py-2 text-[12px] font-medium text-white transition-colors hover:bg-white/15 disabled:opacity-50"
          >
            Ajouter
          </button>
        </div>
      )}

      <ul className="space-y-1.5">
        {tasks.map((t) => {
          const meta = PRIORITY_META[t.priority];
          const editing = editingId === t.id;
          return (
            <li key={t.id} className="rounded-xl border border-border/60 bg-surface2/20 px-3 py-2.5">
              <div className="flex items-start gap-3">
                <button
                  type="button"
                  onClick={() => toggle(t)}
                  disabled={pending}
                  className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors"
                  style={{
                    borderColor: t.completed ? "#2EA067" : "rgba(255,255,255,0.25)",
                    background: t.completed ? "#2EA067" : "transparent",
                  }}
                  aria-label={t.completed ? "Marquer non terminé" : "Marquer terminé"}
                >
                  {t.completed && (
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#07090f" strokeWidth="3.5">
                      <path d="M20 6 9 17l-5-5" />
                    </svg>
                  )}
                </button>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <p className={`break-words text-[12.5px] font-medium ${t.completed ? "text-faint line-through" : "text-white/90"}`}>
                      {t.title}
                    </p>
                    <span
                      className="rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide"
                      style={{ background: `${meta.color}1f`, color: meta.color }}
                    >
                      {meta.label}
                    </span>
                    {t.dueDate && (
                      <span className="text-[10.5px] text-faint">échéance {t.dueDate}</span>
                    )}
                  </div>
                  {t.description && !editing && (
                    <p className="mt-0.5 text-[11.5px] text-muted">{t.description}</p>
                  )}
                  {t.notes && !editing && (
                    <p className="mt-0.5 text-[11px] italic text-faint">Note : {t.notes}</p>
                  )}
                  {editing && (
                    <EditRow task={t} inputCls={inputCls} onSave={saveEdit} onCancel={() => setEditingId(null)} pending={pending} />
                  )}
                </div>
                <div className="flex shrink-0 gap-1">
                  <button
                    type="button"
                    onClick={() => setEditingId(editing ? null : t.id)}
                    className="rounded-md px-1.5 py-1 text-[11px] text-faint transition-colors hover:text-white/80"
                  >
                    {editing ? "Fermer" : "Éditer"}
                  </button>
                  <button
                    type="button"
                    onClick={() => remove(t.id)}
                    disabled={pending}
                    className="rounded-md px-1.5 py-1 text-[11px] text-faint transition-colors hover:text-[#F08084]"
                  >
                    Suppr.
                  </button>
                </div>
              </div>
            </li>
          );
        })}
        {tasks.length === 0 && <p className="px-1 py-3 text-[12px] text-faint">Aucune tâche manuelle.</p>}
      </ul>
    </section>
  );
}

function EditRow({
  task,
  inputCls,
  onSave,
  onCancel,
  pending,
}: {
  task: ManualTask;
  inputCls: string;
  onSave: (id: string, patch: Partial<ManualTask>) => void;
  onCancel: () => void;
  pending: boolean;
}) {
  const [description, setDescription] = useState(task.description);
  const [dueDate, setDueDate] = useState(task.dueDate ?? "");
  const [notes, setNotes] = useState(task.notes);
  const [priority, setPriority] = useState<ManualTaskPriority>(task.priority);
  return (
    <div className="mt-2 flex flex-col gap-2">
      <input className={inputCls} placeholder="Description…" value={description} onChange={(e) => setDescription(e.target.value)} />
      <div className="flex flex-col gap-2 sm:flex-row">
        <input className={`${inputCls} sm:w-44`} type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        <select className={`${inputCls} sm:w-44`} value={priority} onChange={(e) => setPriority(e.target.value as ManualTaskPriority)}>
          <option value="critical">Critique</option>
          <option value="recommended">Recommandé</option>
          <option value="optional">Optionnel</option>
        </select>
      </div>
      <textarea className={`${inputCls} min-h-[52px] resize-y`} placeholder="Notes…" value={notes} onChange={(e) => setNotes(e.target.value)} />
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => onSave(task.id, { description, dueDate: dueDate || null, notes, priority })}
          disabled={pending}
          className="rounded-lg bg-white/10 px-4 py-1.5 text-[12px] font-medium text-white transition-colors hover:bg-white/15 disabled:opacity-50"
        >
          Enregistrer
        </button>
        <button type="button" onClick={onCancel} className="rounded-lg px-3 py-1.5 text-[12px] text-faint hover:text-white/80">
          Annuler
        </button>
      </div>
    </div>
  );
}

// ─── Root ────────────────────────────────────────────────────────────────────

export default function LaunchCenter({
  initialReadiness,
  initialTasks,
}: {
  initialReadiness: LaunchReadiness;
  initialTasks: ManualTask[];
}) {
  const [readiness, setReadiness] = useState(initialReadiness);
  const [tasks, setTasks] = useState(initialTasks);
  const [pending, start] = useTransition();

  const runAudit = () =>
    start(async () => {
      const res = await runLaunchAuditAction();
      if (res.ok && res.readiness) setReadiness(res.readiness);
    });

  const r = READINESS[readiness.status];

  const issueBlock = (title: string, items: LaunchReadiness["blockers"], severity: "critical" | "warning" | "info", empty: string): ReactNode => (
    <div>
      <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-faint">{title}</h3>
      {items.length === 0 ? (
        <p className="rounded-lg border border-border/50 bg-surface2/20 px-3 py-2 text-[11.5px] text-muted">{empty}</p>
      ) : (
        <div className="space-y-1.5">
          {items.map((it, i) => (
            <WarningRow
              key={`${it.category}-${i}`}
              severity={severity}
              title={`${it.label} · ${it.category}`}
              description={it.detail}
              href={it.href}
            />
          ))}
        </div>
      )}
    </div>
  );

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <div className="min-w-0 flex-1">
          <h1 className="text-lg font-semibold text-white">Launch Center</h1>
          <p className="text-[12px] text-muted">
            Prêt à lancer et santé opérationnelle · {readiness.environment} · audit {relativeTime(readiness.generatedAt)}
          </p>
        </div>
        <button
          type="button"
          onClick={runAudit}
          disabled={pending}
          className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-white/10 px-4 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-white/15 disabled:opacity-50 sm:w-auto"
        >
          {pending ? "Audit en cours…" : "Lancer l’audit de lancement"}
        </button>
      </div>

      {/* Overall readiness */}
      <section className="card p-4 sm:p-5">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center">
          <div className="flex flex-col items-center gap-4 text-center sm:flex-row sm:gap-5 sm:text-left">
            <Gauge score={readiness.score} color={r.color} />
            <div className="min-w-0">
              <p className="text-[11px] uppercase tracking-wide text-faint">Prêt pour le lancement</p>
              <p className="mt-1 flex items-center justify-center gap-2 text-xl font-bold sm:justify-start" style={{ color: r.color }}>
                <span>{r.emoji}</span>
                {r.label}
              </p>
              <div className="mt-2 flex justify-center gap-4 text-[12px] sm:justify-start">
                <span className="text-[#F08084]">{readiness.blockers.length} bloquant(s)</span>
                <span className="text-[#F0C466]">{readiness.warnings.length} avertissement(s)</span>
              </div>
            </div>
          </div>
          <div className="grid flex-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {issueBlock("Bloquants critiques", readiness.blockers, "critical", "Aucun bloquant — rien n’empêche le lancement.")}
            {issueBlock("Avertissements", readiness.warnings.slice(0, 5), "warning", "Aucun avertissement.")}
            {issueBlock("Actions recommandées", readiness.recommendations, "info", "Tout est en ordre.")}
          </div>
        </div>
      </section>

      <QuickActions onAudit={runAudit} busy={pending} />

      {/* Categories */}
      <div className="grid gap-4 xl:grid-cols-2">
        {readiness.categories.map((cat) =>
          cat.id === "ai-operations" ? null : <CategoryCard key={cat.id} category={cat} />,
        )}
      </div>

      {/* AI Ops + Monitoring */}
      <div className="grid gap-4 xl:grid-cols-2">
        <AiOpsCard aiOps={readiness.aiOps} />
        <Monitoring readiness={readiness} />
      </div>

      <Timeline tasks={readiness.timeline} />

      <ManualTasks tasks={tasks} onChange={setTasks} />
    </div>
  );
}
