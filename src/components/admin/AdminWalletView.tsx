"use client";

import { Fragment, useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { formatMAD, formatDate } from "@/lib/format";
import {
  getAdminWalletDetailAction,
  getAdminWalletLedgerAction,
  adminAdjustGhostCreditAction,
  adminSetWalletFrozenAction,
} from "@/app/actions/promo-codes";
import type {
  AdminWalletDetailDTO,
  AdminWalletLedgerPageDTO,
  WalletLedgerFilter,
} from "@/lib/dto";

const REASON_LABELS: Record<string, string> = {
  promo_reward: "Récompense code promo",
  promo_reversal: "Annulation code promo",
  order_spend: "Dépense sur commande",
  order_spend_refund: "Remboursement de dépense",
  order_refund_restore: "Restauration (commande expirée)",
  spending_milestone_reward: "Palier de fidélité",
  milestone_reversal: "Annulation de palier",
  admin_grant: "Crédit manuel (admin)",
  admin_reversal: "Débit manuel (admin)",
  expiration: "Expiration",
};

function reasonLabel(reason: string): string {
  return REASON_LABELS[reason] ?? reason;
}

function newRequestId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `req-${Date.now()}`;
}

type ActionKind = "credit" | "debit" | "freeze" | "unfreeze" | null;

export default function AdminWalletView({
  initialDetail,
  initialLedger,
}: {
  initialDetail: AdminWalletDetailDTO;
  initialLedger: AdminWalletLedgerPageDTO;
}) {
  const [detail, setDetail] = useState(initialDetail);
  const [ledger, setLedger] = useState(initialLedger);
  const [ledgerLoading, setLedgerLoading] = useState(false);
  const [filter, setFilter] = useState<WalletLedgerFilter>({});
  const [expanded, setExpanded] = useState<string | null>(null);

  const refreshDetail = useCallback(async () => {
    const next = await getAdminWalletDetailAction(detail.customerId);
    if (next) setDetail(next);
  }, [detail.customerId]);

  const loadLedger = useCallback(
    async (nextFilter: WalletLedgerFilter, page: number) => {
      setLedgerLoading(true);
      try {
        const next = await getAdminWalletLedgerAction(detail.customerId, nextFilter, page);
        setLedger(next);
      } catch (err) {
        console.error("Failed to load ledger", err);
      } finally {
        setLedgerLoading(false);
      }
    },
    [detail.customerId],
  );

  const applyFilter = useCallback(
    (patch: Partial<WalletLedgerFilter>) => {
      const next = { ...filter, ...patch };
      // Drop empty values so the filter object stays clean.
      (Object.keys(next) as (keyof WalletLedgerFilter)[]).forEach((k) => {
        if (!next[k]) delete next[k];
      });
      setFilter(next);
      loadLedger(next, 1);
    },
    [filter, loadLedger],
  );

  const totalPages = Math.max(1, Math.ceil(ledger.total / ledger.pageSize));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-white">Portefeuille Ghost Credit</h1>
          <p className="mt-0.5 text-xs text-muted">
            {detail.name} — {detail.email}
          </p>
        </div>
        <button type="button" onClick={refreshDetail} className="btn-ghost py-1 text-xs">
          Actualiser
        </button>
      </div>

      {detail.frozen ? (
        <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          <span className="font-semibold">Portefeuille gelé.</span>{" "}
          {detail.frozenReason ?? "Les dépenses sont bloquées."}
        </div>
      ) : null}

      <WalletSummary detail={detail} />

      <ReconciliationCard detail={detail} />

      <LockedOrders detail={detail} />

      <AdminActions detail={detail} onDone={refreshDetail} />

      <LedgerCard
        ledger={ledger}
        loading={ledgerLoading}
        filter={filter}
        expanded={expanded}
        onToggleExpand={(id) => setExpanded((cur) => (cur === id ? null : id))}
        onFilter={applyFilter}
        onPage={(p) => loadLedger(filter, p)}
        totalPages={totalPages}
      />
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-border bg-black/20 px-4 py-3">
      <p className="text-xs uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-1 font-semibold text-white">{value}</p>
      {hint ? <p className="mt-0.5 text-xs text-muted">{hint}</p> : null}
    </div>
  );
}

