"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  getOperationsSnapshotAction,
  getOpsKpiAction,
  refreshAllSupplierBalancesAction,
  refreshAllSupplierHealthAction,
  toggleMaintenanceAction,
  toggleOrderingAction,
} from "@/app/actions/operations";
import type {
  OperationsSnapshotDTO,
  OpsActivityItemDTO,
  OpsHealthStatus,
} from "@/lib/dto";
import { relativeTime } from "./shared";

/** Auto-refresh cadence — cheap snapshot (cached supplier state, no provider calls). */
const POLL_MS = 20_000;
type Range = "today" | "7d" | "30d";
type ActivityFilter = "all" | "order" | "payment" | "system";

/** Severity palette — verbatim from the design tokens (05-Design-Tokens.md). */
const SEV = {
  ok: { dot: "#2EA067", text: "#5BC98C", bg: "rgba(46,160,103,0.10)", border: "rgba(46,160,103,0.28)" },
  warn: { dot: "#E8A838", text: "#E8A838", bg: "rgba(232,168,56,0.10)", border: "rgba(232,168,56,0.28)" },
  danger: { dot: "#E05C5C", text: "#E05C5C", bg: "rgba(224,92,92,0.10)", border: "rgba(224,92,92,0.28)" },
  neutral: { dot: "#646A77", text: "#9A9FAB", bg: "#121319", border: "rgba(255,255,255,0.08)" },
} as const;
type SevKey = keyof typeof SEV;

function sevOf(status: OpsHealthStatus): SevKey {
  return status === "healthy" ? "ok" : status === "warning" ? "warn" : status === "offline" ? "danger" : "neutral";
}

