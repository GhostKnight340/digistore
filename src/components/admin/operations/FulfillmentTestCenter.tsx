"use client";

import { useState } from "react";
import { runFulfillmentTestAction } from "@/app/actions/fulfillmentTest";
import type { FulfillmentTestResult, TestEnvironment, TestMode } from "@/lib/fulfillment-test/types";

type HistoryRow = {
  id: string;
  createdAt: string;
  supplier: string;
  environment: string;
  mode: string;
  durationMs: number;
  status: string;
  safeError: string | null;
};

type Dashboard = {
  history: HistoryRow[];
  successRate: number;
  averageDurationMs: number;
  lastSuccess: string | null;
  lastFailure: string | null;
  sandboxConfigured: boolean;
  liveConfigured: boolean;
  sandboxBalance: string | null;
};

/** French labels for the test modes exposed by the runner. */
const MODE_LABELS: Record<TestMode, string> = {
  full: "Pipeline complet",
  health: "Contrôles de santé",
  authenticate: "Authentification fournisseur",
  purchase: "Achat (sandbox)",
  encryption: "Chiffrement",
  email: "Rendu e-mail",
  delivery: "Génération de livraison",
  timeline: "Chronologie",
  discord: "Notification Discord",
};

const fmtDate = (iso: string) => new Date(iso).toLocaleString("fr-FR");

const STAGE_DOT: Record<string, string> = {
  passed: "#5BC98C",
  failed: "#E05C5C",
  warning: "#E8A838",
  skipped: "#7A808C",
};

const HEALTH_DOT: Record<string, string> = {
  ok: "#5BC98C",
  fail: "#E05C5C",
  info: "#7FA6FF",
};