function WalletSummary({ detail }: { detail: AdminWalletDetailDTO }) {
  const next = detail.nextMilestone;
  return (
    <section className="card p-5">
      <h2 className="mb-3 font-bold text-white">Résumé</h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Solde disponible" value={formatMAD(detail.balanceMad)} />
        <Stat
          label="Crédit réservé (commandes)"
          value={formatMAD(detail.lockedMad)}
          hint={detail.lockedMad > 0 ? "Immobilisé dans des commandes en attente" : undefined}
        />
        <Stat
          label="Expiration"
          value={detail.expiresAt ? formatDate(detail.expiresAt) : "—"}
          hint={
            detail.daysUntilExpiry != null ? `Dans ${detail.daysUntilExpiry} jour(s)` : "Aucun crédit actif"
          }
        />
        <Stat
          label="Dernier gain qualifiant"
          value={detail.lastQualifyingAt ? formatDate(detail.lastQualifyingAt) : "—"}
        />
        <Stat label="Dépense qualifiante à vie" value={formatMAD(detail.qualifyingSpendMad)} />
        <Stat
          label="Statut"
          value={detail.frozen ? "Gelé" : "Actif"}
          hint={detail.reminderEnabled ? "Rappel d'expiration activé" : "Rappel désactivé"}
        />
        {next ? (
          <div className="rounded-lg border border-border bg-black/20 px-4 py-3 sm:col-span-2">
            <p className="text-xs uppercase tracking-wide text-muted">Prochain palier</p>
            <p className="mt-1 text-sm text-white">
              {formatMAD(detail.qualifyingSpendMad)} / {formatMAD(next.thresholdMad)} — encore{" "}
              <span className="font-semibold text-[#9FB8FF]">{formatMAD(next.remainingMad)}</span> pour{" "}
              <span className="font-semibold text-[#9FB8FF]">{formatMAD(next.rewardMad)}</span>
            </p>
            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-[#9FB8FF]"
                style={{
                  width: `${Math.min(100, Math.round((detail.qualifyingSpendMad / next.thresholdMad) * 100))}%`,
                }}
              />
            </div>
          </div>
        ) : (
          <Stat label="Prochain palier" value="Tous les paliers atteints" />
        )}
      </div>
    </section>
  );
}

function ReconciliationCard({ detail }: { detail: AdminWalletDetailDTO }) {
  const { reconcile } = detail;
  return (
    <section className="card p-5">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-bold text-white">Réconciliation</h2>
        <span
          className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
            reconcile.ok ? "bg-emerald-500/15 text-emerald-300" : "bg-red-500/15 text-red-300"
          }`}
        >
          {reconcile.ok ? "Cohérent" : "Écart détecté"}
        </span>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Solde recalculé (grand livre)" value={formatMAD(reconcile.derivedMad)} />
        <Stat label="Solde en cache" value={formatMAD(reconcile.cachedMad)} />
        <Stat label="Différence" value={formatMAD(reconcile.diffMad)} />
      </div>
      <p className="mt-3 text-xs text-muted">
        Vue en lecture seule. Toute correction passe par un ajustement audité ci-dessous — le solde
        n&apos;est jamais réécrit directement.
      </p>
    </section>
  );
}

function LockedOrders({ detail }: { detail: AdminWalletDetailDTO }) {
  return (
    <section className="card overflow-hidden">
      <div className="border-b border-border px-5 py-4">
        <h2 className="font-bold text-white">Crédit immobilisé par commande</h2>
        <p className="mt-0.5 text-xs text-muted">
          Crédit réservé dans des commandes en attente de paiement. La libération se fait uniquement
          via le flux de commande sécurisé (annulation / expiration) — aucun déblocage manuel direct.
        </p>
      </div>
      {detail.lockedOrders.length === 0 ? (
        <p className="px-5 py-6 text-sm text-muted">Aucun crédit immobilisé.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase text-muted">
              <tr className="border-b border-border">
                <th className="px-5 py-3 font-medium">Commande</th>
                <th className="px-5 py-3 font-medium">Montant réservé</th>
                <th className="px-5 py-3 font-medium">Créée le</th>
                <th className="px-5 py-3 font-medium">Statut</th>
                <th className="px-5 py-3 font-medium text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {detail.lockedOrders.map((o) => (
                <tr key={o.orderId} className="border-b border-border/60">
                  <td className="px-5 py-3 font-medium text-white">{o.publicOrderNumber}</td>
                  <td className="px-5 py-3 text-white">{formatMAD(o.amountMad)}</td>
                  <td className="px-5 py-3 text-muted">{formatDate(o.createdAt)}</td>
                  <td className="px-5 py-3 text-muted">{o.status}</td>
                  <td className="px-5 py-3 text-right">
                    <Link href={`/admin/orders/${o.orderId}`} className="text-xs text-[#9FB8FF] hover:underline">
                      Ouvrir
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function AdminActions({ detail, onDone }: { detail: AdminWalletDetailDTO; onDone: () => Promise<void> }) {
  const [action, setAction] = useState<ActionKind>(null);
  return (
    <section className="card p-5">
      <h2 className="mb-1 font-bold text-white">Actions administrateur</h2>
      <p className="mb-4 text-xs text-muted">
        Chaque action exige un motif et crée une écriture de grand livre (jamais de réécriture du solde).
      </p>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => setAction("credit")} className="btn-ghost text-xs">
          Créditer manuellement
        </button>
        <button type="button" onClick={() => setAction("debit")} className="btn-ghost text-xs">
          Débiter / annuler
        </button>
        {detail.frozen ? (
          <button type="button" onClick={() => setAction("unfreeze")} className="btn-ghost text-xs">
            Dégeler le portefeuille
          </button>
        ) : (
          <button type="button" onClick={() => setAction("freeze")} className="btn-ghost text-xs">
            Geler le portefeuille
          </button>
        )}
      </div>

      {action ? (
        <ActionModal
          kind={action}
          detail={detail}
          onClose={() => setAction(null)}
          onDone={async () => {
            setAction(null);
            await onDone();
          }}
        />
      ) : null}
    </section>
  );
}

function ActionModal({
  kind,
  detail,
  onClose,
  onDone,
}: {
  kind: Exclude<ActionKind, null>;
  detail: AdminWalletDetailDTO;
  onClose: () => void;
  onDone: () => Promise<void>;
}) {
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [requestId] = useState(newRequestId);

  const isAdjust = kind === "credit" || kind === "debit";
  const amountMad = Math.max(0, Math.round(Number(amount) || 0));
  const resultingBalance = useMemo(() => {
    if (kind === "credit") return detail.balanceMad + amountMad;
    if (kind === "debit") return detail.balanceMad - amountMad;
    return detail.balanceMad;
  }, [kind, detail.balanceMad, amountMad]);

  const title =
    kind === "credit"
      ? "Créditer manuellement"
      : kind === "debit"
        ? "Débiter / annuler"
        : kind === "freeze"
          ? "Geler le portefeuille"
          : "Dégeler le portefeuille";

  const canSubmit =
    reason.trim().length > 0 && (!isAdjust || amountMad > 0) && (kind !== "debit" || amountMad <= detail.balanceMad);

  async function submit() {
    setBusy(true);
    setError("");
    try {
      let res;
      if (isAdjust) {
        res = await adminAdjustGhostCreditAction({
          customerEmail: detail.email,
          direction: kind === "credit" ? "credit" : "debit",
          amountMad,
          reason: reason.trim(),
          requestId,
        });
      } else {
        res = await adminSetWalletFrozenAction({
          customerEmail: detail.email,
          frozen: kind === "freeze",
          reason: reason.trim(),
        });
      }
      if (!res.ok) {
        setError(res.error ?? "Action impossible.");
        return;
      }
      await onDone();
    } catch (err) {
      console.error("Wallet admin action failed", err);
      setError("Action impossible.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-md rounded-xl border border-border bg-[#12141c] p-5 shadow-xl">
        <h3 className="font-bold text-white">{title}</h3>
        <p className="mt-1 text-xs text-muted">
          {detail.name} — solde actuel {formatMAD(detail.balanceMad)}
        </p>

        <div className="mt-4 space-y-3">
          {isAdjust ? (
            <label className="block text-sm">
              <span className="text-muted">Montant (MAD)</span>
              <input
                type="number"
                min={1}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="mt-1 w-full rounded-md border border-border bg-black/30 px-3 py-2 text-white"
              />
            </label>
          ) : null}
          <label className="block text-sm">
            <span className="text-muted">Motif (obligatoire)</span>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={2}
              className="mt-1 w-full rounded-md border border-border bg-black/30 px-3 py-2 text-white"
            />
          </label>

          {isAdjust ? (
            <div className="rounded-md border border-border bg-black/20 px-3 py-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted">Montant</span>
                <span className="text-white">
                  {kind === "credit" ? "+" : "−"}
                  {formatMAD(amountMad)}
                </span>
              </div>
              <div className="mt-1 flex justify-between">
                <span className="text-muted">Solde après opération</span>
                <span className="font-semibold text-white">{formatMAD(resultingBalance)}</span>
              </div>
            </div>
          ) : null}

          {kind === "credit" ? (
            <p className="rounded-md bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
              Ce crédit manuel ne prolonge pas la durée de validité du portefeuille.
            </p>
          ) : null}
          {kind === "debit" && amountMad > detail.balanceMad ? (
            <p className="text-xs text-red-400">Le montant dépasse le solde disponible.</p>
          ) : null}
          {error ? <p className="text-xs text-red-400">{error}</p> : null}
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} disabled={busy} className="btn-ghost text-xs">
            Annuler
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={!canSubmit || busy}
            className="rounded-md bg-[#9FB8FF] px-3 py-1.5 text-xs font-semibold text-black hover:bg-[#b6c9ff] disabled:opacity-50"
          >
            {busy ? "..." : "Confirmer"}
          </button>
        </div>
      </div>
    </div>
  );
}

const FILTER_REASONS = Object.keys(REASON_LABELS);

function LedgerCard({
  ledger,
  loading,
  filter,
  expanded,
  onToggleExpand,
  onFilter,
  onPage,
  totalPages,
}: {
  ledger: AdminWalletLedgerPageDTO;
  loading: boolean;
  filter: WalletLedgerFilter;
  expanded: string | null;
  onToggleExpand: (id: string) => void;
  onFilter: (patch: Partial<WalletLedgerFilter>) => void;
  onPage: (page: number) => void;
  totalPages: number;
}) {
  return (
    <section className="card overflow-hidden">
      <div className="border-b border-border px-5 py-4">
        <h2 className="font-bold text-white">Grand livre</h2>
        <p className="mt-0.5 text-xs text-muted">{ledger.total} écriture(s) — historique en lecture seule.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <select
            value={filter.direction ?? "all"}
            onChange={(e) => onFilter({ direction: e.target.value as WalletLedgerFilter["direction"] })}
            className="rounded-md border border-border bg-black/30 px-2 py-1 text-xs text-white"
          >
            <option value="all">Crédit &amp; débit</option>
            <option value="credit">Crédit</option>
            <option value="debit">Débit</option>
          </select>
          <select
            value={filter.reason ?? ""}
            onChange={(e) => onFilter({ reason: e.target.value })}
            className="rounded-md border border-border bg-black/30 px-2 py-1 text-xs text-white"
          >
            <option value="">Tous les types</option>
            {FILTER_REASONS.map((r) => (
              <option key={r} value={r}>
                {reasonLabel(r)}
              </option>
            ))}
          </select>
          <input
            type="text"
            placeholder="Statut"
            defaultValue={filter.status ?? ""}
            onBlur={(e) => onFilter({ status: e.target.value.trim() })}
            className="w-24 rounded-md border border-border bg-black/30 px-2 py-1 text-xs text-white"
          />
          <input
            type="date"
            value={filter.from ?? ""}
            onChange={(e) => onFilter({ from: e.target.value })}
            className="rounded-md border border-border bg-black/30 px-2 py-1 text-xs text-white"
          />
          <input
            type="date"
            value={filter.to ?? ""}
            onChange={(e) => onFilter({ to: e.target.value })}
            className="rounded-md border border-border bg-black/30 px-2 py-1 text-xs text-white"
          />
          <input
            type="text"
            placeholder="ID commande"
            defaultValue={filter.orderId ?? ""}
            onBlur={(e) => onFilter({ orderId: e.target.value.trim() })}
            className="w-32 rounded-md border border-border bg-black/30 px-2 py-1 text-xs text-white"
          />
        </div>
      </div>

      {loading ? (
        <p className="px-5 py-8 text-sm text-muted">Chargement...</p>
      ) : ledger.rows.length === 0 ? (
        <p className="px-5 py-8 text-sm text-muted">Aucune écriture pour ces filtres.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase text-muted">
              <tr className="border-b border-border">
                <th className="px-5 py-3 font-medium">Date</th>
                <th className="px-5 py-3 font-medium">Type</th>
                <th className="px-5 py-3 font-medium">Sens</th>
                <th className="px-5 py-3 font-medium">Montant</th>
                <th className="px-5 py-3 font-medium">Statut</th>
                <th className="px-5 py-3 font-medium">Lien</th>
                <th className="px-5 py-3 font-medium text-right">Détails</th>
              </tr>
            </thead>
            <tbody>
              {ledger.rows.map((row) => (
                <Fragment key={row.id}>
                  <tr className="border-b border-border/60">
                    <td className="px-5 py-3 text-muted">{formatDate(row.createdAt)}</td>
                    <td className="px-5 py-3 text-white">{reasonLabel(row.reason)}</td>
                    <td className="px-5 py-3">
                      <span
                        className={
                          row.direction === "credit" ? "text-emerald-400" : "text-red-400"
                        }
                      >
                        {row.direction === "credit" ? "Crédit" : "Débit"}
                      </span>
                    </td>
                    <td className="px-5 py-3 font-medium text-white">
                      {row.direction === "credit" ? "+" : "−"}
                      {formatMAD(row.amountMad)}
                    </td>
                    <td className="px-5 py-3 text-muted">{row.status}</td>
                    <td className="px-5 py-3 text-xs">
                      {row.orderId ? (
                        <Link href={`/admin/orders/${row.orderId}`} className="text-[#9FB8FF] hover:underline">
                          Commande
                        </Link>
                      ) : row.promoCode ? (
                        <span className="text-muted">Promo {row.promoCode}</span>
                      ) : row.milestoneId ? (
                        <span className="text-muted">Palier</span>
                      ) : (
                        <span className="text-faint">—</span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => onToggleExpand(row.id)}
                        className="text-xs text-muted hover:text-white"
                      >
                        {expanded === row.id ? "Masquer" : "Voir"}
                      </button>
                    </td>
                  </tr>
                  {expanded === row.id ? (
                    <tr className="border-b border-border/60 bg-black/20">
                      <td colSpan={7} className="px-5 py-3">
                        <dl className="grid gap-x-6 gap-y-1 text-xs sm:grid-cols-2">
                          <div className="flex gap-2">
                            <dt className="text-muted">Réf. idempotence</dt>
                            <dd className="break-all font-mono text-white">{row.idempotencyKey}</dd>
                          </div>
                          <div className="flex gap-2">
                            <dt className="text-muted">Source</dt>
                            <dd className="text-white">{row.source}</dd>
                          </div>
                          <div className="flex gap-2">
                            <dt className="text-muted">Réinitialise l&apos;expiration</dt>
                            <dd className="text-white">{row.resetsExpiration ? "Oui" : "Non"}</dd>
                          </div>
                          {row.thresholdMad != null ? (
                            <div className="flex gap-2">
                              <dt className="text-muted">Palier</dt>
                              <dd className="text-white">{formatMAD(row.thresholdMad)}</dd>
                            </div>
                          ) : null}
                          {row.note ? (
                            <div className="flex gap-2 sm:col-span-2">
                              <dt className="text-muted">Motif / note</dt>
                              <dd className="text-white">{row.note}</dd>
                            </div>
                          ) : null}
                        </dl>
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 ? (
        <div className="flex items-center justify-between border-t border-border px-5 py-3 text-xs text-muted">
          <span>
            Page {ledger.page} / {totalPages}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={ledger.page <= 1 || loading}
              onClick={() => onPage(ledger.page - 1)}
              className="btn-ghost px-2 py-1 disabled:opacity-40"
            >
              Précédent
            </button>
            <button
              type="button"
              disabled={ledger.page >= totalPages || loading}
              onClick={() => onPage(ledger.page + 1)}
              className="btn-ghost px-2 py-1 disabled:opacity-40"
            >
              Suivant
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