export default function OperationsDashboard({ initial }: { initial: OperationsSnapshotDTO }) {
  const [snapshot, setSnapshot] = useState(initial);
  const [range, setRange] = useState<Range>((initial.kpi.range as Range) ?? "7d");
  const [refreshing, setRefreshing] = useState(false);
  const [actionMsg, setActionMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [activityFilter, setActivityFilter] = useState<ActivityFilter>("all");
  const [dismissed, setDismissed] = useState<string | null>(null);
  const busyRef = useRef(false);

  const reload = useCallback(
    async (manual = false) => {
      if (busyRef.current) return;
      busyRef.current = true;
      if (manual) setRefreshing(true);
      try {
        setSnapshot(await getOperationsSnapshotAction(range));
      } catch {
        /* keep last good snapshot on a transient failure */
      } finally {
        busyRef.current = false;
        if (manual) setRefreshing(false);
      }
    },
    [range],
  );

  // Live polling — refetches the snapshot only; pauses while the tab is hidden.
  useEffect(() => {
    const timer = setInterval(() => {
      if (!document.hidden) void reload();
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [reload]);

  async function changeRange(next: Range) {
    setRange(next);
    try {
      const kpi = await getOpsKpiAction(next);
      setSnapshot((s) => ({ ...s, kpi }));
    } catch {
      /* keep current tiles */
    }
  }

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

  const announcementVisible =
    snapshot.announcement && snapshot.announcement.message !== dismissed;

  return (
    <div className="min-w-0 space-y-4">
      {/* 1 · Announcement */}
      {announcementVisible && snapshot.announcement && (
        <div
          className="flex items-center gap-3 rounded-[11px] px-4 py-2.5"
          style={{ background: "rgba(62,123,250,0.07)", border: "1px solid rgba(62,123,250,0.18)" }}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#7FA6FF" strokeWidth="1.8" className="shrink-0">
            <path d="M12 2a5 5 0 0 0-5 5c0 3-2 4-2 7h14c0-3-2-4-2-7a5 5 0 0 0-5-5z" />
            <path d="M9 21h6" />
          </svg>
          <span className="min-w-0 flex-1 text-[13px]" style={{ color: "#C7D3F0" }}>
            {snapshot.announcement.message}
          </span>
          <button
            type="button"
            onClick={() => setDismissed(snapshot.announcement!.message)}
            className="shrink-0 px-2 py-1 text-[12.5px] text-faint hover:text-muted"
          >
            Masquer
          </button>
        </div>
      )}

      {/* 2 · Header */}
      <header className="flex flex-wrap items-center gap-4">
        <div>
          <h1 className="text-[22px] font-semibold tracking-[-0.02em] text-white">
            Bonjour, {snapshot.greetingName}
          </h1>
          <p className="mt-0.5 text-[13.5px] text-faint">
            {new Date(snapshot.generatedAt).toLocaleDateString("fr-FR", {
              weekday: "long",
              day: "numeric",
              month: "long",
              year: "numeric",
            })}{" "}
            · {snapshot.environmentLabel}
            {snapshot.warnings.length > 0 && ` · ${snapshot.warnings.length} point(s) à traiter`}
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2.5">
          <div
            className="flex items-center overflow-hidden rounded-[9px]"
            style={{ background: "#121319", border: "1px solid rgba(255,255,255,0.08)" }}
          >
            {(["today", "7d", "30d"] as Range[]).map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => changeRange(r)}
                className="h-[34px] px-[11px] text-[12.5px]"
                style={
                  range === r
                    ? { color: "#EAF0FF", background: "rgba(62,123,250,0.13)", boxShadow: "inset 0 0 0 1px rgba(62,123,250,0.2)" }
                    : { color: "#646A77", background: "transparent" }
                }
              >
                {r === "today" ? "Aujourd’hui" : r === "7d" ? "7 j" : "30 j"}
              </button>
            ))}
          </div>
          <ExportButton snapshot={snapshot} />
          <button
            type="button"
            onClick={() => reload(true)}
            disabled={refreshing}
            className="btn-ghost h-[34px] px-3 text-xs disabled:opacity-60"
          >
            {refreshing ? "…" : "Actualiser"}
          </button>
        </div>
      </header>

      {actionMsg && (
        <p className={`rounded-lg px-3 py-2 text-sm ${actionMsg.ok ? "bg-green-500/10 text-green-400" : "bg-red-500/10 text-red-400"}`}>
          {actionMsg.text}
        </p>
      )}

      {/* 3 · System status bar */}
      <SystemStatusBar snapshot={snapshot} />

      {/* 4 · Needs attention */}
      {snapshot.warnings.length > 0 && <NeedsAttention snapshot={snapshot} />}

      {/* 5 · Today snapshot */}
      <div className="grid grid-cols-2 gap-3.5 md:grid-cols-4">
        {snapshot.kpi.tiles.map((tile) => (
          <div key={tile.label} className="rounded-[12px] p-4" style={{ background: "#0F1015", border: "1px solid rgba(255,255,255,0.07)" }}>
            <div className="mb-1.5 text-xs text-muted">{tile.label}</div>
            <div className="font-mono text-[20px] font-semibold tracking-[-0.02em] text-white">
              {tile.value} {tile.unit && <span className="text-xs font-normal text-faint">{tile.unit}</span>}
            </div>
            <div className="mt-1.5 text-[11.5px]" style={{ color: tile.tone === "good" ? "#5BC98C" : tile.tone === "bad" ? "#E05C5C" : "#646A77" }}>
              {tile.trendLabel}
            </div>
          </div>
        ))}
      </div>

      {/* 6 · Main grid */}
      <div className="grid gap-3.5 xl:grid-cols-[1.6fr_1fr]">
        {/* Left column */}
        <div className="flex min-w-0 flex-col gap-3.5">
          <OrderPipeline snapshot={snapshot} />
          <RecentOrders snapshot={snapshot} />
          <FooterStrip snapshot={snapshot} busy={refreshing} onAction={runQuickAction} />
        </div>
        {/* Right column */}
        <div className="flex min-w-0 flex-col gap-3.5">
          <SupplierSync snapshot={snapshot} busy={refreshing} onAction={runQuickAction} />
          <PrepaidFloat snapshot={snapshot} />
          <LiveActivity snapshot={snapshot} filter={activityFilter} onFilter={setActivityFilter} />
        </div>
      </div>
    </div>
  );
}

// ── 3 · System status bar ─────────────────────────────────────────────────────

function SystemStatusBar({ snapshot }: { snapshot: OperationsSnapshotDTO }) {
  const s = snapshot.systemStatus;
  const sev = sevOf(s.overall);
  const degraded = s.overall !== "healthy";
  return (
    <div
      className="flex flex-wrap items-center gap-x-3.5 gap-y-2 rounded-[12px] px-[18px] py-3"
      style={{
        background: degraded ? SEV[sev].bg : "rgba(46,160,103,0.05)",
        border: `1px solid ${degraded ? SEV[sev].border : "rgba(46,160,103,0.16)"}`,
      }}
    >
      <div className="flex shrink-0 items-center gap-2.5 border-r border-white/8 pr-4">
        <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: SEV[sev].dot, boxShadow: `0 0 10px ${SEV[sev].dot}99` }} />
        <span className="whitespace-nowrap text-[14.5px] font-semibold text-white">{s.headline}</span>
      </div>
      {s.chips.map((chip) => {
        const cs = sevOf(chip.status);
        return (
          <div key={chip.key} className="flex shrink-0 items-center gap-1.5">
            <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: SEV[cs].dot }} />
            <span className="whitespace-nowrap text-[12.5px] text-muted">{chip.label}</span>
            <span className="whitespace-nowrap text-[12.5px] font-medium" style={{ color: SEV[cs].text }}>
              {chip.sub}
            </span>
          </div>
        );
      })}
      <div className="ml-auto flex flex-wrap items-center justify-end gap-2.5">
        <span
          className="whitespace-nowrap rounded-[6px] px-2 py-[3px] font-mono text-[11px]"
          style={{ color: "#9FB8FF", background: "rgba(62,123,250,0.13)", border: "1px solid rgba(62,123,250,0.25)" }}
        >
          {snapshot.environmentLabel.toUpperCase()}
        </span>
        <span className="whitespace-nowrap text-xs text-faint">
          {snapshot.orders.pendingPayment + snapshot.orders.paymentSubmitted + snapshot.orders.readyForFulfillment} en cours
        </span>
      </div>
    </div>
  );
}