export default function FulfillmentTestCenter({ initial }: { initial: Dashboard }) {
  const [environment, setEnvironment] = useState<TestEnvironment>("sandbox");
  const [mode, setMode] = useState<TestMode>("full");
  const [confirmation, setConfirmation] = useState("");
  const [sendDiscord, setSendDiscord] = useState(false);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<FulfillmentTestResult | null>(null);

  // Live runs use real supplier credentials, so the runner requires the admin
  // to type "CONFIRM"; keep the token exact — the server re-validates it.
  const liveBlocked = environment === "live" && confirmation !== "CONFIRM";

  async function run() {
    setRunning(true);
    try {
      setResult(await runFulfillmentTestAction({ environment, mode, confirmation, sendDiscord }));
    } finally {
      setRunning(false);
    }
  }

  const stats: Array<[string, string]> = [
    ["Environnement par défaut", "Sandbox"],
    ["Sandbox configuré", initial.sandboxConfigured ? "Oui" : "Non"],
    ["Solde sandbox", initial.sandboxBalance ?? "—"],
    ["Taux de réussite", `${initial.successRate}%`],
    ["Durée moyenne", `${initial.averageDurationMs} ms`],
    ["Dernier succès", initial.lastSuccess ? fmtDate(initial.lastSuccess) : "—"],
    ["Dernier échec", initial.lastFailure ? fmtDate(initial.lastFailure) : "—"],
    ["Production configurée", initial.liveConfigured ? "Oui" : "Non"],
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <p className="text-sm text-[#7fa6ff]">Admin / Opérations</p>
        <h1 className="text-3xl font-semibold text-white">Centre de test de fulfillment</h1>
        <p className="mt-2 text-muted">
          Exécute le vrai pipeline de livraison (abstraction fournisseur, achat, rendu e-mail) avec
          les identifiants Sandbox et des données isolées. Aucun e-mail client, commande, stock,
          statistique ou revenu n’est créé.
        </p>
      </div>

      {/* Overview */}
      <div className="grid gap-3 md:grid-cols-4">
        {stats.map(([label, value]) => (
          <div className="card p-5" key={label}>
            <div className="text-sm text-muted">{label}</div>
            <div className="mt-2 text-lg font-semibold text-white">{value}</div>
          </div>
        ))}
      </div>

      {/* Configuration + run */}
      <section className="card p-5">
        <div className="grid gap-4 md:grid-cols-3">
          <label className="text-sm text-muted">
            Fournisseur
            <select className="input mt-2 w-full" disabled>
              <option value="reloadly">Reloadly</option>
            </select>
            <span className="mt-1 block text-xs text-faint">FazerCards — bientôt disponible</span>
          </label>
          <label className="text-sm text-muted">
            Environnement
            <select
              value={environment}
              onChange={(e) => setEnvironment(e.target.value as TestEnvironment)}
              className="input mt-2 w-full"
            >
              <option value="sandbox">Sandbox (recommandé)</option>
              <option value="live">Production</option>
            </select>
          </label>
          <label className="text-sm text-muted">
            Mode de test
            <select
              value={mode}
              onChange={(e) => setMode(e.target.value as TestMode)}
              className="input mt-2 w-full"
            >
              {(Object.keys(MODE_LABELS) as TestMode[]).map((m) => (
                <option key={m} value={m}>
                  {MODE_LABELS[m]}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className="mt-4 flex items-center gap-2.5 text-sm text-muted">
          <input
            type="checkbox"
            checked={sendDiscord}
            onChange={(e) => setSendDiscord(e.target.checked)}
          />
          Envoyer une notification Discord de test (clairement marquée « [TEST] »)
        </label>

        {environment === "live" && (
          <div className="mt-5 rounded-xl border border-red-500/40 bg-red-500/10 p-4">
            <strong className="text-red-200">Ceci utilisera de VRAIS identifiants fournisseur.</strong>
            <p className="mt-1 text-sm text-red-200/80">
              Aucun produit n’est acheté en production : l’étape d’achat est ignorée. Seuls
              l’authentification et le catalogue sont vérifiés.
            </p>
            <input
              value={confirmation}
              onChange={(e) => setConfirmation(e.target.value)}
              placeholder="Saisissez CONFIRM"
              className="input mt-3 block w-full"
            />
          </div>
        )}

        <div className="mt-5 rounded-xl bg-[#121319] p-4 text-sm text-[#c5c8d0]">
          Cette action exécute le pipeline de fulfillment isolé avec le fournisseur sélectionné.
          Aucun client ne sera débité. Aucun stock de production ne sera consommé.
        </div>

        <button
          onClick={run}
          disabled={running || liveBlocked}
          className="btn-primary mt-5 w-full py-4 disabled:opacity-50"
        >
          {running ? "Exécution du pipeline…" : "Lancer le test de fulfillment"}
        </button>
      </section>

      {/* Latest result */}
      {result && (
        <section className="card p-5">
          <div className="flex items-center justify-between">
            <h2 className={`text-2xl font-semibold ${result.status === "passed" ? "text-[#5BC98C]" : "text-[#E05C5C]"}`}>
              {result.status === "passed" ? "RÉUSSI" : "ÉCHOUÉ"}
            </h2>
            <span className="text-sm text-muted">
              {result.environment} · {result.durationMs} ms · Santé {result.healthScore}%
            </span>
          </div>

          {result.productUsed && (
            <p className="mt-2 text-sm text-muted">Produit exercé : {result.productUsed}</p>
          )}

          {/* Health checks */}
          {result.healthChecks.length > 0 && (
            <div className="mt-5">
              <h3 className="mb-2 text-sm font-medium text-white">Contrôles de santé</h3>
              <div className="grid gap-2 md:grid-cols-2">
                {result.healthChecks.map((c) => (
                  <div key={c.name} className="flex items-start gap-2.5 rounded-xl bg-[#121319] p-3">
                    <span
                      className="mt-1.5 h-2 w-2 shrink-0 rounded-full"
                      style={{ background: HEALTH_DOT[c.status] ?? "#7A808C" }}
                    />
                    <span className="text-sm">
                      <span className="text-white">{c.name}</span>
                      <span className="block text-muted">{c.detail}</span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Pipeline stages */}
          <div className="mt-5 space-y-3">
            {result.stages.map((s, i) => (
              <div key={`${s.name}-${i}`} className="flex items-center justify-between rounded-xl bg-[#121319] p-4">
                <span className="flex items-center gap-2.5">
                  <span
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ background: STAGE_DOT[s.status] ?? "#7A808C" }}
                  />
                  <span className={s.status === "skipped" ? "text-faint" : "text-white"}>{s.name}</span>
                  {s.detail && <small className="ml-1 text-muted">{s.detail}</small>}
                </span>
                <span className="text-sm text-muted">{s.durationMs} ms</span>
              </div>
            ))}
          </div>

          {result.warnings.map((w) => (
            <p key={w} className="mt-4 text-amber-300">
              ⚠ {w}
            </p>
          ))}

          {result.discordSent && (
            <p className="mt-3 text-sm text-[#7FA6FF]">Notification Discord [TEST] envoyée.</p>
          )}

          {result.developerError && (
            <details className="mt-4">
              <summary className="cursor-pointer text-sm text-muted">Détails développeur (trace)</summary>
              <pre className="mt-2 overflow-x-auto rounded-xl bg-black/40 p-3 text-xs text-red-200">
                {result.developerError}
              </pre>
            </details>
          )}

          {result.emailPreview && (
            <details className="mt-5">
              <summary className="cursor-pointer text-muted">
                Aperçu e-mail — cet e-mail n’a pas été envoyé
              </summary>
              <iframe
                title="Aperçu e-mail"
                srcDoc={result.emailPreview.html}
                sandbox=""
                className="mt-3 h-96 w-full rounded-xl bg-white"
              />
            </details>
          )}
        </section>
      )}

      {/* History */}
      <section className="card p-5">
        <h2 className="text-xl font-semibold text-white">Historique des tests</h2>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-muted">
              <tr>
                <th className="pb-2 font-medium">Date</th>
                <th className="pb-2 font-medium">Fournisseur</th>
                <th className="pb-2 font-medium">Environnement</th>
                <th className="pb-2 font-medium">Mode</th>
                <th className="pb-2 font-medium">Durée</th>
                <th className="pb-2 font-medium">Statut</th>
                <th className="pb-2 font-medium">Erreur</th>
              </tr>
            </thead>
            <tbody>
              {initial.history.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-4 text-muted">
                    Aucun test exécuté pour le moment.
                  </td>
                </tr>
              ) : (
                initial.history.map((r) => (
                  <tr key={r.id} className="border-t border-white/10">
                    <td className="py-3">{fmtDate(r.createdAt)}</td>
                    <td>{r.supplier}</td>
                    <td>{r.environment}</td>
                    <td>{MODE_LABELS[r.mode as TestMode] ?? r.mode}</td>
                    <td>{r.durationMs} ms</td>
                    <td style={{ color: STAGE_DOT[r.status] ?? undefined }}>{r.status}</td>
                    <td className="text-muted">{r.safeError || "—"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
