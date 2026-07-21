"use client";

/**
 * Per-module configuration (spec §3 & §5): execution mode, provider/model/
 * channel overrides, schedule, daily caps, failure notification, prompt/
 * instructions, and the explicit tool permission grants. A module can only be
 * granted tools from the safe-tool set — there is no wildcard.
 */

import { useState, useTransition } from "react";
import { OpsCard } from "@/components/admin/operations/shared";
import type { AiModuleConfigDTO } from "@/lib/ai-ops/store";
import { AI_PROVIDERS, EXECUTION_MODES, TOOL_NAMES } from "@/lib/ai-ops/types";
import { saveModuleConfigAction } from "@/app/actions/aiOperations";

export default function AiModuleConfigForm({ config }: { config: AiModuleConfigDTO }) {
  const [form, setForm] = useState(config);
  const [tools, setTools] = useState<Set<string>>(new Set(config.grantedTools));
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  const set = <K extends keyof AiModuleConfigDTO>(key: K, value: AiModuleConfigDTO[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const toggleTool = (tool: string) =>
    setTools((prev) => {
      const next = new Set(prev);
      if (next.has(tool)) next.delete(tool);
      else next.add(tool);
      return next;
    });

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

  return (
    <div className="flex flex-col gap-5">
      <OpsCard title="Configuration">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Toggle label="Activé" checked={form.enabled} onChange={(v) => set("enabled", v)} />
          <Toggle label="Notifier en cas d'échec" checked={form.notifyOnFailure} onChange={(v) => set("notifyOnFailure", v)} />
          <Field label="Mode d'exécution">
            <select className="ai-input" value={form.executionMode} onChange={(e) => set("executionMode", e.target.value as AiModuleConfigDTO["executionMode"])}>
              {EXECUTION_MODES.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </Field>
          <Field label="Planification (cron, fuseau AI Operations)">
            <input className="ai-input" placeholder="ex. 0 7 * * *" value={form.schedule ?? ""} onChange={(e) => set("schedule", e.target.value || null)} />
          </Field>
          <Field label="Provider (override)">
            <select className="ai-input" value={form.providerOverride ?? ""} onChange={(e) => set("providerOverride", e.target.value || null)}>
              <option value="">(par défaut)</option>
              {AI_PROVIDERS.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </Field>
          <Field label="Modèle (override)">
            <input className="ai-input" placeholder="(par défaut)" value={form.modelOverride ?? ""} onChange={(e) => set("modelOverride", e.target.value || null)} />
          </Field>
          <Field label="Canal Discord (override, ID)">
            <input className="ai-input" placeholder="(par défaut)" value={form.discordChannelId ?? ""} onChange={(e) => set("discordChannelId", e.target.value || null)} />
          </Field>
          <Field label="Exécutions max / jour">
            <input type="number" min={0} className="ai-input" value={form.maxExecutionsPerDay} onChange={(e) => set("maxExecutionsPerDay", Number(e.target.value))} />
          </Field>
          <Field label="Coût quotidien max estimé (USD)">
            <input type="number" min={0} step="0.01" className="ai-input" value={form.maxDailyCostUsd} onChange={(e) => set("maxDailyCostUsd", Number(e.target.value))} />
          </Field>
        </div>
        <Field label="Instructions / prompt">
          <textarea className="ai-input mt-1" rows={5} value={form.instructions} onChange={(e) => set("instructions", e.target.value)} />
        </Field>
      </OpsCard>

      <OpsCard title="Permissions d'outils">
        <p className="mb-3 text-xs text-muted">
          Le module ne peut appeler QUE les outils cochés ici. Aucune permission « AI admin » universelle.
        </p>
        <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
          {TOOL_NAMES.map((tool) => (
            <label key={tool} className="flex cursor-pointer items-center gap-2 rounded-lg border border-border bg-surface2/40 px-3 py-2 text-sm">
              <input type="checkbox" checked={tools.has(tool)} onChange={() => toggleTool(tool)} className="h-4 w-4" />
              <code className="text-[13px] text-white">{tool}</code>
            </label>
          ))}
        </div>
      </OpsCard>

      <div className="flex items-center gap-3">
        <button type="button" onClick={save} disabled={pending} className="btn-primary text-sm">
          Enregistrer le module
        </button>
        {message && <span className="text-xs text-muted">{message}</span>}
      </div>

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
