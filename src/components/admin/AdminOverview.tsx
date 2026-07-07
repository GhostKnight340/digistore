"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  getAdminOverviewMetricsAction,
  getInventoryProductsAction,
} from "@/app/actions/admin";
import type { AdminOverviewMetricsDTO } from "@/lib/dto";

const C = {
  surface: "#0F1015",
  surfaceInput: "#121319",
  text: "#F3F4F7",
  muted: "#9A9FAB",
  faint: "#646A77",
  accentText: "#EAF0FF",
  accentTextSoft: "#9FB8FF",
  warning: "#E8A838",
  danger: "#E05C5C",
  successText: "#5BC98C",
  border: "rgba(255,255,255,0.07)",
  borderHairline: "rgba(255,255,255,0.06)",
  borderInput: "rgba(255,255,255,0.08)",
};

const LOW_STOCK_MAX = 5;

const numberFmt = new Intl.NumberFormat("fr-FR");

function greeting(hour: number) {
  if (hour < 12) return "Bonjour";
  if (hour < 18) return "Bon après-midi";
  return "Bonsoir";
}

function TrendUp() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
      <polyline points="18 15 12 9 6 15" />
    </svg>
  );
}

function TrendDown() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

function Delta({ pct }: { pct: number | null }) {
  if (pct === null) {
    return <div style={{ marginTop: "8px", fontSize: "12px", color: C.faint }}>Pas d'historique</div>;
  }
  const up = pct >= 0;
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "5px",
        marginTop: "8px",
        fontSize: "12px",
        color: up ? C.successText : C.danger,
      }}
    >
      {up ? <TrendUp /> : <TrendDown />}
      {up ? "+" : ""}
      {pct}% vs 7 j. précédents
    </div>
  );
}

function KpiCard({
  label,
  labelColor,
  value,
  unit,
  borderColor,
  onOpen,
  children,
}: {
  label: string;
  labelColor?: string;
  value: string;
  unit?: string;
  borderColor?: string;
  onOpen?: () => void;
  children?: React.ReactNode;
}) {
  const Tag = onOpen ? "button" : "div";
  return (
    <Tag
      type={onOpen ? "button" : undefined}
      onClick={onOpen}
      style={{
        padding: "16px 18px",
        borderRadius: "14px",
        background: C.surface,
        border: `1px solid ${borderColor ?? C.border}`,
        textAlign: "left",
        width: "100%",
        cursor: onOpen ? "pointer" : "default",
      }}
    >
      <div style={{ fontSize: "12.5px", color: labelColor ?? C.muted, marginBottom: "9px" }}>{label}</div>
      <div
        style={{
          fontSize: "27px",
          fontWeight: 600,
          letterSpacing: "-0.02em",
          fontFamily: "var(--font-mono)",
        }}
      >
        {value}
        {unit ? <span style={{ fontSize: "14px", color: C.faint }}> {unit}</span> : null}
      </div>
      {children}
    </Tag>
  );
}

