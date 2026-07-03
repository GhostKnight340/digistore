"use client";

import { useState } from "react";
import { useStoreSettings } from "@/context/StoreSettingsContext";
import ToggleSwitch from "@/components/ui/ToggleSwitch";

export default function MaintenancePanel() {
  const { settings, saveSettings } = useStoreSettings();
  const [enabled, setEnabled] = useState(settings.maintenance.enabled);
  const [message, setMessage] = useState(settings.maintenance.message);
  const [status, setStatus] = useState("");
  const [saving, setSaving] = useState(false);

  // Live persisted state (what visitors currently experience).
  const currentlyActive = settings.maintenance.enabled;

  async function save() {
    // Confirmation before enabling: this blocks the public storefront.
    if (enabled && !currentlyActive) {
      const confirmed = window.confirm(
        "Activer le mode maintenance ? La vitrine publique sera bloquée pour les visiteurs.\n\n" +
          "Vous resterez connecté à l'admin. En cas de déconnexion, /login et /admin restent " +
          "toujours accessibles pour désactiver la maintenance.",
      );
      if (!confirmed) return;
    }
    setSaving(true);
    const result = await saveSettings({
      ...settings,
      maintenance: { enabled, message },
    });
    setSaving(false);
    setStatus(result.ok ? "Mode maintenance enregistré." : result.error ?? "Enregistrement impossible.");
  }

  return (
    <section className="space-y-5">
      <div className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-base/95 p-4 backdrop-blur">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-bold text-white">Mode maintenance</h2>
            <span
              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${
                currentlyActive
                  ? "border-red-500/40 bg-red-500/10 text-red-400"
                  : "border-green-500/40 bg-green-500/10 text-green-400"
              }`}
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${currentlyActive ? "bg-red-400" : "bg-green-400"}`}
              />
              {currentlyActive ? "ACTIF" : "INACTIF"}
            </span>
          </div>
          <p className="text-sm text-muted">Bloque la vitrine publique sans couper l&apos;admin ni les pages client existantes.</p>
        </div>
        <button type="button" onClick={save} disabled={saving} className="btn-primary h-10 px-4 text-xs disabled:opacity-60">
          {saving ? "Enregistrement..." : "Enregistrer"}
        </button>
        {status ? <p className="w-full text-xs text-muted">{status}</p> : null}
      </div>

      {currentlyActive ? (
        <div className="flex items-start gap-3 rounded-xl border border-red-500/40 bg-red-500/10 p-4">
          <svg className="mt-0.5 h-5 w-5 shrink-0 text-red-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
          <div className="text-sm text-red-200">
            <p className="font-semibold text-red-300">Le mode maintenance est actif.</p>
            <p className="mt-1 text-red-200/90">
              Les visiteurs de la vitrine publique voient la page de maintenance. Les commandes
              existantes (paiement, suivi, livraison), la connexion et l&apos;admin restent accessibles.
            </p>
          </div>
        </div>
      ) : null}

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

      <section className="card p-5">
        <h3 className="text-sm font-semibold text-white">Récupération d&apos;urgence (si vous êtes bloqué)</h3>
        <p className="mt-1 text-xs text-muted">
          Le mode maintenance ne peut jamais vous enfermer dehors. Pour le désactiver :
        </p>
        <ul className="mt-3 space-y-2 text-sm text-muted">
          <li className="flex gap-2">
            <span className="text-accent-strong">1.</span>
            <span>
              Connectez-vous via <code className="rounded bg-base px-1.5 py-0.5 font-mono text-xs text-white">/login</code> puis
              ouvrez <code className="rounded bg-base px-1.5 py-0.5 font-mono text-xs text-white">/admin</code> — ces pages restent
              toujours accessibles, même pendant la maintenance.
            </span>
          </li>
          <li className="flex gap-2">
            <span className="text-accent-strong">2.</span>
            <span>
              Interrupteur global via variable d&apos;environnement :{" "}
              <code className="rounded bg-base px-1.5 py-0.5 font-mono text-xs text-white">DISABLE_MAINTENANCE=true</code> (aucune
              connexion ni base de données requise).
            </span>
          </li>
          <li className="flex gap-2">
            <span className="text-accent-strong">3.</span>
            <span>
              URL d&apos;urgence : définissez{" "}
              <code className="rounded bg-base px-1.5 py-0.5 font-mono text-xs text-white">MAINTENANCE_BYPASS_SECRET</code> puis
              visitez{" "}
              <code className="rounded bg-base px-1.5 py-0.5 font-mono text-xs text-white">/?maintenance_bypass=VOTRE_SECRET</code>{" "}
              pour débloquer votre navigateur.
            </span>
          </li>
        </ul>
      </section>
    </section>
  );
}
