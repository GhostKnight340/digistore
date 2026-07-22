"use client";

/**
 * AI Support Coverage control — the manual activation boundary.
 *
 * INACTIVE shows a clear "inactive" state + "Activate AI Support Coverage" which
 * opens a two-step setup (configure → confirmation summary) rather than turning
 * anything on immediately. Auto-send requires an explicit extra confirmation.
 * When live, shows the session state, details, counters, and a prominent
 * "Deactivate AI Coverage".
 */

import { useState, useTransition } from "react";
import { OpsCard, StatusBadge, relativeTime } from "@/components/admin/operations/shared";
import type { OpsHealthStatus } from "@/lib/dto";
import { SUPPORT_CATEGORIES } from "@/lib/support/config";
import {
  DURATIONS,
  NOTIFY_MODES,
  CONFIDENCE_LEVELS,
  COVERAGE_CHANNELS,
  type CoverageConfigInput,
  type DurationChoice,
} from "@/lib/ai-ops/support/coverageConfig";
import {
  previewCoverageAction,
  activateCoverageAction,
  deactivateCoverageAction,
  emergencyPauseCoverageAction,
  resumeCoverageAction,
} from "@/app/actions/aiSupport";
import type { CoverageOverviewDTO } from "@/lib/ai-ops/support/session";
import type { CoverageReadiness } from "@/lib/ai-ops/support/readiness";

const STATE_TONE: Record<string, OpsHealthStatus> = {
  INACTIVE: "unknown",
  SCHEDULED: "warning",
  ACTIVE_DRAFT_ONLY: "healthy",
  ACTIVE_AUTO_REPLY: "healthy",
  PAUSED: "warning",
  ENDING: "warning",
  EXPIRED: "unknown",
  ERROR: "offline",
  DEACTIVATED: "unknown",
};

const STATE_LABEL: Record<string, string> = {
  INACTIVE: "Inactive",
  SCHEDULED: "Programmée",
  ACTIVE_DRAFT_ONLY: "Active · brouillons",
  ACTIVE_AUTO_REPLY: "Active · réponses auto",
  PAUSED: "En pause",
  ENDING: "En cours de clôture",
  EXPIRED: "Expirée",
  ERROR: "Erreur",
  DEACTIVATED: "Désactivée",
};

const DURATION_LABEL: Record<DurationChoice, string> = {
  until_manual: "Jusqu'à désactivation manuelle",
  "1h": "Pendant 1 heure",
  "2h": "Pendant 2 heures",
  "4h": "Pendant 4 heures",
  until_time: "Jusqu'à une heure choisie",
  custom: "Début et fin personnalisés",
};

const NOTIFY_LABEL: Record<string, string> = {
  urgent_only: "Cas urgents uniquement",
  approvals_and_urgent: "Approbations + cas urgents",
  periodic_and_urgent: "Résumé périodique + urgents",
  all_escalations: "Toutes les escalades",
  silent_until_end: "Silencieux jusqu'à la fin",
};

const LANGUAGES = [
  { code: "fr", label: "Français" },
  { code: "en", label: "English" },
  { code: "ar", label: "العربية" },
];

const EMPTY_FORM: CoverageConfigInput = {
  duration: "until_manual",
  startAt: null,
  endAt: null,
  channels: ["support_tickets"],
  languages: ["fr"],
  categories: [],
  automationMode: "draft_only",
  confidenceThreshold: "high",
  notifyMode: "approvals_and_urgent",
  allowAutoReply: false,
  fallbackMessage: "",
};