// ── 4 · Needs attention ───────────────────────────────────────────────────────

function NeedsAttention({ snapshot }: { snapshot: OperationsSnapshotDTO }) {
  return (
    <div className="rounded-[14px] p-[18px]" style={{ background: "#0F1015", border: "1px solid rgba(232,168,56,0.18)" }}>
      <div className="mb-3 flex items-center gap-2.5">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#E8A838" strokeWidth="1.9">
          <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
          <line x1="12" y1="9" x2="12" y2="13" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
        <span className="text-[14.5px] font-semibold text-white">Points à traiter</span>
        <span className="rounded-[6px] px-2 py-0.5 font-mono text-[11.5px] font-semibold" style={{ color: "#E8A838", background: "rgba(232,168,56,0.14)" }}>
          {snapshot.warnings.length}
        </span>
      </div>
      <div className="flex flex-col gap-1.5">
        {snapshot.warnings.map((w) => {
          const sev = w.severity === "critical" ? "danger" : w.severity === "warning" ? "warn" : "neutral";
          return (
            <div key={w.id} className="flex items-center gap-3 rounded-[10px] px-3 py-2.5" style={{ background: "#121319", border: "1px solid rgba(255,255,255,0.06)" }}>
              <span className="h-[7px] w-[7px] shrink-0 rounded-full" style={{ background: SEV[sev].dot, boxShadow: `0 0 8px ${SEV[sev].dot}` }} />
              <div className="min-w-0 flex-1">
                <div className="text-[13.5px] font-medium text-white">{w.title}</div>
                <div className="mt-0.5 text-xs text-faint">{w.description}</div>
              </div>
              <span className="shrink-0 font-mono text-[11px] text-faint">{relativeTime(w.detectedAt)}</span>
              {w.resolveHref && (
                <Link
                  href={w.resolveHref}
                  className="h-[30px] shrink-0 rounded-[8px] px-3 text-[12px] font-semibold leading-[30px]"
                  style={{ color: SEV[sev].text, background: SEV[sev].bg, border: `1px solid ${SEV[sev].border}` }}
                >
                  Traiter
                </Link>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── 6a · Order pipeline ───────────────────────────────────────────────────────

function OrderPipeline({ snapshot }: { snapshot: OperationsSnapshotDTO }) {
  return (
    <div className="rounded-[14px] p-[18px]" style={{ background: "#0F1015", border: "1px solid rgba(255,255,255,0.07)" }}>
      <div className="mb-3.5 flex items-center">
        <span className="text-sm font-semibold text-white">Pipeline des commandes</span>
        <span className="ml-auto text-xs text-faint">cliquez un statut pour filtrer</span>
      </div>
      <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-6">
        {snapshot.pipeline.map((stage) => (
          <Link
            key={stage.key}
            href={stage.href}
            className="rounded-[10px] px-2.5 py-3"
            style={{ background: "#121319", border: "1px solid rgba(255,255,255,0.06)", borderTop: `2px solid ${stage.accent}` }}
          >
            <div className="font-mono text-[19px] font-semibold tracking-[-0.02em] text-white">{stage.count}</div>
            <div className="mt-1 text-[11px] leading-tight text-muted">{stage.label}</div>
          </Link>
        ))}
      </div>
    </div>
  );
}

// ── 6b · Recent orders ────────────────────────────────────────────────────────

function RecentOrders({ snapshot }: { snapshot: OperationsSnapshotDTO }) {
  return (
    <div className="flex flex-col rounded-[14px] px-[18px] pb-2 pt-4" style={{ background: "#0F1015", border: "1px solid rgba(255,255,255,0.07)" }}>
      <div className="mb-2.5 flex items-center">
        <span className="text-sm font-semibold text-white">Commandes récentes</span>
        <Link href="/admin?tab=orders" className="ml-auto text-[12.5px]" style={{ color: "#9FB8FF" }}>
          Toutes les commandes →
        </Link>
      </div>
      {snapshot.recentOrders.length === 0 ? (
        <p className="py-8 text-center text-xs text-faint">Aucune commande pour l’instant.</p>
      ) : (
        <div className="flex flex-col">
          {snapshot.recentOrders.map((o) => {
            const badge = statusBadge(o.status);
            return (
              <Link key={o.id} href={`/admin/orders/${o.id}`} className="flex items-center gap-3 border-b border-white/[0.045] py-2.5 last:border-0 hover:bg-white/[0.02]">
                <span className="w-[68px] shrink-0 font-mono text-[12.5px] text-muted">{o.orderNumber}</span>
                <span className="w-[110px] shrink-0 truncate text-[12.5px] text-white">{o.customer}</span>
                <span className="min-w-0 flex-1 truncate text-[12.5px] text-muted">{o.item}</span>
                <span className="w-[80px] shrink-0 text-right font-mono text-[12.5px]" style={{ color: "#C4C8D1" }}>{o.amountMad} MAD</span>
                <span className="w-[110px] shrink-0 text-center text-[11px] font-semibold" style={{ color: badge.text, background: badge.bg, border: `1px solid ${badge.border}`, borderRadius: 6, padding: "3px 0" }}>
                  {o.statusLabel}
                </span>
                <span className="w-[52px] shrink-0 text-right text-[11.5px]" style={{ color: "#9FB8FF" }}>{o.action}</span>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

function statusBadge(status: string): { text: string; bg: string; border: string } {
  const key: SevKey =
    status === "delivered"
      ? "ok"
      : status === "payment_submitted"
        ? "warn"
        : status === "payment_issue" || status === "rejected" || status === "refunded"
          ? "danger"
          : "neutral";
  return { text: SEV[key].text, bg: SEV[key].bg, border: SEV[key].border };
}

// ── 6c · Footer strip: jobs + version + emergency ─────────────────────────────

function FooterStrip({
  snapshot,
  busy,
  onAction,
}: {
  snapshot: OperationsSnapshotDTO;
  busy: boolean;
  onAction: (label: string, fn: () => Promise<unknown>) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState<null | "checkout" | "maintenance">(null);

  return (
    <div className="rounded-[14px] px-[18px] py-3.5" style={{ background: "#0C0D11", border: "1px solid rgba(255,255,255,0.06)" }}>
      <div className="flex flex-wrap items-center gap-x-[22px] gap-y-2">
        {snapshot.jobs.map((job) => {
          const sev = sevOf(job.status);
          return (
            <div key={job.name} className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: SEV[sev].dot }} />
              <span className="text-xs text-muted">{job.name}</span>
              <span className="font-mono text-[11px]" style={{ color: "#4d525d" }}>{job.detail}</span>
            </div>
          );
        })}
        <div className="flex-1" />
        <span className="font-mono text-[11.5px]" style={{ color: "#4d525d" }}>
          {snapshot.environmentLabel} · {snapshot.version}
        </span>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="h-7 rounded-[8px] px-3 text-[11.5px] font-semibold"
          style={{ color: "#E05C5C", background: "rgba(224,92,92,0.08)", border: "1px solid rgba(224,92,92,0.3)" }}
        >
          Contrôles d’urgence
        </button>
      </div>
      {open && (
        <div className="mt-3 flex flex-wrap gap-2.5 border-t border-white/[0.06] pt-3">
          {confirm === "checkout" ? (
            <ConfirmInline
              label={snapshot.ordersEnabled ? "Suspendre le paiement ?" : "Réactiver le paiement ?"}
              busy={busy}
              onConfirm={() => {
                void onAction(snapshot.ordersEnabled ? "Paiement suspendu" : "Paiement réactivé", () => toggleOrderingAction(!snapshot.ordersEnabled));
                setConfirm(null);
              }}
              onCancel={() => setConfirm(null)}
            />
          ) : confirm === "maintenance" ? (
            <ConfirmInline
              label={snapshot.maintenanceEnabled ? "Sortir de maintenance ?" : "Activer la maintenance ?"}
              busy={busy}
              onConfirm={() => {
                void onAction(snapshot.maintenanceEnabled ? "Maintenance désactivée" : "Maintenance activée", () => toggleMaintenanceAction(!snapshot.maintenanceEnabled));
                setConfirm(null);
              }}
              onCancel={() => setConfirm(null)}
            />
          ) : (
            <>
              <button type="button" onClick={() => setConfirm("checkout")} className="h-[38px] flex-1 rounded-[9px] text-[12.5px] font-semibold" style={{ color: "#9FB8FF", background: "rgba(62,123,250,0.14)", border: "1px solid rgba(62,123,250,0.35)" }}>
                {snapshot.ordersEnabled ? "Suspendre le paiement" : "Réactiver le paiement"}
              </button>
              <button type="button" onClick={() => setConfirm("maintenance")} className="h-[38px] flex-1 rounded-[9px] text-[12.5px] font-semibold" style={{ color: "#E8A838", background: "rgba(232,168,56,0.08)", border: "1px solid rgba(232,168,56,0.3)" }}>
                {snapshot.maintenanceEnabled ? "Sortir de maintenance" : "Bannière de maintenance"}
              </button>
              <Link href="/admin?tab=payment-methods" className="flex h-[38px] flex-1 items-center justify-center rounded-[9px] text-[12.5px] font-semibold text-muted" style={{ background: "#121319", border: "1px solid rgba(255,255,255,0.1)" }}>
                Gérer les paiements
              </Link>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function ConfirmInline({ label, busy, onConfirm, onCancel }: { label: string; busy: boolean; onConfirm: () => void; onCancel: () => void }) {
  return (
    <div className="flex flex-1 items-center gap-2">
      <span className="text-xs text-amber-400">{label}</span>
      <button type="button" disabled={busy} onClick={onConfirm} className="h-[34px] rounded-lg bg-amber-500/15 px-4 text-xs font-medium text-amber-400 disabled:opacity-60">
        Confirmer
      </button>
      <button type="button" onClick={onCancel} className="btn-ghost h-[34px] px-4 text-xs">Annuler</button>
    </div>
  );
}

// ── 6d · Supplier sync ────────────────────────────────────────────────────────

function SupplierSync({
  snapshot,
  busy,
  onAction,
}: {
  snapshot: OperationsSnapshotDTO;
  busy: boolean;
  onAction: (label: string, fn: () => Promise<unknown>) => Promise<void>;
}) {
  return (
    <div className="rounded-[14px] p-[18px]" style={{ background: "#0F1015", border: "1px solid rgba(255,255,255,0.07)" }}>
      <div className="mb-3 flex items-center">
        <span className="text-sm font-semibold text-white">Fournisseurs</span>
        <button type="button" disabled={busy} onClick={() => onAction("Test des fournisseurs", refreshAllSupplierHealthAction)} className="ml-auto text-[12px] disabled:opacity-60" style={{ color: "#9FB8FF" }}>
          Tester
        </button>
      </div>
      <div className="flex flex-col">
        {snapshot.suppliers.map((s) => {
          const sev = sevOf(
            s.health === "offline" ? "offline" : s.health === "warning" ? "warning" : s.health === "healthy" ? "healthy" : "unknown",
          );
          return (
            <Link key={s.slug} href={`/admin/suppliers/${s.slug}`} className="flex items-center gap-2.5 border-b border-white/[0.04] py-2 last:border-0 hover:bg-white/[0.02]">
              <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: SEV[sev].dot }} />
              <span className="min-w-0 flex-1 truncate text-[12.5px] text-white">{s.name}</span>
              <span className="font-mono text-[11px]" style={{ color: SEV[sev].text }}>
                {s.configured ? (s.enabled ? "actif" : "désactivé") : "non configuré"}
              </span>
              <span className="w-[64px] text-right font-mono text-[11px] text-faint">
                {s.lastCheckedAt ? relativeTime(s.lastCheckedAt) : "jamais"}
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

// ── 6e · Prepaid float ────────────────────────────────────────────────────────

function PrepaidFloat({ snapshot }: { snapshot: OperationsSnapshotDTO }) {
  return (
    <div className="rounded-[14px] p-[18px]" style={{ background: "#0F1015", border: "1px solid rgba(255,255,255,0.07)" }}>
      <div className="mb-3 flex items-center">
        <span className="text-sm font-semibold text-white">Portefeuilles prépayés</span>
      </div>
      {snapshot.wallets.length === 0 ? (
        <p className="py-4 text-center text-xs text-faint">Aucun portefeuille fournisseur.</p>
      ) : (
        <div className="flex flex-col gap-2.5">
          {snapshot.wallets.map((w) => {
            const sev = sevOf(w.tier);
            return (
              <div key={w.slug}>
                <div className="mb-1.5 flex items-center">
                  <span className="text-[12.5px]" style={{ color: "#C4C8D1" }}>{w.name}</span>
                  <span className="ml-auto font-mono text-[11.5px]" style={{ color: SEV[sev].text }}>{w.amount}</span>
                </div>
                <div className="h-[5px] overflow-hidden rounded-[3px]" style={{ background: "#121319" }}>
                  <div className="h-full rounded-[3px]" style={{ background: SEV[sev].dot, width: `${w.pct}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── 6f · Live activity ────────────────────────────────────────────────────────

const ACTIVITY_FILTERS: { value: ActivityFilter; label: string }[] = [
  { value: "all", label: "Tout" },
  { value: "order", label: "Commandes" },
  { value: "payment", label: "Paiements" },
  { value: "system", label: "Système" },
];
const ACTIVITY_DOT: Record<OpsActivityItemDTO["kind"], string> = {
  order: "#7FA6FF",
  payment: "#5BC98C",
  supplier: "#E8A838",
  email: "#E05C5C",
};

function LiveActivity({
  snapshot,
  filter,
  onFilter,
}: {
  snapshot: OperationsSnapshotDTO;
  filter: ActivityFilter;
  onFilter: (f: ActivityFilter) => void;
}) {
  const items = snapshot.activity.filter((a) => {
    if (filter === "all") return true;
    if (filter === "system") return a.kind === "supplier" || a.kind === "email";
    return a.kind === filter;
  });
  return (
    <div className="flex min-h-[200px] flex-1 flex-col rounded-[14px] p-[18px]" style={{ background: "#0F1015", border: "1px solid rgba(255,255,255,0.07)" }}>
      <div className="mb-3 flex items-center gap-2">
        <span className="text-sm font-semibold text-white">Activité en direct</span>
        <span className="h-[5px] w-[5px] rounded-full" style={{ background: "#5BC98C", boxShadow: "0 0 6px #5BC98C" }} />
      </div>
      <div className="mb-3 flex gap-1.5">
        {ACTIVITY_FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            onClick={() => onFilter(f.value)}
            className="rounded-[7px] px-2.5 py-1 text-[11.5px]"
            style={
              filter === f.value
                ? { color: "#EAF0FF", background: "rgba(62,123,250,0.13)", border: "1px solid rgba(62,123,250,0.25)" }
                : { color: "#9A9FAB", background: "#121319", border: "1px solid rgba(255,255,255,0.06)" }
            }
          >
            {f.label}
          </button>
        ))}
      </div>
      <div className="flex flex-1 flex-col gap-2.5 overflow-y-auto">
        {items.length === 0 ? (
          <p className="py-6 text-center text-xs text-faint">Aucune activité.</p>
        ) : (
          items.map((ev) => {
            const row = (
              <div className="flex gap-2.5">
                <span className="mt-[5px] h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: ACTIVITY_DOT[ev.kind] }} />
                <div className="min-w-0 flex-1">
                  <div className="text-[12.5px] leading-snug" style={{ color: "#C4C8D1" }}>{ev.title}</div>
                  {ev.detail && <div className="truncate text-[11px] text-muted">{ev.detail}</div>}
                  <div className="mt-px text-[11px]" style={{ color: "#4d525d" }}>{relativeTime(ev.at)}</div>
                </div>
              </div>
            );
            return ev.href ? (
              <Link key={ev.id} href={ev.href} className="hover:opacity-90">{row}</Link>
            ) : (
              <div key={ev.id}>{row}</div>
            );
          })
        )}
      </div>
    </div>
  );
}

// ── Export ────────────────────────────────────────────────────────────────────

function ExportButton({ snapshot }: { snapshot: OperationsSnapshotDTO }) {
  function exportCsv() {
    const header = ["Commande", "Client", "Article", "Montant MAD", "Statut"];
    const rows = snapshot.recentOrders.map((o) => [o.orderNumber, o.customer, o.item, String(o.amountMad), o.statusLabel]);
    const csv = [header, ...rows]
      .map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([`﻿${csv}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "ghost-operations-commandes.csv";
    a.click();
    URL.revokeObjectURL(url);
  }
  return (
    <button
      type="button"
      onClick={exportCsv}
      className="flex h-[34px] items-center gap-1.5 rounded-[9px] px-3 text-[12.5px] font-medium text-muted"
      style={{ background: "#121319", border: "1px solid rgba(255,255,255,0.1)" }}
    >
      Exporter
    </button>
  );
}
