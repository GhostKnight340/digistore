"use client";

import { useState } from "react";
import { useStoreSettings } from "@/context/StoreSettingsContext";
import ToggleSwitch from "@/components/ui/ToggleSwitch";

export default function MaintenancePanel() {
  const { settings, saveSettings } = useStoreSettings();
  const [enabled, setEnabled] = useState(settings.maintenance.enabled);
  const [message, setMessage] = useState(settings.maintenance.message);
  const [status, setStatus] = useState("");

  async function save() {
    const result = await saveSettings({
      ...settings,
      maintenance: { enabled, message },
    });
    setStatus(result.ok ? "Mode maintenance enregistré." : result.error ?? "Enregistrement impossible.");
  }

  return (
    <section className="space-y-5">
      <div className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-canvas/95 p-4 backdrop-blur">
        <div>
          <h2 className="text-xl font-bold text-white">Mode maintenance</h2>
          <p className="text-sm text-muted">Bloque la vitrine publique sans couper l'admin ni les pages client existantes.</p>
        </div>
        <button type="button" onClick={save} className="btn-primary h-10 px-4 text-xs">
          Enregistrer
        </button>
        {status ? <p className="w-full text-xs text-muted">{status}</p> : null}
      </div>

      <section className="card p-5">
        <ToggleSwitch
          label="Vitrine publique"
          checkedLabel="Maintenance active"
          uncheckedLabel="Boutique ouverte"
          checked={enabled}
          onChange={setEnabled}
        />
        <label className="mt-5 block">
          <span className="mb-2 block text-sm font-medium text-white">Message affiché</span>
          <textarea
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            rows={5}
            className="input min-h-32 py-3 text-sm"
          />
        </label>
        <div className="mt-5 rounded-xl border border-border bg-surface p-4">
          <p className="text-xs uppercase tracking-wide text-muted">Aperçu</p>
          <h3 className="mt-2 text-lg font-semibold text-white">
            {settings.branding.siteName} revient bientôt
          </h3>
          <p className="mt-2 text-sm text-muted">{message}</p>
        </div>
      </section>
    </section>
  );
}
