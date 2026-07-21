"use client";

/**
 * Global AI Operations settings (spec §2) + Discord channel configuration
 * (spec §6). No provider secret is shown or accepted here — keys live in env;
 * this form only sets the non-sensitive knobs and the purpose→channel mappings.
 */

import { useState, useTransition } from "react";
import { OpsCard } from "@/components/admin/operations/shared";
import type { AiOpsSettingsDTO } from "@/lib/ai-ops/store";
import type { ChannelMappingDTO } from "@/lib/ai-ops/discordChannels";
import { AI_PROVIDERS, CHANNEL_PURPOSES } from "@/lib/ai-ops/types";
import {
  saveAiOpsSettingsAction,
  setChannelMappingAction,
  testDiscordConnectionAction,
  testAiProviderAction,
} from "@/app/actions/aiOperations";

const PURPOSE_LABEL: Record<string, string> = {
  assistant: "Conversations assistant",
  support_approval: "File d'approbation support",
  daily_reports: "Rapports quotidiens",
  alerts: "Alertes",
  supplier_reports: "Rapports fournisseurs",
  marketing_drafts: "Brouillons marketing",
};

export default function AiOpsSettingsForm({
  settings,
  channels,
}: {
  settings: AiOpsSettingsDTO;
  channels: ChannelMappingDTO[];
}) {
  const [form, setForm] = useState<AiOpsSettingsDTO>(settings);
  const [channelMap, setChannelMap] = useState<Record<string, string>>(
    Object.fromEntries(CHANNEL_PURPOSES.map((p) => [p, channels.find((c) => c.purpose === p)?.channelId ?? ""])),
  );
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<string | null>(null);
  const [providerTest, setProviderTest] = useState<string | null>(null);

  const set = <K extends keyof AiOpsSettingsDTO>(key: K, value: AiOpsSettingsDTO[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const saveSettings = () => {
    setMessage(null);
    startTransition(async () => {
      const res = await saveAiOpsSettingsAction(form);
      setMessage(res.ok ? "Réglages enregistrés." : res.error ?? "Échec.");
    });
  };

  const saveChannel = (purpose: string) => {
    startTransition(async () => {
      const res = await setChannelMappingAction(purpose, channelMap[purpose] ?? "");
      setMessage(res.ok ? "Canal mis à jour." : res.error ?? "Échec.");
    });
  };

  const testConnection = () => {
    setTestResult("Test en cours…");
    startTransition(async () => {
      const res = await testDiscordConnectionAction();
      setTestResult(
        res.ok
          ? `Connecté en tant que ${res.botUsername} · ${res.channelCount} canaux visibles.`
          : `Échec : ${res.error}`,
      );
    });
  };

  const testProvider = () => {
    setProviderTest("Test du provider en cours…");
    startTransition(async () => {
      const res = await testAiProviderAction();
      setProviderTest(
        res.ok
          ? `OK · provider ${res.provider} · modèle ${res.model} · ${res.latencyMs} ms${res.provider !== res.configuredProvider ? ` (réglé sur ${res.configuredProvider}${res.configured ? "" : ", clé manquante"})` : ""}`
          : `Échec (${res.error}) · provider ${res.provider} · modèle ${res.model}`,
      );
    });
  };

  return (
    <div className="flex flex-col gap-5">
      <OpsCard title="Réglages globaux">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Toggle label="Activer AI Operations (interrupteur global)" checked={form.globalEnabled} onChange={(v) => set("globalEnabled", v)} />
          <Toggle label="Rédiger les valeurs sensibles du contexte AI" checked={form.redactSensitive} onChange={(v) => set("redactSensitive", v)} />
          <Field label="Fuseau horaire">
            <input className="ai-input" value={form.timezone} onChange={(e) => set("timezone", e.target.value)} />
          </Field>
          <Field label="Langue des rapports internes">
            <input className="ai-input" value={form.reportLanguage} maxLength={2} onChange={(e) => set("reportLanguage", e.target.value)} />
          </Field>
          <Field label="Provider AI par défaut">
            <select className="ai-input" value={form.defaultProvider} onChange={(e) => set("defaultProvider", e.target.value)}>
              {AI_PROVIDERS.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </Field>
          <Field label="Modèle par défaut">
            <input className="ai-input" value={form.defaultModel} onChange={(e) => set("defaultModel", e.target.value)} />
          </Field>
          <Field label="Santé du provider">
            <div className="flex flex-col gap-1">
              <button type="button" onClick={testProvider} disabled={pending} className="btn-ghost text-xs self-start">
                Tester le provider
              </button>
              {providerTest && <span className="text-xs text-muted">{providerTest}</span>}
            </div>
          </Field>
          <Field label="Budget mensuel (USD)">
            <input type="number" min={0} step="0.01" className="ai-input" value={form.monthlyBudgetUsd} onChange={(e) => set("monthlyBudgetUsd", Number(e.target.value))} />
          </Field>
          <Field label="Seuil d'avertissement (USD)">
            <input type="number" min={0} step="0.01" className="ai-input" value={form.warningThresholdUsd} onChange={(e) => set("warningThresholdUsd", Number(e.target.value))} />
          </Field>
          <Field label="Limite stricte (USD)">
            <input type="number" min={0} step="0.01" className="ai-input" value={form.hardLimitUsd} onChange={(e) => set("hardLimitUsd", Number(e.target.value))} />
          </Field>
          <Field label="Rétention des journaux AI (jours)">
            <input type="number" min={1} className="ai-input" value={form.logRetentionDays} onChange={(e) => set("logRetentionDays", Number(e.target.value))} />
          </Field>
        </div>
        <div className="mt-4 flex items-center gap-3">
          <button type="button" onClick={saveSettings} disabled={pending} className="btn-primary text-sm">
            Enregistrer
          </button>
          {message && <span className="text-xs text-muted">{message}</span>}
        </div>
      </OpsCard>

      <OpsCard
        title="Canaux Discord"
        headerRight={
          <button type="button" onClick={testConnection} disabled={pending} className="btn-ghost text-xs">
            Tester la connexion
          </button>
        }
      >
        <p className="mb-3 text-xs text-muted">
          Sélectionnez des canaux Discord EXISTANTS par ID (snowflake). Aucun canal n'est créé automatiquement. Plusieurs usages peuvent partager un canal.
        </p>
        <div className="flex flex-col gap-2.5">
          {CHANNEL_PURPOSES.map((purpose) => {
            const known = channels.find((c) => c.purpose === purpose);
            return (
              <div key={purpose} className="flex items-center gap-2">
                <label className="w-48 shrink-0 text-sm text-muted">{PURPOSE_LABEL[purpose]}</label>
                <input
                  className="ai-input flex-1"
                  placeholder="ID de canal (17–20 chiffres)"
                  value={channelMap[purpose] ?? ""}
                  onChange={(e) => setChannelMap((m) => ({ ...m, [purpose]: e.target.value }))}
                />
                {known?.channelName && <span className="w-28 truncate text-xs text-faint">#{known.channelName}</span>}
                <button type="button" onClick={() => saveChannel(purpose)} disabled={pending} className="btn-ghost text-xs">
                  Enregistrer
                </button>
              </div>
            );
          })}
        </div>
        {testResult && <p className="mt-3 text-xs text-muted">{testResult}</p>}
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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-medium text-muted">{label}</label>
      {children}
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
