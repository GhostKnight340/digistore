"use client";

/**
 * AI Operations overview (spec §1). Server-rendered from an initial snapshot,
 * then refreshed on demand. Reuses the operations design kit (OpsCard,
 * MetricTile, StatusBadge, WarningRow) so it is visually part of the same admin,
 * not a disconnected dashboard.
 */

import Link from "next/link";
import { useState, useTransition } from "react";
import {
  MetricTile,
  OpsCard,
  StatusBadge,
  WarningRow,
  relativeTime,
} from "@/components/admin/operations/shared";
import type { AiOpsSnapshot } from "@/lib/ai-ops/dashboard";
import { setGlobalEnabledAction, runModuleNowAction } from "@/app/actions/aiOperations";

const BASE = "/admin/ai-operations";

export default function AiOpsDashboard({ initial }: { initial: AiOpsSnapshot }) {
  const [snap, setSnap] = useState<AiOpsSnapshot>(initial);
  const [pending, startTransition] = useTransition();
  const [busyModule, setBusyModule] = useState<string | null>(null);

  const toggleGlobal = () => {
    startTransition(async () => {
      const next = !snap.globalEnabled;
      const res = await setGlobalEnabledAction(next);
      if (res.ok) setSnap((s) => ({ ...s, globalEnabled: next, globalStatus: next ? "healthy" : "unknown" }));
    });
  };

  const runNow = (module: string) => {
    setBusyModule(module);
    startTransition(async () => {
      await runModuleNowAction(module);
      setBusyModule(null);
    });
  };

  const usage = snap.usage;
  const budgetTone =
    usage.hardLimitUsd > 0 && usage.monthSpendUsd >= usage.hardLimitUsd
      ? "bad"
      : usage.warningThresholdUsd > 0 && usage.monthSpendUsd >= usage.warningThresholdUsd
        ? "warn"
        : "neutral";

  return (
    <div className="flex flex-col gap-5">
      {/* Header + global switch */}
      <section className="card flex flex-wrap items-center justify-between gap-4 p-5">
        <div className="flex items-center gap-3">
          <StatusBadge status={snap.globalStatus} label={snap.globalEnabled ? "Actif" : "Désactivé"} />
          <div>
            <h1 className="text-lg font-semibold text-white">AI Operations</h1>
            <p className="text-xs text-muted">
              Provider {snap.defaultProvider} · {snap.defaultModel} · {snap.timezone}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link href={`${BASE}/conversations`} className="btn-ghost text-sm">
            Conversations
          </Link>
          <Link href={`${BASE}/settings`} className="btn-ghost text-sm">
            Réglages
          </Link>
          <button
            type="button"
            onClick={toggleGlobal}
            disabled={pending}
            className={snap.globalEnabled ? "btn-ghost text-sm" : "btn-primary text-sm"}
          >
            {snap.globalEnabled ? "Désactiver globalement" : "Activer globalement"}
          </button>
        </div>
      </section>

      {/* Metric tiles */}
      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <MetricTile
          label="Approbations en attente"
          value={snap.pendingApprovals}
          tone={snap.pendingApprovals > 0 ? "warn" : "neutral"}
          href={`${BASE}/approvals`}
        />
        <MetricTile label="Exécutions aujourd'hui" value={usage.executionsToday} href={`${BASE}/logs`} />
        <MetricTile label="Appels d'outils (jour)" value={usage.toolCallsToday} href={`${BASE}/logs`} />
        <MetricTile
          label="Coût AI estimé (mois)"
          value={`$${usage.monthSpendUsd.toFixed(2)}`}
          hint={usage.monthlyBudgetUsd > 0 ? `sur $${usage.monthlyBudgetUsd.toFixed(2)}` : "budget non défini"}
          tone={budgetTone}
        />
      </section>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        {/* Modules */}
        <div className="lg:col-span-2">
          <OpsCard title="Modules">
            <div className="flex flex-col divide-y divide-border">
              {snap.modules.map((m) => (
                <div key={m.module} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <StatusBadge status={m.status} label={m.enabled ? m.executionMode : "Off"} />
                      <Link href={`${BASE}/modules/${m.module}`} className="truncate text-sm font-medium text-white hover:underline">
                        {m.label}
                      </Link>
                    </div>
                    <p className="mt-0.5 text-xs text-muted">
                      {m.grantedToolCount} outils ·{" "}
                      {m.lastSuccessAt ? `dernier succès ${relativeTime(m.lastSuccessAt)}` : "jamais exécuté"}
                      {m.lastFailureAt ? ` · dernier échec ${relativeTime(m.lastFailureAt)}` : ""}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => runNow(m.module)}
                    disabled={pending || !snap.globalEnabled || !m.enabled}
                    className="btn-ghost shrink-0 text-xs"
                    title={!snap.globalEnabled ? "AI Operations désactivé" : !m.enabled ? "Module désactivé" : "Exécuter maintenant"}
                  >
                    {busyModule === m.module ? "…" : "Run now"}
                  </button>
                </div>
              ))}
            </div>
          </OpsCard>
        </div>

        {/* Integration health */}
        <div className="flex flex-col gap-5">
          <OpsCard title="Santé des intégrations">
            <ul className="flex flex-col gap-2 text-sm">
              <HealthRow label="Provider AI" ok={snap.providerConfigured} okText={snap.defaultProvider} offText="mock (aucune clé)" />
              <HealthRow label="Discord" ok={snap.discordConnected} okText="connecté" offText="désactivé" />
              <HealthRow label="État global" ok={snap.globalEnabled} okText="actif" offText="désactivé" />
            </ul>
            <Link href={`${BASE}/settings`} className="mt-3 inline-flex text-xs text-faint hover:text-white">
              Configurer les canaux Discord →
            </Link>
          </OpsCard>
        </div>
      </div>

      {/* Warnings */}
      {snap.warnings.length > 0 && (
        <OpsCard title="Avertissements">
          <div className="flex flex-col gap-2">
            {snap.warnings.map((w, i) => (
              <WarningRow key={i} severity={w.severity} title={w.title} description={w.description} />
            ))}
          </div>
        </OpsCard>
      )}

      {/* Recent activity */}
      <OpsCard title="Activité récente" headerRight={<Link href={`${BASE}/logs`} className="text-xs text-faint hover:text-white">Tous les journaux →</Link>}>
        {snap.recentActivity.length === 0 ? (
          <p className="text-sm text-muted">Aucune activité pour l'instant.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-border text-sm">
            {snap.recentActivity.map((a, i) => (
              <li key={i} className="flex items-center justify-between gap-3 py-2">
                <span className="truncate text-white">
                  {a.label} <span className="text-faint">· {a.module}</span>
                </span>
                <span className="flex items-center gap-2 text-xs text-muted">
                  <span className="tabular-nums">{a.status}</span>
                  <span>{relativeTime(a.at)}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </OpsCard>

      <p className="text-center text-[11px] text-faint">
        Instantané généré {relativeTime(snap.generatedAt)}
      </p>
    </div>
  );
}

function HealthRow({ label, ok, okText, offText }: { label: string; ok: boolean; okText: string; offText: string }) {
  return (
    <li className="flex items-center justify-between">
      <span className="text-muted">{label}</span>
      <StatusBadge status={ok ? "healthy" : "warning"} label={ok ? okText : offText} />
    </li>
  );
}
