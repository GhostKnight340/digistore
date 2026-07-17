"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  getOperationsSnapshotAction,
  refreshAllSupplierBalancesAction,
  refreshAllSupplierHealthAction,
  toggleMaintenanceAction,
} from "@/app/actions/operations";
import type { OperationsSnapshotDTO, OpsActivityItemDTO } from "@/lib/dto";
import { MetricTile, OpsCard, StatusBadge, StatusDot, WarningRow, relativeTime } from "./shared";

/** Auto-refresh cadence. Cheap snapshot (cached supplier state, no provider calls). */
const POLL_MS = 20_000;

export default function OperationsDashboard({ initial }: { initial: OperationsSnapshotDTO }) {
  const [snapshot, setSnapshot] = useState(initial);
  const [refreshing, setRefreshing] = useState(false);
  const [actionMsg, setActionMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [activityFilter, setActivityFilter] = useState<OpsActivityItemDTO["kind"] | "all">("all");
  const busyRef = useRef(false);

  const reload = useCallback(async (manual = false) => {
    if (busyRef.current) return;
    busyRef.current = true;
    if (manual) setRefreshing(true);
    try {
      setSnapshot(await getOperationsSnapshotAction());
    } catch {
      /* keep the last good snapshot on a transient failure */
    } finally {
      busyRef.current = false;
      if (manual) setRefreshing(false);
    }
  }, []);

  // Live polling — only refetches the snapshot; no full-page reload. Pauses
  // while the tab is hidden to avoid needless load.
  useEffect(() => {
    const timer = setInterval(() => {
      if (!document.hidden) void reload();
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [reload]);

  async function runQuickAction(label: string, fn: () => Promise<unknown>) {
    setActionMsg(null);
    setRefreshing(true);
    try {
      await fn();
      await reload();
      setActionMsg({ ok: true, text: `${label} — terminé.` });
    } catch {
      setActionMsg({ ok: false, text: `${label} — échec.` });
    } finally {
      setRefreshing(false);
    }
  }

  const filteredActivity =
    activityFilter === "all"
      ? snapshot.activity
      : snapshot.activity.filter((a) => a.kind === activityFilter);

  return (
    <div className="min-w-0 space-y-5">
      {/* Header */}
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <StatusDot status={snapshot.overallStatus} pulse />
          <div>
            <h1 className="text-xl font-semibold text-white">Centre de contrôle</h1>
            <p className="text-xs text-muted">
              {snapshot.environmentLabel} · version {snapshot.version} · mis à jour{" "}
              {relativeTime(snapshot.generatedAt)}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge status={snapshot.overallStatus} />
          <button
            type="button"
            onClick={() => reload(true)}
            disabled={refreshing}
            className="btn-ghost h-9 px-4 text-sm disabled:opacity-60"
          >
            {refreshing ? "Actualisation…" : "Actualiser"}
          </button>
        </div>
      </header>

      {actionMsg && (
        <p
          className={`rounded-lg px-3 py-2 text-sm ${
            actionMsg.ok ? "bg-green-500/10 text-green-400" : "bg-red-500/10 text-red-400"
          }`}
        >
          {actionMsg.text}
        </p>
      )}

      {/* Warnings — auto-resolve (disappear) once the condition clears. */}
      {snapshot.warnings.length > 0 && (
        <section className="space-y-2">
          {snapshot.warnings.map((w) => (
            <WarningRow
              key={w.id}
              severity={w.severity}
              title={w.title}
              description={w.description}
              href={w.resolveHref}
            />
          ))}
        </section>
      )}

      {/* Quick actions toolbar */}
      <QuickActions
        maintenanceEnabled={snapshot.maintenanceEnabled}
        busy={refreshing}
        onAction={runQuickAction}
      />

      {/* Main grid */}
      <div className="grid gap-4 xl:grid-cols-2">
        <SystemHealthCard snapshot={snapshot} />
        <SuppliersCard snapshot={snapshot} />
        <OrdersCard snapshot={snapshot} />
        <PaymentsCard snapshot={snapshot} />
        <ProductsCard snapshot={snapshot} />
        <NotificationsCard snapshot={snapshot} />
      </div>

      {/* Recent activity */}
      <ActivityFeed
        items={filteredActivity}
        filter={activityFilter}
        onFilter={setActivityFilter}
        total={snapshot.activity.length}
      />
    </div>
  );
}

// ── Quick actions ─────────────────────────────────────────────────────────────

function QuickActions({
  maintenanceEnabled,
  busy,
  onAction,
}: {
  maintenanceEnabled: boolean;
  busy: boolean;
  onAction: (label: string, fn: () => Promise<unknown>) => Promise<void>;
}) {
  const [confirmMaint, setConfirmMaint] = useState(false);

  return (
    <section className="card p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="mr-1 text-[11px] font-medium uppercase tracking-wide text-faint">
          Actions rapides
        </span>
        <button
          type="button"
          disabled={busy}
          onClick={() => onAction("Test des fournisseurs", refreshAllSupplierHealthAction)}
          className="btn-ghost h-8 px-3 text-xs disabled:opacity-60"
        >
          Tester les fournisseurs
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => onAction("Actualisation des soldes", refreshAllSupplierBalancesAction)}
          className="btn-ghost h-8 px-3 text-xs disabled:opacity-60"
        >
          Actualiser les soldes
        </button>
        <QuickLink href="/admin?tab=orders" label="Paiements à vérifier" />
        <QuickLink href="/admin/suppliers" label="Journaux fournisseurs" />
        <QuickLink href="/admin?tab=email-templates" label="E-mails échoués" />
        <span className="flex-1" />
        {/* Maintenance toggle — confirmation required (takes the shop down). */}
        {confirmMaint ? (
          <span className="flex items-center gap-2">
            <span className="text-xs text-amber-400">
              {maintenanceEnabled ? "Désactiver la maintenance ?" : "Activer la maintenance ?"}
            </span>
            <button
              type="button"
              disabled={busy}
              onClick={async () => {
                await onAction(
                  maintenanceEnabled ? "Maintenance désactivée" : "Maintenance activée",
                  () => toggleMaintenanceAction(!maintenanceEnabled),
                );
                setConfirmMaint(false);
              }}
              className="h-8 rounded-lg bg-amber-500/15 px-3 text-xs font-medium text-amber-400"
            >
              Confirmer
            </button>
            <button
              type="button"
              onClick={() => setConfirmMaint(false)}
              className="btn-ghost h-8 px-3 text-xs"
            >
              Annuler
            </button>
          </span>
        ) : (
          <button
            type="button"
            disabled={busy}
            onClick={() => setConfirmMaint(true)}
            className="h-8 rounded-lg border border-border-strong px-3 text-xs text-text disabled:opacity-60"
          >
            {maintenanceEnabled ? "Sortir de maintenance" : "Mode maintenance"}
          </button>
        )}
      </div>
    </section>
  );
}

function QuickLink({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} className="btn-ghost h-8 px-3 text-xs">
      {label}
    </Link>
  );
}

// ── Section cards ─────────────────────────────────────────────────────────────

function SystemHealthCard({ snapshot }: { snapshot: OperationsSnapshotDTO }) {
  return (
    <OpsCard title="Santé du système" status={snapshot.overallStatus}>
      <ul className="divide-y divide-border">
        {snapshot.health.map((h) => (
          <li key={h.key} className="flex items-start gap-3 py-2.5 first:pt-0 last:pb-0">
            <StatusDot status={h.status} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[13px] font-medium text-white">{h.label}</p>
                {h.responseTimeMs != null && (
                  <span className="shrink-0 text-[11px] tabular-nums text-faint">{h.responseTimeMs} ms</span>
                )}
              </div>
              <p className="text-xs text-muted">{h.message}</p>
              {h.action && h.status !== "healthy" && (
                <p className="mt-0.5 text-[11px] text-amber-400">{h.action}</p>
              )}
            </div>
          </li>
        ))}
      </ul>
    </OpsCard>
  );
}

function SuppliersCard({ snapshot }: { snapshot: OperationsSnapshotDTO }) {
  return (
    <OpsCard
      title="Fournisseurs"
      headerRight={
        <Link href="/admin/suppliers" className="text-xs text-accent-blue hover:underline">
          Gérer
        </Link>
      }
    >
      {snapshot.suppliers.length === 0 ? (
        <EmptyState text="Aucun fournisseur configuré." />
      ) : (
        <ul className="space-y-2">
          {snapshot.suppliers.map((s) => {
            const status =
              s.health === "healthy"
                ? "healthy"
                : s.health === "offline"
                  ? "offline"
                  : s.health === "warning"
                    ? "warning"
                    : "unknown";
            return (
              <li key={s.slug}>
                <Link
                  href={`/admin/suppliers/${s.slug}`}
                  className="flex items-center gap-3 rounded-xl border border-border px-3 py-2.5 hover:border-border-strong"
                >
                  <span
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[10px] font-bold text-white"
                    style={{
                      background: `linear-gradient(150deg, ${s.accentColor}55, ${s.accentColor}22)`,
                      border: `1px solid ${s.accentColor}66`,
                    }}
                  >
                    {s.initials}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-[13px] font-semibold text-white">{s.name}</p>
                      <StatusDot status={status} />
                      {!s.enabled && s.configured && (
                        <span className="text-[10px] text-faint">désactivé</span>
                      )}
                    </div>
                    <p className="text-[11px] text-muted">
                      {s.balance
                        ? `Solde ${s.balance.amount} ${s.balance.currency}`
                        : s.supportsBalance
                          ? "Solde non chargé"
                          : "Solde non supporté"}
                      {s.recentPurchases.failed > 0 && (
                        <span className="text-red-400"> · {s.recentPurchases.failed} échec(s) 7 j</span>
                      )}
                    </p>
                  </div>
                  {s.environment && (
                    <span className="shrink-0 text-[10px] uppercase tracking-wide text-faint">
                      {s.environment}
                    </span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </OpsCard>
  );
}

function OrdersCard({ snapshot }: { snapshot: OperationsSnapshotDTO }) {
  const o = snapshot.orders;
  return (
    <OpsCard
      title="Commandes"
      headerRight={
        <Link href="/admin?tab=orders" className="text-xs text-accent-blue hover:underline">
          Toutes
        </Link>
      }
    >
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <MetricTile label="En attente paiement" value={o.pendingPayment} href="/admin?tab=orders" />
        <MetricTile
          label="À vérifier"
          value={o.paymentSubmitted}
          tone={o.paymentSubmitted > 0 ? "warn" : "neutral"}
          href="/admin?tab=orders"
        />
        <MetricTile
          label="Prêt à livrer"
          value={o.readyForFulfillment}
          tone={o.readyForFulfillment > 0 ? "good" : "neutral"}
          href="/admin?tab=orders"
        />
        <MetricTile
          label="Problème paiement"
          value={o.paymentIssue}
          tone={o.paymentIssue > 0 ? "bad" : "neutral"}
          href="/admin?tab=orders"
        />
        <MetricTile
          label="Attente trop longue"
          value={o.waitingTooLong}
          tone={o.waitingTooLong > 0 ? "warn" : "neutral"}
          href="/admin?tab=orders"
        />
        <MetricTile
          label="Achats échoués (auj.)"
          value={o.recentFailedPurchases}
          tone={o.recentFailedPurchases > 0 ? "bad" : "neutral"}
          href="/admin/suppliers"
        />
        <MetricTile label="Livrées (auj.)" value={o.deliveredToday} tone="good" />
        <MetricTile label="Annulées (auj.)" value={o.cancelledToday} />
        <MetricTile label="Refusées (auj.)" value={o.rejectedToday} />
      </div>
      {o.newest.length > 0 && (
        <div className="mt-3 border-t border-border pt-2.5">
          <p className="mb-1.5 text-[10px] font-medium uppercase tracking-wide text-faint">
            Dernières commandes
          </p>
          <ul className="space-y-1">
            {o.newest.slice(0, 4).map((row) => (
              <li key={row.id}>
                <Link
                  href={`/admin/orders/${row.id}`}
                  className="flex items-center justify-between gap-2 text-xs text-muted hover:text-white"
                >
                  <span className="truncate">{row.label}</span>
                  <span className="shrink-0 text-faint">{relativeTime(row.createdAt)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </OpsCard>
  );
}

function PaymentsCard({ snapshot }: { snapshot: OperationsSnapshotDTO }) {
  const p = snapshot.payments;
  return (
    <OpsCard
      title="Paiements"
      headerRight={
        <Link href="/admin?tab=payment-methods" className="text-xs text-accent-blue hover:underline">
          Moyens
        </Link>
      }
    >
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <MetricTile label="Moyens actifs" value={p.activeMethods} tone="good" href="/admin?tab=payment-methods" />
        <MetricTile label="Moyens désactivés" value={p.disabledMethods} href="/admin?tab=payment-methods" />
        <MetricTile
          label="À vérifier"
          value={p.awaitingReview}
          tone={p.awaitingReview > 0 ? "warn" : "neutral"}
          href="/admin?tab=orders"
        />
        <MetricTile label="Confirmés (auj.)" value={p.confirmedToday} tone="good" />
        <MetricTile label="Refusés (auj.)" value={p.rejectedToday} tone={p.rejectedToday > 0 ? "warn" : "neutral"} />
        <MetricTile
          label="Délai confirmation"
          value={p.avgConfirmationMinutes != null ? `${p.avgConfirmationMinutes} min` : "—"}
          hint="moyenne 7 j"
        />
      </div>
      {p.misconfiguredMethods.length > 0 && (
        <div className="mt-3 space-y-1.5 border-t border-border pt-2.5">
          {p.misconfiguredMethods.map((m) => (
            <p key={m.id} className="rounded-lg bg-amber-500/10 px-2.5 py-1.5 text-[11px] text-amber-400">
              ⚠ {m.name} : {m.reason}
            </p>
          ))}
        </div>
      )}
    </OpsCard>
  );
}

function ProductsCard({ snapshot }: { snapshot: OperationsSnapshotDTO }) {
  const p = snapshot.products;
  return (
    <OpsCard
      title="Produits"
      headerRight={
        <Link href="/admin?tab=products" className="text-xs text-accent-blue hover:underline">
          Gérer
        </Link>
      }
    >
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <MetricTile label="Produits parents" value={p.totalParents} href="/admin?tab=products" />
        <MetricTile label="Masqués" value={p.hidden} href="/admin?tab=products" />
        <MetricTile
          label="Sans approvisionnement"
          value={p.missingSupplyRoute}
          tone={p.missingSupplyRoute > 0 ? "bad" : "neutral"}
          href="/admin?tab=products"
        />
        <MetricTile
          label="Mapping incomplet"
          value={p.incompleteMapping}
          tone={p.incompleteMapping > 0 ? "warn" : "neutral"}
          href="/admin?tab=products"
        />
        <MetricTile
          label="Sans image"
          value={p.missingImage}
          tone={p.missingImage > 0 ? "warn" : "neutral"}
          href="/admin?tab=products"
        />
        <MetricTile
          label="Sans prix"
          value={p.missingPrice}
          tone={p.missingPrice > 0 ? "bad" : "neutral"}
          href="/admin?tab=products"
        />
        <MetricTile label="Manuel uniquement" value={p.manualOnly} href="/admin?tab=products" />
        {p.outOfStock != null && (
          <MetricTile
            label="En rupture"
            value={p.outOfStock}
            tone={p.outOfStock > 0 ? "warn" : "neutral"}
            href="/admin?tab=products"
          />
        )}
      </div>
    </OpsCard>
  );
}

function NotificationsCard({ snapshot }: { snapshot: OperationsSnapshotDTO }) {
  const n = snapshot.notifications;
  const quiet = n.emailFailures24h === 0 && n.discordFailures24h === 0 && n.supplierFailures24h === 0;
  return (
    <OpsCard title="Notifications & erreurs">
      <div className="grid grid-cols-3 gap-2">
        <MetricTile label="E-mails échoués" value={n.emailFailures24h} tone={n.emailFailures24h > 0 ? "bad" : "neutral"} />
        <MetricTile label="Discord échoués" value={n.discordFailures24h} tone={n.discordFailures24h > 0 ? "warn" : "neutral"} />
        <MetricTile label="Fournisseurs échoués" value={n.supplierFailures24h} tone={n.supplierFailures24h > 0 ? "warn" : "neutral"} />
      </div>
      {quiet ? (
        <p className="mt-3 text-center text-xs text-faint">Aucune erreur sur les dernières 24 h. ✓</p>
      ) : (
        n.recentEmailErrors.length > 0 && (
          <ul className="mt-3 space-y-1 border-t border-border pt-2.5">
            {n.recentEmailErrors.map((e) => (
              <li key={e.id} className="flex items-center justify-between gap-2 text-[11px] text-muted">
                <span className="truncate">{e.recipient} — {e.message}</span>
                <span className="shrink-0 text-faint">{relativeTime(e.at)}</span>
              </li>
            ))}
          </ul>
        )
      )}
    </OpsCard>
  );
}

// ── Activity feed ─────────────────────────────────────────────────────────────

const ACTIVITY_FILTERS: { value: OpsActivityItemDTO["kind"] | "all"; label: string }[] = [
  { value: "all", label: "Tout" },
  { value: "order", label: "Commandes" },
  { value: "payment", label: "Paiements" },
  { value: "supplier", label: "Fournisseurs" },
  { value: "email", label: "E-mails" },
];

const ACTIVITY_DOT: Record<OpsActivityItemDTO["kind"], string> = {
  order: "#7FA6FF",
  payment: "#5BC98C",
  supplier: "#F0C466",
  email: "#F08084",
};

function ActivityFeed({
  items,
  filter,
  onFilter,
  total,
}: {
  items: OpsActivityItemDTO[];
  filter: OpsActivityItemDTO["kind"] | "all";
  onFilter: (f: OpsActivityItemDTO["kind"] | "all") => void;
  total: number;
}) {
  return (
    <OpsCard
      title="Activité récente"
      headerRight={
        <div className="flex gap-1">
          {ACTIVITY_FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              onClick={() => onFilter(f.value)}
              className={`rounded-md px-2 py-1 text-[11px] ${
                filter === f.value ? "bg-white/10 text-white" : "text-faint hover:text-muted"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      }
    >
      {total === 0 ? (
        <EmptyState text="Aucune activité récente." />
      ) : items.length === 0 ? (
        <EmptyState text="Aucune activité pour ce filtre." />
      ) : (
        <ul className="divide-y divide-border">
          {items.map((item) => {
            const row = (
              <div className="flex items-center gap-3 py-2 first:pt-0 last:pb-0">
                <span
                  className="h-1.5 w-1.5 shrink-0 rounded-full"
                  style={{ background: ACTIVITY_DOT[item.kind] }}
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] text-white">{item.title}</p>
                  {item.detail && <p className="truncate text-[11px] text-muted">{item.detail}</p>}
                </div>
                <span className="shrink-0 text-[11px] text-faint">{relativeTime(item.at)}</span>
              </div>
            );
            return (
              <li key={item.id}>
                {item.href ? (
                  <Link href={item.href} className="block hover:opacity-90">
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
    </OpsCard>
  );
}

function EmptyState({ text }: { text: string }) {
  return <p className="py-6 text-center text-xs text-faint">{text}</p>;
}