export default function AdminOverview({
  firstName = "",
  onOpenReviewQueue,
  onOpenInventory,
}: {
  firstName?: string;
  onOpenReviewQueue: () => void;
  onOpenInventory?: () => void;
}) {
  const [metrics, setMetrics] = useState<AdminOverviewMetricsDTO | null>(null);
  const [outOfStock, setOutOfStock] = useState<{ out: number; low: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const [m, inventory] = await Promise.all([
        getAdminOverviewMetricsAction(),
        getInventoryProductsAction(),
      ]);
      let out = 0;
      let low = 0;
      for (const product of inventory) {
        for (const variant of product.variants) {
          if (variant.unused === 0) out += 1;
          else if (variant.unused <= LOW_STOCK_MAX) low += 1;
        }
      }
      setMetrics(m);
      setOutOfStock({ out, low });
    } catch (err) {
      console.error("Failed to load overview metrics", err);
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const now = useMemo(() => new Date(), []);
  const dateLabel = useMemo(() => {
    const formatted = new Intl.DateTimeFormat("fr-FR", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    }).format(now);
    return formatted.charAt(0).toUpperCase() + formatted.slice(1);
  }, [now]);

  const maxBar = metrics ? Math.max(...metrics.revenueSeries.map((d) => d.value), 1) : 1;

  return (
    <div className="admin-overview" style={{ height: "100%", display: "flex", flexDirection: "column", padding: "26px 28px", color: C.text }}>
      <style>{`
        @media (max-width: 860px) {
          .admin-overview { height: auto; min-height: 100%; overflow-y: auto; padding: 16px !important; }
          .admin-overview-head { flex-wrap: wrap; }
          .admin-overview-kpis { grid-template-columns: repeat(2, 1fr) !important; }
          .admin-overview-cols { grid-template-columns: 1fr !important; flex: none !important; }
          .admin-overview-chart { min-height: 220px; }
        }
        @media (max-width: 420px) {
          .admin-overview-kpis { grid-template-columns: 1fr !important; }
        }
      `}</style>
      {/* page head */}
      <div className="admin-overview-head" style={{ display: "flex", alignItems: "center", gap: "16px", marginBottom: "22px" }}>
        <div>
          <h3 style={{ fontSize: "22px", fontWeight: 600, letterSpacing: "-0.02em", margin: 0 }}>
            {greeting(now.getHours())}{firstName ? `, ${firstName}` : ""}
          </h3>
          <p style={{ fontSize: "13.5px", color: C.faint, margin: "3px 0 0" }}>
            {dateLabel} · voici ce qui vous attend aujourd'hui
          </p>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", gap: "9px" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              background: C.surfaceInput,
              border: `1px solid ${C.borderInput}`,
              borderRadius: "9px",
              overflow: "hidden",
            }}
          >
            {["Aujourd'hui", "7 j", "30 j"].map((r, i) => (
              <span
                key={r}
                style={{
                  fontSize: "12.5px",
                  padding: "0 11px",
                  height: "34px",
                  display: "flex",
                  alignItems: "center",
                  color: i === 1 ? C.accentText : C.faint,
                  background: i === 1 ? "rgba(62,123,250,0.13)" : "transparent",
                  boxShadow: i === 1 ? "inset 0 0 0 1px rgba(62,123,250,0.2)" : "none",
                }}
              >
                {r}
              </span>
            ))}
          </div>
          <button
            type="button"
            style={{
              height: "34px",
              padding: "0 13px",
              display: "flex",
              alignItems: "center",
              gap: "7px",
              borderRadius: "9px",
              border: `1px solid ${C.borderInput}`,
              background: C.surfaceInput,
              color: C.muted,
              fontSize: "12.5px",
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            Exporter
          </button>
        </div>
      </div>

      {error ? (
        <div
          style={{
            borderRadius: "14px",
            background: "rgba(224,92,92,0.08)",
            border: "1px solid rgba(224,92,92,0.25)",
            padding: "18px 20px",
          }}
        >
          <div style={{ fontSize: "14px", fontWeight: 600, color: C.text }}>
            Impossible de charger les statistiques
          </div>
          <button
            type="button"
            onClick={load}
            style={{
              marginTop: "10px",
              fontSize: "12.5px",
              color: C.accentTextSoft,
              background: "transparent",
              border: "none",
              cursor: "pointer",
              padding: 0,
            }}
          >
            Réessayer →
          </button>
        </div>
      ) : (
        <>
          {/* KPI row */}
          <div
            className="admin-overview-kpis"
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(4,1fr)",
              gap: "14px",
              marginBottom: "18px",
            }}
          >
            <KpiCard
              label="Revenu · 7 jours"
              value={loading || !metrics ? "—" : numberFmt.format(metrics.revenue7)}
              unit="MAD"
            >
              {loading || !metrics ? null : <Delta pct={metrics.revenueDeltaPct} />}
            </KpiCard>
            <KpiCard
              label="Commandes · 7 jours"
              value={loading || !metrics ? "—" : numberFmt.format(metrics.orders7)}
            >
              {loading || !metrics ? null : <Delta pct={metrics.ordersDeltaPct} />}
            </KpiCard>
            <KpiCard
              label="En attente de vérification"
              labelColor={C.warning}
              borderColor="rgba(232,168,56,0.22)"
              value={loading || !metrics ? "—" : String(metrics.awaitingReview)}
              onOpen={onOpenReviewQueue}
            >
              <div style={{ marginTop: "8px", fontSize: "12px", color: C.muted }}>
                {loading || !metrics
                  ? " "
                  : metrics.oldestReviewWaitMin === null
                  ? "Aucune en attente"
                  : `Plus ancienne : ${metrics.oldestReviewWaitMin} min`}
              </div>
            </KpiCard>
            <KpiCard
              label="SKU en rupture"
              labelColor={C.danger}
              borderColor="rgba(224,92,92,0.22)"
              value={outOfStock ? String(outOfStock.out) : "—"}
              onOpen={onOpenInventory}
            >
              <div style={{ marginTop: "8px", fontSize: "12px", color: C.muted }}>
                {outOfStock ? `${outOfStock.low} en stock faible` : " "}
              </div>
            </KpiCard>
          </div>

          {/* two col */}
          <div
            className="admin-overview-cols"
            style={{
              flex: 1,
              minHeight: 0,
              display: "grid",
              gridTemplateColumns: "1.55fr 1fr",
              gap: "14px",
            }}
          >
            {/* revenue chart */}
            <div
              className="admin-overview-chart"
              style={{
                borderRadius: "14px",
                background: C.surface,
                border: `1px solid ${C.border}`,
                padding: "18px 20px",
                display: "flex",
                flexDirection: "column",
                minHeight: 0,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", marginBottom: "18px" }}>
                <span style={{ fontSize: "14px", fontWeight: 600 }}>Revenu</span>
                <span style={{ fontSize: "12.5px", color: C.faint, marginLeft: "10px" }}>7 derniers jours</span>
                <span
                  style={{
                    marginLeft: "auto",
                    fontSize: "12.5px",
                    color: C.muted,
                    fontFamily: "var(--font-mono)",
                  }}
                >
                  {loading || !metrics ? "" : `moy. ${numberFmt.format(metrics.revenueAvgPerDay)} MAD/j`}
                </span>
              </div>
              <div
                style={{
                  flex: 1,
                  minHeight: 0,
                  display: "flex",
                  alignItems: "flex-end",
                  gap: "14px",
                  paddingBottom: "6px",
                }}
              >
                {(metrics?.revenueSeries ?? Array.from({ length: 7 }, () => ({ label: "", value: 0, highlight: false }))).map(
                  (d, i) => {
                    const heightPct = loading ? 30 : Math.max(4, Math.round((d.value / maxBar) * 100));
                    return (
                      <div
                        key={i}
                        title={d.value ? `${numberFmt.format(d.value)} MAD` : undefined}
                        style={{
                          flex: 1,
                          display: "flex",
                          flexDirection: "column",
                          alignItems: "center",
                          gap: "8px",
                          height: "100%",
                          justifyContent: "flex-end",
                        }}
                      >
                        <div
                          style={{
                            width: "100%",
                            maxWidth: "46px",
                            height: `${heightPct}%`,
                            borderRadius: "7px 7px 3px 3px",
                            background: d.highlight
                              ? "linear-gradient(180deg,#5E92FF,#3E7BFA)"
                              : "linear-gradient(180deg,#3E7BFA,#2B5FD9)",
                            boxShadow: d.highlight ? "0 0 22px rgba(62,123,250,0.4)" : "none",
                            opacity: loading ? 0.4 : 1,
                            transition: "height 300ms ease",
                          }}
                        />
                        <span style={{ fontSize: "11px", color: d.highlight ? C.accentTextSoft : C.faint }}>
                          {d.label}
                        </span>
                      </div>
                    );
                  },
                )}
              </div>
            </div>

            {/* payment review queue */}
            <div
              style={{
                borderRadius: "14px",
                background: C.surface,
                border: `1px solid ${C.border}`,
                padding: "18px 18px 8px",
                display: "flex",
                flexDirection: "column",
                minHeight: 0,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", marginBottom: "14px" }}>
                <span style={{ fontSize: "14px", fontWeight: 600 }}>Revue paiements</span>
                {metrics && metrics.awaitingReview > 0 ? (
                  <span
                    style={{
                      marginLeft: "auto",
                      fontSize: "11.5px",
                      fontWeight: 600,
                      color: C.warning,
                      background: "rgba(232,168,56,0.14)",
                      borderRadius: "6px",
                      padding: "2px 8px",
                      fontFamily: "var(--font-mono)",
                    }}
                  >
                    {metrics.awaitingReview} en attente
                  </span>
                ) : null}
              </div>
              <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", gap: "9px", overflow: "hidden" }}>
                {loading ? (
                  Array.from({ length: 3 }).map((_, i) => (
                    <div
                      key={i}
                      style={{
                        height: "56px",
                        borderRadius: "10px",
                        background: C.surfaceInput,
                        border: `1px solid ${C.borderHairline}`,
                        opacity: 0.5,
                      }}
                    />
                  ))
                ) : metrics && metrics.queue.length > 0 ? (
                  metrics.queue.map((row) => (
                    <Link
                      key={row.id}
                      href={`/admin/orders/${row.id}`}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "11px",
                        padding: "10px",
                        borderRadius: "10px",
                        background: C.surfaceInput,
                        border: `1px solid ${C.borderHairline}`,
                        textDecoration: "none",
                        color: C.text,
                      }}
                    >
                      <div
                        style={{
                          width: "34px",
                          height: "34px",
                          borderRadius: "8px",
                          background:
                            "repeating-linear-gradient(135deg,#1b1d27,#1b1d27 5px,#15161d 5px,#15161d 10px)",
                          flexShrink: 0,
                        }}
                      />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: "13px", fontWeight: 500, fontFamily: "var(--font-mono)" }}>{row.ref}</div>
                        <div
                          style={{
                            fontSize: "11.5px",
                            color: C.faint,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {row.label}
                        </div>
                      </div>
                      <span style={{ fontSize: "11px", color: C.warning, fontFamily: "var(--font-mono)" }}>
                        {row.waitMin}m
                      </span>
                    </Link>
                  ))
                ) : (
                  <div
                    style={{
                      flex: 1,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: "13px",
                      color: C.faint,
                      textAlign: "center",
                    }}
                  >
                    Aucun paiement en attente
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={onOpenReviewQueue}
                style={{
                  marginTop: "auto",
                  width: "100%",
                  height: "36px",
                  borderRadius: "9px",
                  border: `1px solid ${C.borderInput}`,
                  background: "transparent",
                  color: C.accentTextSoft,
                  fontSize: "12.5px",
                  fontWeight: 500,
                  cursor: "pointer",
                }}
              >
                Ouvrir la file de revue →
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
