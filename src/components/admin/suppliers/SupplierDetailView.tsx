"use client";

import { useState } from "react";
import Link from "next/link";
import {
  refreshSupplierBalanceAction,
  setSupplierEnabledAction,
  testSupplierConnectionAction,
} from "@/app/actions/supplierManagement";
import type { SupplierDetailDTO, SupplierTestResultDTO } from "@/lib/dto";
import {
  EnvironmentBadge,
  SupplierHealthBadge,
  SupplierLogoTile,
  formatSupplierDate,
} from "./shared";

/**
 * /admin/suppliers/[slug] — one supplier's management page: connection,
 * statistics, balance, and the enable/disable switch (with an explicit
 * confirmation before disabling — the switch gates real purchases).
 * Credentials are shown as env-var names + configured flags only.
 */
export default function SupplierDetailView({ initial }: { initial: SupplierDetailDTO }) {
  const [supplier, setSupplier] = useState(initial);
  const [test, setTest] = useState<SupplierTestResultDTO | null>(null);
  const [testing, setTesting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [confirmDisable, setConfirmDisable] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  async function runTest() {
    setTesting(true);
    setTest(null);
    try {
      const result = await testSupplierConnectionAction(supplier.slug);
      setTest(result);
      setSupplier((current) => ({
        ...current,
        lastCheckedAt: result.checkedAt,
        ...(result.ok
          ? { lastSuccessAt: result.checkedAt, health: current.enabled ? "healthy" : "disabled" }
          : {
              lastFailureAt: result.checkedAt,
              lastFailureMessage: result.message,
              health: current.enabled ? "offline" : "disabled",
            }),
      }));
    } finally {
      setTesting(false);
    }
  }

  async function refreshBalance() {
    setRefreshing(true);
    setMessage(null);
    try {
      const result = await refreshSupplierBalanceAction(supplier.slug);
      if (result.ok && result.balance) {
        setSupplier((current) => ({ ...current, balance: result.balance }));
        setMessage({ ok: true, text: "Solde actualisé." });
      } else {
        setMessage({ ok: false, text: result.message ?? "Solde indisponible." });
      }
    } finally {
      setRefreshing(false);
    }
  }

  async function setEnabled(enabled: boolean) {
    setToggling(true);
    setMessage(null);
    try {
      const result = await setSupplierEnabledAction(supplier.slug, enabled);
      if (result.ok) {
        setSupplier((current) => ({
          ...current,
          enabled,
          health: enabled
            ? current.configured
              ? "warning" // fresh re-enable: unknown until next check
              : "unconfigured"
            : "disabled",
        }));
        setMessage({
          ok: true,
          text: enabled
            ? "Fournisseur activé."
            : "Fournisseur désactivé — plus aucun achat ne passera par lui.",
        });
      } else {
        setMessage({ ok: false, text: result.error ?? "Modification impossible." });
      }
    } finally {
      setToggling(false);
      setConfirmDisable(false);
    }
  }

  return (
    <div className="min-w-0">
      <div className="mb-4 text-xs text-faint">
        <Link href="/admin/suppliers" className="hover:text-white hover:underline">
          Fournisseurs
        </Link>{" "}
        / <span className="text-muted">{supplier.name}</span>
      </div>

      <header className="mb-6 flex flex-wrap items-center gap-4">
        <SupplierLogoTile initials={supplier.initials} accentColor={supplier.accentColor} size={56} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-xl font-semibold text-white">{supplier.name}</h1>
            <SupplierHealthBadge health={supplier.health} />
            <EnvironmentBadge environment={supplier.environment} />
          </div>
          <p className="mt-1 max-w-2xl text-sm text-muted">{supplier.description}</p>
        </div>
        <Link href={`/admin/suppliers/${supplier.slug}/logs`} className="btn-ghost h-9 px-4 text-sm">
          Journaux d’achats
        </Link>
      </header>

      {message && (
        <p
          className={`mb-4 rounded-lg px-3 py-2 text-sm ${
            message.ok ? "bg-green-500/10 text-green-400" : "bg-red-500/10 text-red-400"
          }`}
        >
          {message.text}
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Connection */}
        <section className="card p-5">
          <h2 className="text-[15px] font-semibold text-white">Connexion</h2>
          <dl className="mt-3 space-y-2 text-sm">
            <Row label="Statut API">
              <SupplierHealthBadge health={supplier.health} />
            </Row>
            <Row label="Identifiants">
              <div className="flex flex-col items-end gap-1">
                {supplier.credentials.map((credential) => (
                  <span key={credential.name} className="font-mono text-xs">
                    {credential.name}{" "}
                    {credential.set ? (
                      <span className="text-green-400">✓ configuré</span>
                    ) : (
                      <span className="text-faint">— absent</span>
                    )}
                  </span>
                ))}
              </div>
            </Row>
            <Row label="Environnement">{supplier.environment ?? "—"}</Row>
            <Row label="Dernier succès">{formatSupplierDate(supplier.lastSuccessAt)}</Row>
            <Row label="Dernier échec">
              {supplier.lastFailureAt ? (
                <span className="text-red-400">{formatSupplierDate(supplier.lastFailureAt)}</span>
              ) : (
                "—"
              )}
            </Row>
            {supplier.lastFailureMessage && (
              <p className="rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-400">
                {supplier.lastFailureMessage}
              </p>
            )}
          </dl>
          <div className="mt-4 border-t border-border pt-3">
            <button
              type="button"
              onClick={runTest}
              disabled={testing}
              className="btn-primary h-9 px-4 text-sm disabled:opacity-60"
            >
              {testing ? "Test en cours…" : "Tester la connexion"}
            </button>
            {test && (
              <div
                className={`mt-3 rounded-lg px-3 py-2.5 text-sm ${
                  test.ok ? "bg-green-500/10 text-green-400" : "bg-red-500/10 text-red-400"
                }`}
              >
                <p>
                  {test.ok ? "✓" : "✕"} {test.message}{" "}
                  <span className="opacity-75">({test.responseTimeMs} ms)</span>
                </p>
                {test.details.length > 0 && (
                  <ul className="mt-1.5 space-y-0.5 text-xs opacity-90">
                    {test.details.map((detail) => (
                      <li key={detail.label}>
                        {detail.label} : {detail.value}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        </section>

        {/* Balance */}
        <section className="card p-5">
          <h2 className="text-[15px] font-semibold text-white">Solde</h2>
          {supplier.supportsBalance ? (
            <>
              <div className="mt-3">
                {supplier.balance ? (
                  <>
                    <p className="text-2xl font-bold text-white">
                      {supplier.balance.amount}{" "}
                      <span className="text-base font-medium text-muted">
                        {supplier.balance.currency}
                      </span>
                    </p>
                    <p className="mt-1 text-xs text-faint">
                      Actualisé le {formatSupplierDate(supplier.balance.updatedAt)}
                    </p>
                  </>
                ) : (
                  <p className="text-sm text-muted">
                    Aucun solde en cache — actualisez pour interroger l’API.
                  </p>
                )}
              </div>
              <div className="mt-4 border-t border-border pt-3">
                <button
                  type="button"
                  onClick={refreshBalance}
                  disabled={refreshing}
                  className="btn-ghost h-9 px-4 text-sm disabled:opacity-60"
                >
                  {refreshing ? "Actualisation…" : "Actualiser le solde"}
                </button>
              </div>
            </>
          ) : (
            <p className="mt-3 text-sm text-muted">
              Ce fournisseur n’expose pas de solde via son API.
            </p>
          )}

          <h2 className="mt-6 text-[15px] font-semibold text-white">Statistiques</h2>
          <dl className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
            <Stat label="Achats réussis" value={String(supplier.stats.purchasesOk)} />
            <Stat
              label="Achats échoués"
              value={String(supplier.stats.purchasesFailed)}
              tone={supplier.stats.purchasesFailed > 0 ? "bad" : undefined}
            />
            <Stat
              label="Taux de succès"
              value={
                supplier.stats.successRatePct != null ? `${supplier.stats.successRatePct}%` : "—"
              }
            />
            <Stat
              label="Temps de réponse moyen"
              value={supplier.stats.avgResponseMs != null ? `${supplier.stats.avgResponseMs} ms` : "—"}
            />
            <Stat label="Produits livrés" value={String(supplier.stats.totalDelivered)} />
          </dl>
        </section>
      </div>

      {/* Configuration */}
      <section className="card mt-4 p-5">
        <h2 className="text-[15px] font-semibold text-white">Configuration</h2>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm text-white">
              {supplier.enabled ? "Fournisseur activé" : "Fournisseur désactivé"}
            </p>
            <p className="mt-0.5 max-w-xl text-xs text-muted">
              {supplier.enabled
                ? "Les livraisons peuvent déclencher des achats réels chez ce fournisseur."
                : "Aucun achat ne passera par ce fournisseur tant qu’il est désactivé."}
            </p>
          </div>
          {supplier.enabled ? (
            confirmDisable ? (
              <div className="flex items-center gap-2">
                <span className="text-xs text-amber-400">Confirmer la désactivation ?</span>
                <button
                  type="button"
                  onClick={() => setEnabled(false)}
                  disabled={toggling}
                  className="h-9 rounded-lg bg-red-500/15 px-4 text-sm font-medium text-red-400 hover:bg-red-500/25 disabled:opacity-60"
                >
                  {toggling ? "…" : "Oui, désactiver"}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmDisable(false)}
                  disabled={toggling}
                  className="btn-ghost h-9 px-4 text-sm"
                >
                  Annuler
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmDisable(true)}
                className="btn-ghost h-9 px-4 text-sm"
              >
                Désactiver
              </button>
            )
          ) : (
            <button
              type="button"
              onClick={() => setEnabled(true)}
              disabled={toggling}
              className="btn-primary h-9 px-4 text-sm disabled:opacity-60"
            >
              {toggling ? "…" : "Activer"}
            </button>
          )}
        </div>
        <p className="mt-4 border-t border-border pt-3 text-xs text-faint">
          Les identifiants sont gérés par variables d’environnement (Vercel) et ne sont jamais
          stockés en base ni affichés — seule leur présence est vérifiée ci-dessus. Modifier une
          clé = mettre à jour la variable puis redéployer.
        </p>
      </section>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <dt className="text-muted">{label}</dt>
      <dd className="text-right text-white">{children}</dd>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "bad" }) {
  return (
    <div className="rounded-xl border border-border bg-surface2/40 px-3 py-2.5">
      <dt className="text-[10.5px] font-medium uppercase tracking-wide text-faint">{label}</dt>
      <dd className={`mt-0.5 text-lg font-semibold ${tone === "bad" ? "text-red-400" : "text-white"}`}>
        {value}
      </dd>
    </div>
  );
}