export default function SupportCoveragePanel({ initial, readiness }: { initial: CoverageOverviewDTO; readiness: CoverageReadiness }) {
  const [overview, setOverview] = useState(initial);
  const [step, setStep] = useState<"idle" | "configure" | "confirm">("idle");
  const [form, setForm] = useState<CoverageConfigInput>(EMPTY_FORM);
  const [summary, setSummary] = useState<string[]>([]);
  const [autoSendConfirm, setAutoSendConfirm] = useState(false);
  const [needsAutoConfirm, setNeedsAutoConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deactSummary, setDeactSummary] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const state = overview.effectiveState;
  const session = overview.session;
  const isLive = state === "ACTIVE_DRAFT_ONLY" || state === "ACTIVE_AUTO_REPLY" || state === "SCHEDULED" || state === "PAUSED";

  const set = <K extends keyof CoverageConfigInput>(key: K, value: CoverageConfigInput[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const toggleList = (key: "languages" | "categories" | "channels", value: string) =>
    setForm((f) => {
      const list = new Set(f[key] ?? []);
      if (list.has(value)) list.delete(value);
      else list.add(value);
      return { ...f, [key]: [...list] };
    });

  const review = () => {
    setError(null);
    startTransition(async () => {
      const res = await previewCoverageAction(form);
      if (res.ok) {
        setSummary(res.summary);
        setNeedsAutoConfirm(res.autoSend);
        setAutoSendConfirm(false);
        setStep("confirm");
      } else {
        setError(res.error);
      }
    });
  };

  const activate = () => {
    setError(null);
    startTransition(async () => {
      const res = await activateCoverageAction(form, needsAutoConfirm ? autoSendConfirm : true);
      if (res.ok && res.overview) {
        setOverview(res.overview);
        setStep("idle");
        setForm(EMPTY_FORM);
      } else {
        setError(res.error ?? "Activation impossible.");
      }
    });
  };

  const deactivate = () => {
    setError(null);
    startTransition(async () => {
      const res = await deactivateCoverageAction();
      if (res.ok && res.overview && res.handoff) {
        setOverview(res.overview);
        const h = res.handoff;
        setDeactSummary(
          `Session terminée : ${h.newConversations} conversations reçues · ${h.casesResolved} résolues · ${h.draftsAwaiting} brouillon(s) en attente · ${h.escalations} escalade(s) · ${h.repliedAfterAiReply} réponse(s) client après IA · ${h.failedOutgoing} échec(s). ${h.recommendedNextActions.join(" ")}`,
        );
      } else {
        setError(res.error ?? "Désactivation impossible.");
      }
    });
  };

  const pauseNow = () => {
    setError(null);
    startTransition(async () => {
      const res = await emergencyPauseCoverageAction();
      if (res.ok && res.overview) setOverview(res.overview);
      else setError(res.error ?? "Pause impossible.");
    });
  };

  const resume = () => {
    setError(null);
    startTransition(async () => {
      const res = await resumeCoverageAction();
      if (res.ok && res.overview) setOverview(res.overview);
      else setError(res.error ?? "Reprise impossible.");
    });
  };

  const showEnd = form.duration === "until_time" || form.duration === "custom";
  const showStart = form.duration === "custom";
  const isAuto = form.automationMode === "auto_reply";

  return (
    <OpsCard
      title="Couverture support IA"
      status={STATE_TONE[state] ?? "unknown"}
      headerRight={<StatusBadge status={STATE_TONE[state] ?? "unknown"} label={STATE_LABEL[state] ?? state} />}
    >
      {/* ── Live / scheduled session view ─────────────────────────────── */}
      {isLive && session ? (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-muted">
            {state === "ACTIVE_AUTO_REPLY"
              ? "L'assistant peut répondre automatiquement aux cas à faible risque autorisés ; le reste est mis en attente pour vous."
              : state === "SCHEDULED"
              ? "La couverture démarrera à l'heure programmée."
              : state === "PAUSED"
              ? "Couverture en pause : aucun envoi automatique. La boîte de réception manuelle reste active."
              : "L'assistant prépare des brouillons ; rien n'est envoyé sans votre approbation ci-dessous."}
          </p>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-faint sm:grid-cols-3">
            <span>Activée {relativeTime(session.activatedAt)}{session.activatedBy ? ` · ${session.activatedBy}` : ""}</span>
            <span>Fin : {session.scheduledEndAt ? new Date(session.scheduledEndAt).toLocaleString("fr-FR") : "manuelle"}</span>
            <span>Automatisation : {session.allowAutoReply ? `auto (≥ ${session.confidenceThreshold})` : "brouillons"}</span>
            <span>Canaux : {session.channels.join(", ") || "—"}</span>
            <span>Cas traités : {session.casesProcessed}</span>
            <span>En attente : {session.messagesDrafted + session.escalationsCreated}</span>
            <span>Envois auto : {session.messagesAutoSent}</span>
            <span>Escalades : {session.escalationsCreated}</span>
            <span>Échecs : {session.failures}</span>
          </div>
          {state === "PAUSED" && session.pauseReason && (
            <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-2 text-xs text-amber-300">
              En pause : {session.pauseReason}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            {state === "PAUSED" ? (
              <button type="button" onClick={resume} disabled={pending} className="btn-primary text-xs">
                Reprendre la couverture
              </button>
            ) : (
              <button type="button" onClick={pauseNow} disabled={pending} className="btn-ghost text-xs">
                Pause d&apos;urgence
              </button>
            )}
            <button type="button" onClick={deactivate} disabled={pending} className="btn-ghost text-xs">
              Désactiver la couverture IA
            </button>
          </div>
        </div>
      ) : step === "idle" ? (
        /* ── Inactive view ───────────────────────────────────────────── */
        <div className="flex flex-col gap-3">
          {deactSummary && <p className="rounded-lg border border-border bg-surface2/40 p-3 text-xs text-muted">{deactSummary}</p>}
          <p className="text-sm text-muted">
            La couverture support IA est <strong className="text-white">inactive</strong>. La boîte de réception
            manuelle fonctionne normalement. Activez la couverture quand vous vous absentez.
          </p>

          {/* Health checklist — activation is blocked if a critical item is missing. */}
          <div className="rounded-lg border border-border bg-surface2/40 p-3">
            <p className="mb-2 text-xs font-medium text-faint">Prérequis d&apos;activation</p>
            <ul className="flex flex-col gap-1">
              {readiness.checks.map((c) => (
                <li key={c.key} className="flex items-center gap-2 text-xs">
                  <span className={c.ok ? "text-emerald-400" : c.critical ? "text-red-400" : "text-amber-400"}>
                    {c.ok ? "✓" : c.critical ? "✕" : "!"}
                  </span>
                  <span className={c.ok ? "text-muted" : "text-white"}>
                    {c.label}
                    {c.detail ? ` (${c.detail})` : ""}
                    {!c.ok && !c.critical ? " — optionnel" : ""}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <button
              type="button"
              onClick={() => { setStep("configure"); setDeactSummary(null); }}
              disabled={!readiness.canActivate}
              className="btn-primary text-xs disabled:opacity-50"
            >
              Activer la couverture support IA
            </button>
            {!readiness.canActivate && (
              <p className="mt-1 text-xs text-red-400">Résolvez les prérequis critiques (✕) avant d&apos;activer.</p>
            )}
          </div>
        </div>
      ) : step === "configure" ? (
        /* ── Configuration step ──────────────────────────────────────── */
        <div className="flex flex-col gap-4 text-sm">
          <Field label="Durée">
            <select className="w-full rounded-lg border border-border bg-surface2/40 px-3 py-1.5 text-sm text-white" value={form.duration} onChange={(e) => set("duration", e.target.value as DurationChoice)}>
              {DURATIONS.map((d) => <option key={d} value={d}>{DURATION_LABEL[d]}</option>)}
            </select>
          </Field>
          {showStart && (
            <Field label="Début">
              <input type="datetime-local" className="w-full rounded-lg border border-border bg-surface2/40 px-3 py-1.5 text-sm text-white" onChange={(e) => set("startAt", e.target.value || null)} />
            </Field>
          )}
          {showEnd && (
            <Field label="Fin">
              <input type="datetime-local" className="w-full rounded-lg border border-border bg-surface2/40 px-3 py-1.5 text-sm text-white" onChange={(e) => set("endAt", e.target.value || null)} />
            </Field>
          )}
          <Field label="Canaux couverts">
            <div className="flex flex-wrap gap-3">
              {COVERAGE_CHANNELS.map((c) => (
                <Check key={c} checked={(form.channels ?? []).includes(c)} onChange={() => toggleList("channels", c)} label="Messages support (site web)" />
              ))}
            </div>
          </Field>
          <Field label="Langues couvertes">
            <div className="flex flex-wrap gap-3">
              {LANGUAGES.map((l) => (
                <Check key={l.code} checked={(form.languages ?? []).includes(l.code)} onChange={() => toggleList("languages", l.code)} label={l.label} />
              ))}
            </div>
          </Field>
          <Field label="Catégories que l'IA peut traiter (aucune = toutes)">
            <div className="flex flex-wrap gap-2">
              {SUPPORT_CATEGORIES.map((c) => (
                <Check key={c.key} checked={(form.categories ?? []).includes(c.key)} onChange={() => toggleList("categories", c.key)} label={c.label} />
              ))}
            </div>
          </Field>
          <Field label="Niveau d'automatisation">
            <div className="flex flex-col gap-1">
              <Radio name="mode" checked={!isAuto} onChange={() => set("automationMode", "draft_only")} label="Brouillons uniquement (aucun envoi automatique)" />
              <Radio name="mode" checked={isAuto} onChange={() => set("automationMode", "auto_reply")} label="Réponses automatiques pour les cas autorisés" />
            </div>
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Seuil de confiance (envoi auto)">
              <select className="w-full rounded-lg border border-border bg-surface2/40 px-3 py-1.5 text-sm text-white" value={form.confidenceThreshold} onChange={(e) => set("confidenceThreshold", e.target.value)}>
                {CONFIDENCE_LEVELS.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </Field>
            <Field label="Notifications">
              <select className="w-full rounded-lg border border-border bg-surface2/40 px-3 py-1.5 text-sm text-white" value={form.notifyMode} onChange={(e) => set("notifyMode", e.target.value)}>
                {NOTIFY_MODES.map((n) => <option key={n} value={n}>{NOTIFY_LABEL[n]}</option>)}
              </select>
            </Field>
          </div>
          {isAuto && (
            <>
              <Check checked={form.allowAutoReply === true} onChange={() => set("allowAutoReply", !form.allowAutoReply)} label="Autoriser l'envoi automatique des réponses (cas à faible risque)" />
              <Field label="Message de repli (cas non résolus en toute sécurité)">
                <textarea className="w-full rounded-lg border border-border bg-surface2/40 px-3 py-1.5 text-sm text-white min-h-[60px]" value={form.fallbackMessage ?? ""} maxLength={600} onChange={(e) => set("fallbackMessage", e.target.value)} />
              </Field>
            </>
          )}
          {error && <p className="text-xs text-red-400">{error}</p>}
          <div className="flex gap-2">
            <button type="button" onClick={review} disabled={pending} className="btn-primary text-xs">Continuer</button>
            <button type="button" onClick={() => { setStep("idle"); setError(null); }} className="btn-ghost text-xs">Annuler</button>
          </div>
        </div>
      ) : (
        /* ── Confirmation step ───────────────────────────────────────── */
        <div className="flex flex-col gap-3 text-sm">
          <ul className="flex flex-col gap-1.5">
            {summary.map((line, i) => (
              <li key={i} className="flex gap-2 text-muted"><span className="text-faint">•</span>{line}</li>
            ))}
          </ul>
          {needsAutoConfirm && (
            <Check
              checked={autoSendConfirm}
              onChange={() => setAutoSendConfirm((v) => !v)}
              label="Je confirme l'envoi automatique de réponses aux clients pour les cas autorisés."
            />
          )}
          {error && <p className="text-xs text-red-400">{error}</p>}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={activate}
              disabled={pending || (needsAutoConfirm && !autoSendConfirm)}
              className="btn-primary text-xs"
            >
              Activer la couverture
            </button>
            <button type="button" onClick={() => { setStep("configure"); setError(null); }} className="btn-ghost text-xs">Retour</button>
          </div>
        </div>
      )}
    </OpsCard>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-medium text-faint">{label}</span>
      {children}
    </label>
  );
}

function Check({ checked, onChange, label }: { checked: boolean; onChange: () => void; label: string }) {
  return (
    <label className="flex items-center gap-2 text-xs text-muted">
      <input type="checkbox" checked={checked} onChange={onChange} className="accent-white" />
      {label}
    </label>
  );
}

function Radio({ name, checked, onChange, label }: { name: string; checked: boolean; onChange: () => void; label: string }) {
  return (
    <label className="flex items-center gap-2 text-xs text-muted">
      <input type="radio" name={name} checked={checked} onChange={onChange} className="accent-white" />
      {label}
    </label>
  );
}
