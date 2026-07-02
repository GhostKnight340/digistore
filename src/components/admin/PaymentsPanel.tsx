"use client";

import { useCallback, useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { formatMAD, formatDate } from "@/lib/format";
import { orderStatusShort } from "@/lib/orderStatus";
import { getAdminPaymentOrdersAction, getAdminOrderDetailAction } from "@/app/actions/admin";
import {
  approvePaymentAction,
  getPaymentProofAction,
  getPaymentEmailPreviewAction,
  sendPaymentReviewEmailAction,
  getPaymentConfigAction,
} from "@/app/actions/payments";
import type {
  AdminOrderSummaryDTO,
  AdminOrderDTO,
  AdminPaymentProofDTO,
  PaymentConfigDTO,
} from "@/lib/dto";

/** Literal design tokens from the admin handoff (docs/admin-handoff/05-Design-Tokens.md). */
const C = {
  base: "#0A0B0D",
  panel: "#0F1015",
  surfaceInput: "#121319",
  text: "#F3F4F7",
  textBright: "#EAF0FF",
  muted: "#9A9FAB",
  faint: "#646A77",
  fainter: "#4d525d",
  accent: "#3E7BFA",
  accentSoft: "rgba(62,123,250,0.10)",
  accentSelected: "rgba(62,123,250,0.08)",
  accentBorder: "rgba(62,123,250,0.25)",
  accentText: "#9FB8FF",
  warning: "#E8A838",
  warningSoft: "rgba(232,168,56,0.14)",
  warningBorder: "rgba(232,168,56,0.28)",
  success: "#2EA067",
  successText: "#5BC98C",
  successSoft: "rgba(46,160,103,0.12)",
  successBorder: "rgba(46,160,103,0.28)",
  danger: "#E05C5C",
  dangerSoft: "rgba(224,92,92,0.08)",
  dangerBorder: "rgba(224,92,92,0.3)",
  borderHairline: "rgba(255,255,255,0.06)",
  border: "rgba(255,255,255,0.07)",
  borderInput: "rgba(255,255,255,0.08)",
  borderStrong: "rgba(255,255,255,0.1)",
  borderStronger: "rgba(255,255,255,0.12)",
} as const;

const MONO = "var(--font-mono)";

const METHOD_LABELS: Record<string, string> = {
  bank: "Virement bancaire",
  usdt: "USDT",
  paypal: "PayPal",
  card: "Carte bancaire",
  test: "Test",
};

type QueueFilter = "submitted" | "issue" | "rejected";

const FILTERS: { id: QueueFilter; label: string; status: string }[] = [
  { id: "submitted", label: "À vérifier", status: "payment_submitted" },
  { id: "issue", label: "Problèmes", status: "payment_issue" },
  { id: "rejected", label: "Rejetés", status: "rejected" },
];

function initialsOf(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return ((parts[0][0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

function formatBytes(value: number | null) {
  if (value == null) return "Taille inconnue";
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function formatWaiting(ms: number) {
  const mins = Math.max(0, Math.floor(ms / 60000));
  if (mins < 60) return `${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} h ${mins % 60} min`;
  const days = Math.floor(hours / 24);
  return `${days} j ${hours % 24} h`;
}

function proofHref(proof: AdminPaymentProofDTO) {
  if (proof.source === "url") return proof.data;
  return `data:${proof.mimeType};base64,${proof.data}`;
}

function itemsSummary(order: AdminOrderSummaryDTO) {
  if (order.items.length === 0) return "Aucun article";
  const first = order.items[0];
  const label = first.quantity > 1 ? `${first.name} ×${first.quantity}` : first.name;
  const extra = order.items.length - 1;
  return extra > 0 ? `${label} +${extra}` : label;
}

const EVENT_LABELS: Record<string, string> = {
  proof_uploaded: "Justificatif reçu",
  status_change: "Changement de statut",
  payment_submitted: "Paiement soumis",
  payment_confirmed: "Paiement confirmé",
  payment_rejected: "Paiement refusé",
  payment_issue: "Justificatif redemandé",
  delivered: "Commande livrée",
  order_created: "Commande passée",
  email_sent: "Email envoyé",
};

function eventLabel(type: string) {
  return EVENT_LABELS[type] ?? type.replace(/_/g, " ");
}

export default function PaymentsPanel() {
  const router = useRouter();
  const [orders, setOrders] = useState<AdminOrderSummaryDTO[]>([]);
  const [config, setConfig] = useState<PaymentConfigDTO | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [filter, setFilter] = useState<QueueFilter>("submitted");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<AdminOrderDTO | null | "loading">(null);
  const [proof, setProof] = useState<AdminPaymentProofDTO | null | "loading">("loading");
  const [zoom, setZoom] = useState(1);
  const [now, setNow] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [reviewEmail, setReviewEmail] = useState<{
    intent: "reject" | "request_proof";
    title: string;
    subject: string;
    text: string;
    reason: string;
  } | null>(null);

  const load = useCallback(async () => {
    setLoadError("");
    try {
      const [data, cfg] = await Promise.all([
        getAdminPaymentOrdersAction(),
        getPaymentConfigAction(),
      ]);
      setOrders(data);
      setConfig(cfg);
    } catch (loadErr) {
      console.error("Failed to load payments", loadErr);
      setLoadError("Impossible de charger la file de paiements.");
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Live clock (mounted-only) so SSR/CSR stay consistent while waiting timers tick.
  useEffect(() => {
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(timer);
  }, []);

  const activeStatus = FILTERS.find((f) => f.id === filter)?.status ?? "payment_submitted";

  const visible = useMemo(() => {
    return orders
      .filter((order) => order.status === activeStatus)
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  }, [orders, activeStatus]);

  const countFor = useCallback(
    (status: string) => orders.filter((order) => order.status === status).length,
    [orders],
  );

  // Keep a valid selection within the active filter.
  useEffect(() => {
    if (visible.length === 0) {
      setSelectedId(null);
      return;
    }
    setSelectedId((current) => {
      if (current && visible.some((order) => order.id === current)) return current;
      return visible[0].id;
    });
  }, [visible]);

  // Load detail + proof whenever the selected order changes.
  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      setProof(null);
      return;
    }
    setDetail("loading");
    setProof("loading");
    setZoom(1);
    let cancelled = false;
    getAdminOrderDetailAction(selectedId)
      .then((result) => {
        if (!cancelled) setDetail(result);
      })
      .catch((detailError) => {
        console.error("Failed to load order detail", detailError);
        if (!cancelled) setDetail(null);
      });
    getPaymentProofAction(selectedId)
      .then((result) => {
        if (!cancelled) setProof(result);
      })
      .catch((proofError) => {
        console.error("Failed to load proof", proofError);
        if (!cancelled) setProof(null);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  const selected = useMemo(
    () => orders.find((order) => order.id === selectedId) ?? null,
    [orders, selectedId],
  );

  async function runAction(
    label: string,
    action: () => Promise<{ ok: boolean; error?: string }>,
  ) {
    setBusy(true);
    setError("");
    setMessage("");
    const result = await action();
    setBusy(false);
    if (result.ok) {
      setMessage(label);
      return true;
    }
    setError(result.error ?? "Action impossible.");
    return false;
  }

  async function handleConfirm() {
    if (!selectedId) return;
    if (!window.confirm("Confirmer ce paiement et passer à la préparation de la commande ?")) return;
    const ok = await runAction("Paiement confirmé.", () => approvePaymentAction(selectedId));
    if (ok) router.push(`/admin/orders/${selectedId}`);
  }

  async function openReviewEmail(intent: "reject" | "request_proof", title: string) {
    if (!selectedId) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const preview = await getPaymentEmailPreviewAction(selectedId, intent);
      setReviewEmail({ intent, title, subject: preview.subject, text: preview.text, reason: "" });
    } catch (previewError) {
      setError(previewError instanceof Error ? previewError.message : "Aperçu email impossible.");
    } finally {
      setBusy(false);
    }
  }

  async function sendReviewEmail() {
    if (!reviewEmail || !selectedId) return;
    const ok = await runAction("Email envoyé et statut mis à jour.", () =>
      sendPaymentReviewEmailAction(
        selectedId,
        reviewEmail.intent,
        { subject: reviewEmail.subject, text: reviewEmail.text },
        reviewEmail.reason,
      ),
    );
    setReviewEmail(null);
    if (ok) await load();
  }

  const receivingAccount = useMemo(() => {
    if (!selected || !config) return null;
    if (selected.paymentMethod === "bank") {
      const bank = config.banks.find((b) => b.enabled) ?? config.banks[0];
      if (!bank) return null;
      return { label: "Compte (RIB)", primary: bank.rib || bank.accountNumber, secondary: `${bank.name} · ${bank.accountHolder}` };
    }
    if (selected.paymentMethod === "usdt") {
      const wallet = config.wallets.find((w) => w.enabled) ?? config.wallets[0];
      if (!wallet) return null;
      return { label: "Adresse", primary: wallet.address, secondary: `${wallet.coin} · ${wallet.network}` };
    }
    if (selected.paymentMethod === "paypal") {
      const paypal = config.methods.paypal;
      if (!paypal?.paypalEmail) return null;
      return { label: "PayPal", primary: paypal.paypalEmail, secondary: "" };
    }
    return null;
  }, [selected, config]);

  // The stored public order number rides along on every summary — same value the
  // queue cards, order detail, emails and customer pages show.
  const displayRef = selected ? selected.publicOrderNumber : "";

  // Gate decisions by status, mirroring the order-detail page so we never offer a
  // transition the server would reject (e.g. approving an already-rejected order).
  const status = selected?.status;
  const canConfirm =
    status === "payment_submitted" || status === "payment_issue" || status === "pending_payment";
  const canRequestProof =
    !!status && !["delivered", "rejected", "payment_issue", "cancelled"].includes(status);
  const canReject = !!status && !["delivered", "rejected", "cancelled"].includes(status);
  const hasDecision = canConfirm || canRequestProof || canReject;

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", minHeight: 0, background: C.base }}>
      <style>{`
        .pq-body { display:flex; flex:1; min-height:0; }
        .pq-queue { width:330px; flex-shrink:0; border-right:1px solid ${C.border}; display:flex; flex-direction:column; min-height:0; }
        .pq-viewer { flex:1; display:flex; flex-direction:column; min-width:0; min-height:0; background:${C.base}; }
        .pq-decision { width:352px; flex-shrink:0; border-left:1px solid ${C.border}; display:flex; flex-direction:column; min-height:0; }
        .pq-input::placeholder { color:${C.faint}; }
        @media (max-width:1180px){
          .pq-decision { width:300px; }
        }
        @media (max-width:960px){
          .pq-body { flex-direction:column; overflow-y:auto; }
          .pq-queue { width:100%; border-right:none; border-bottom:1px solid ${C.border}; max-height:340px; }
          .pq-viewer { min-height:420px; }
          .pq-decision { width:100%; border-left:none; border-top:1px solid ${C.border}; }
        }
      `}</style>

      {loadError ? (
        <div
          style={{
            margin: 16,
            borderRadius: 11,
            border: `1px solid ${C.dangerBorder}`,
            background: C.dangerSoft,
            padding: "12px 15px",
            fontSize: 13,
            color: "#F3B4B4",
          }}
        >
          {loadError}
        </div>
      ) : null}

      <div className="pq-body">
        {/* ===== Queue list ===== */}
        <div className="pq-queue">
          <div style={{ padding: "16px 18px 12px", borderBottom: `1px solid ${C.borderHairline}` }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
              <span style={{ fontSize: 14, fontWeight: 600, color: C.text }}>File de vérification</span>
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: C.warning,
                  background: C.warningSoft,
                  borderRadius: 6,
                  padding: "2px 8px",
                  fontFamily: MONO,
                }}
              >
                {countFor("payment_submitted")} en attente
              </span>
            </div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                background: C.surfaceInput,
                border: `1px solid ${C.borderInput}`,
                borderRadius: 8,
                overflow: "hidden",
              }}
            >
              {FILTERS.map((f) => {
                const active = filter === f.id;
                const count = countFor(f.status);
                return (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setFilter(f.id)}
                    style={{
                      flex: 1,
                      height: 30,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 5,
                      fontSize: 12,
                      border: "none",
                      cursor: "pointer",
                      color: active ? C.textBright : C.faint,
                      background: active ? C.accentSoft : "transparent",
                      boxShadow: active ? `inset 0 0 0 1px ${C.accentBorder}` : "none",
                    }}
                  >
                    {f.label}
                    {count > 0 ? (
                      <span style={{ fontSize: 10, fontFamily: MONO, color: active ? C.accentText : C.fainter }}>
                        {count}
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </div>

          <div style={{ flex: 1, overflowY: "auto", padding: 10, display: "flex", flexDirection: "column", gap: 6 }}>
            {!loaded ? (
              <QueueSkeleton />
            ) : visible.length === 0 ? (
              <p style={{ padding: "24px 12px", fontSize: 12.5, color: C.faint, textAlign: "center", lineHeight: 1.6 }}>
                Aucune commande dans cette catégorie.
              </p>
            ) : (
              <>
                {visible.map((order) => {
                  const active = order.id === selectedId;
                  const wait = now != null ? formatWaiting(now - new Date(order.createdAt).getTime()) : null;
                  return (
                    <button
                      key={order.id}
                      type="button"
                      onClick={() => setSelectedId(order.id)}
                      style={{
                        textAlign: "left",
                        padding: "13px 14px",
                        borderRadius: 11,
                        cursor: "pointer",
                        background: active ? C.accentSoft : C.panel,
                        border: `1px solid ${active ? "transparent" : C.border}`,
                        boxShadow: active ? `inset 0 0 0 1px ${C.accentBorder}` : "none",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 7 }}>
                        <span
                          style={{
                            fontSize: 13.5,
                            fontWeight: 600,
                            fontFamily: MONO,
                            color: active ? C.textBright : C.text,
                          }}
                        >
                          {order.publicOrderNumber}
                        </span>
                        {wait ? (
                          <span style={{ fontSize: 11, fontFamily: MONO, color: filter === "submitted" ? C.warning : C.faint }}>
                            ⏱ {wait}
                          </span>
                        ) : null}
                      </div>
                      <div
                        style={{
                          fontSize: 12,
                          color: C.muted,
                          marginBottom: 8,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {order.customerName} · {itemsSummary(order)}
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                        <span
                          style={{
                            fontSize: 10.5,
                            fontWeight: 500,
                            color: C.muted,
                            background: "rgba(255,255,255,0.06)",
                            borderRadius: 5,
                            padding: "2px 7px",
                          }}
                        >
                          {METHOD_LABELS[order.paymentMethod] ?? order.paymentMethod}
                        </span>
                        {!order.proofUploaded ? (
                          <span style={{ fontSize: 10.5, color: C.warning }}>Sans justificatif</span>
                        ) : null}
                        <span style={{ fontSize: 12, fontFamily: MONO, color: C.text, marginLeft: "auto" }}>
                          {formatMAD(order.totalMad)}
                        </span>
                      </div>
                    </button>
                  );
                })}
                <div
                  style={{
                    marginTop: 8,
                    padding: 12,
                    borderRadius: 10,
                    border: `1px dashed ${C.borderStrong}`,
                    textAlign: "center",
                    fontSize: 11.5,
                    color: C.faint,
                    lineHeight: 1.5,
                  }}
                >
                  La file se vide d&apos;elle-même —<br />
                  traitez les plus anciennes d&apos;abord
                </div>
              </>
            )}
          </div>
        </div>

        {/* ===== Proof viewer ===== */}
        <div className="pq-viewer">
          {!selected ? (
            <div
              style={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 10,
                color: C.faint,
                padding: 26,
                textAlign: "center",
              }}
            >
              <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4">
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <circle cx="9" cy="9" r="2" />
                <path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21" />
              </svg>
              <span style={{ fontSize: 12.5 }}>Sélectionnez une commande pour examiner le justificatif.</span>
            </div>
          ) : (
            <>
              <div
                style={{
                  flexShrink: 0,
                  padding: "14px 20px",
                  borderBottom: `1px solid ${C.border}`,
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  flexWrap: "wrap",
                }}
              >
                <span style={{ fontSize: 14, fontWeight: 600, fontFamily: MONO, color: C.text }}>
                  {displayRef}
                </span>
                {proof && proof !== "loading" ? (
                  <span style={{ fontSize: 11.5, color: C.faint, fontFamily: MONO }}>
                    {proof.fileName} · {formatBytes(proof.sizeBytes)} · {formatDate(proof.uploadedAt)}
                  </span>
                ) : (
                  <span style={{ fontSize: 11.5, color: C.faint, fontFamily: MONO }}>
                    {proof === "loading" ? "Chargement du justificatif…" : "Aucun justificatif"}
                  </span>
                )}
                {proof && proof !== "loading" && (proof.mimeType?.startsWith("image/") ?? false) ? (
                  <div style={{ marginLeft: "auto", display: "flex", gap: 6, alignItems: "center" }}>
                    <ZoomButton onClick={() => setZoom((z) => Math.max(0.25, +(z - 0.25).toFixed(2)))}>−</ZoomButton>
                    <span
                      style={{
                        height: 30,
                        display: "flex",
                        alignItems: "center",
                        padding: "0 10px",
                        fontSize: 12,
                        color: C.muted,
                        fontFamily: MONO,
                        border: `1px solid ${C.borderInput}`,
                        borderRadius: 8,
                        background: C.surfaceInput,
                      }}
                    >
                      {Math.round(zoom * 100)}%
                    </span>
                    <ZoomButton onClick={() => setZoom((z) => Math.min(3, +(z + 0.25).toFixed(2)))}>+</ZoomButton>
                    <a href={proofHref(proof)} download={proof.fileName} style={downloadLinkStyle}>
                      Télécharger
                    </a>
                  </div>
                ) : proof && proof !== "loading" ? (
                  <a href={proofHref(proof)} download={proof.fileName} style={{ ...downloadLinkStyle, marginLeft: "auto" }}>
                    Télécharger
                  </a>
                ) : null}
              </div>

              <div style={{ flex: 1, minHeight: 0, overflow: "auto", display: "flex", alignItems: "center", justifyContent: "center", padding: 26 }}>
                {proof === "loading" ? (
                  <span style={{ fontSize: 12.5, color: C.faint }}>Chargement…</span>
                ) : !proof ? (
                  <div
                    style={{
                      width: 420,
                      maxWidth: "100%",
                      height: 400,
                      borderRadius: 12,
                      border: `1px dashed ${C.borderStrong}`,
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 10,
                      color: C.faint,
                    }}
                  >
                    <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4">
                      <rect x="3" y="3" width="18" height="18" rx="2" />
                      <circle cx="9" cy="9" r="2" />
                      <path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21" />
                    </svg>
                    <span style={{ fontSize: 11.5, fontFamily: MONO }}>En attente du justificatif</span>
                  </div>
                ) : proof.mimeType === "application/pdf" ? (
                  <iframe
                    title="Justificatif PDF"
                    src={proofHref(proof)}
                    style={{
                      width: "100%",
                      height: "100%",
                      border: `1px solid ${C.borderStrong}`,
                      borderRadius: 12,
                      background: "#fff",
                    }}
                  />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={proofHref(proof)}
                    alt="Justificatif de paiement"
                    style={{
                      maxWidth: "100%",
                      transform: `scale(${zoom})`,
                      transformOrigin: "center top",
                      borderRadius: 12,
                      border: `1px solid ${C.borderStrong}`,
                      boxShadow: "0 20px 60px rgba(0,0,0,0.5)",
                      transition: "transform 0.12s ease",
                    }}
                  />
                )}
              </div>
            </>
          )}
        </div>

        {/* ===== Decision panel ===== */}
        <div className="pq-decision">
          <div style={{ flex: 1, overflowY: "auto", padding: 18, display: "flex", flexDirection: "column", gap: 14 }}>
            {!selected ? (
              <p style={{ fontSize: 12.5, color: C.faint, lineHeight: 1.6 }}>
                Choisissez une commande dans la file pour vérifier le paiement et décider.
              </p>
            ) : (
              <>
                {/* Verify against */}
                <div style={cardStyle}>
                  <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 13, color: C.text }}>Vérifier</div>
                  <VerifyRow label="Montant attendu" value={formatMAD(selected.totalMad)} valueColor={C.successText} mono />
                  <VerifyRow label="Méthode" value={METHOD_LABELS[selected.paymentMethod] ?? selected.paymentMethod} />
                  <VerifyRow label="Référence" value={displayRef} mono />
                  {receivingAccount ? (
                    <VerifyRow
                      label={receivingAccount.label}
                      value={receivingAccount.primary}
                      hint={receivingAccount.secondary}
                      mono
                      last
                    />
                  ) : null}
                </div>

                {/* Customer */}
                <div style={cardStyle}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div
                      style={{
                        width: 34,
                        height: 34,
                        borderRadius: 9,
                        background: "linear-gradient(145deg,#2c3445,#171b26)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 12,
                        fontWeight: 600,
                        color: C.accentText,
                        flexShrink: 0,
                      }}
                    >
                      {initialsOf(selected.customerName)}
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {selected.customerName}
                      </div>
                      <div style={{ fontSize: 11, color: C.faint, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {selected.customerEmail}
                      </div>
                    </div>
                    <span
                      style={{
                        marginLeft: "auto",
                        fontSize: 10.5,
                        fontWeight: 600,
                        color: C.accentText,
                        background: C.accentSoft,
                        borderRadius: 5,
                        padding: "2px 7px",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {orderStatusShort(selected.status)}
                    </span>
                  </div>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      fontSize: 12,
                      color: C.muted,
                      paddingTop: 10,
                      marginTop: 12,
                      borderTop: `1px solid ${C.borderHairline}`,
                    }}
                  >
                    <span>{selected.items.length} article{selected.items.length > 1 ? "s" : ""}</span>
                    <span>Passée le {formatDate(selected.createdAt)}</span>
                  </div>
                </div>

                {/* Audit trail */}
                <div style={{ ...cardStyle, flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 14, color: C.text }}>Journal d&apos;audit</div>
                  {detail === "loading" ? (
                    <p style={{ fontSize: 12, color: C.faint }}>Chargement…</p>
                  ) : detail && detail.paymentEvents.length > 0 ? (
                    <AuditTrail events={detail.paymentEvents} />
                  ) : (
                    <p style={{ fontSize: 12, color: C.faint }}>Aucun événement enregistré.</p>
                  )}
                </div>
              </>
            )}
          </div>

          {/* Decision actions */}
          {selected ? (
            <div
              style={{
                flexShrink: 0,
                padding: "14px 18px",
                borderTop: `1px solid ${C.borderInput}`,
                background: "rgba(12,13,17,0.85)",
                display: "flex",
                flexDirection: "column",
                gap: 9,
              }}
            >
              {error ? <Banner tone="danger">{error}</Banner> : null}
              {message ? <Banner tone="success">{message}</Banner> : null}
              {!hasDecision ? (
                <div style={{ fontSize: 12, color: C.faint, textAlign: "center", padding: "6px 0" }}>
                  Cette commande est {orderStatusShort(selected.status).toLowerCase()} — aucune action en attente.
                </div>
              ) : (
                <>
                  {canConfirm ? (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={handleConfirm}
                      style={{
                        height: 42,
                        borderRadius: 10,
                        border: "none",
                        background: C.success,
                        color: "#fff",
                        fontSize: 13.5,
                        fontWeight: 600,
                        cursor: busy ? "not-allowed" : "pointer",
                        opacity: busy ? 0.6 : 1,
                        boxShadow: "0 6px 18px rgba(46,160,103,0.3)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: 8,
                      }}
                    >
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                      Confirmer le paiement → préparer
                    </button>
                  ) : null}
                  {canRequestProof || canReject ? (
                    <div style={{ display: "grid", gridTemplateColumns: canRequestProof && canReject ? "1fr 1fr" : "1fr", gap: 9 }}>
                      {canRequestProof ? (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => openReviewEmail("request_proof", "Demander un nouveau justificatif")}
                          style={secondaryActionStyle(busy)}
                        >
                          Nouveau justificatif
                        </button>
                      ) : null}
                      {canReject ? (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => openReviewEmail("reject", "Refuser le paiement")}
                          style={{
                            ...secondaryActionStyle(busy),
                            border: `1px solid ${C.dangerBorder}`,
                            background: C.dangerSoft,
                            color: C.danger,
                            fontWeight: 600,
                          }}
                        >
                          Refuser
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                  <div style={{ fontSize: 10.5, color: C.faint, textAlign: "center" }}>
                    Chaque décision écrit un événement d&apos;audit et envoie l&apos;email correspondant.
                  </div>
                </>
              )}
            </div>
          ) : null}
        </div>
      </div>

      {/* ===== Review email modal ===== */}
      {reviewEmail ? (
        <ModalShell onClose={() => setReviewEmail(null)}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
            <div>
              <h2 style={{ fontSize: 17, fontWeight: 700, margin: 0, color: C.text }}>{reviewEmail.title}</h2>
              <p style={{ fontSize: 12.5, color: C.faint, margin: "4px 0 0" }}>
                Modifiez cet email si nécessaire. Les changements s&apos;appliquent uniquement à cet envoi.
              </p>
            </div>
            <CloseButton onClick={() => setReviewEmail(null)} />
          </div>
          <div style={{ marginTop: 18, display: "flex", flexDirection: "column", gap: 14 }}>
            <Field label="Sujet">
              <input
                className="pq-input"
                value={reviewEmail.subject}
                onChange={(e) => setReviewEmail((c) => (c ? { ...c, subject: e.target.value } : c))}
                style={inputStyle}
              />
            </Field>
            <Field label="Raison interne / client">
              <input
                className="pq-input"
                value={reviewEmail.reason}
                onChange={(e) => setReviewEmail((c) => (c ? { ...c, reason: e.target.value } : c))}
                placeholder="Optionnel"
                style={inputStyle}
              />
            </Field>
            <Field label="Message">
              <textarea
                className="pq-input"
                value={reviewEmail.text}
                onChange={(e) => setReviewEmail((c) => (c ? { ...c, text: e.target.value } : c))}
                rows={9}
                style={{ ...inputStyle, height: "auto", padding: "10px 13px", resize: "vertical", lineHeight: 1.5 }}
              />
            </Field>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <button type="button" onClick={() => setReviewEmail(null)} style={modalSecondaryStyle}>
                Annuler
              </button>
              <button
                type="button"
                disabled={busy || !reviewEmail.subject.trim() || !reviewEmail.text.trim()}
                onClick={sendReviewEmail}
                style={modalPrimaryStyle(busy || !reviewEmail.subject.trim() || !reviewEmail.text.trim())}
              >
                Envoyer et appliquer
              </button>
            </div>
          </div>
        </ModalShell>
      ) : null}
    </div>
  );
}

/* ============================ building blocks ============================ */

const cardStyle: CSSProperties = {
  borderRadius: 14,
  background: C.panel,
  border: `1px solid ${C.border}`,
  padding: 16,
};

const inputStyle: CSSProperties = {
  width: "100%",
  height: 40,
  padding: "0 13px",
  background: C.surfaceInput,
  border: `1px solid ${C.borderInput}`,
  borderRadius: 9,
  color: C.text,
  fontSize: 13,
  outline: "none",
};

const downloadLinkStyle: CSSProperties = {
  height: 30,
  padding: "0 11px",
  display: "inline-flex",
  alignItems: "center",
  borderRadius: 8,
  border: `1px solid ${C.borderStrong}`,
  background: C.surfaceInput,
  color: C.muted,
  fontSize: 12,
  textDecoration: "none",
};

function secondaryActionStyle(disabled: boolean): CSSProperties {
  return {
    height: 36,
    borderRadius: 9,
    border: `1px solid ${C.borderStronger}`,
    background: C.surfaceInput,
    color: C.text,
    fontSize: 12.5,
    fontWeight: 500,
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.6 : 1,
  };
}

const modalSecondaryStyle: CSSProperties = {
  height: 42,
  borderRadius: 10,
  border: `1px solid ${C.borderStronger}`,
  background: C.surfaceInput,
  color: C.text,
  fontSize: 13,
  fontWeight: 500,
  cursor: "pointer",
};

function modalPrimaryStyle(disabled: boolean): CSSProperties {
  return {
    height: 42,
    borderRadius: 10,
    border: "none",
    background: C.accent,
    color: "#fff",
    fontSize: 13,
    fontWeight: 600,
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.55 : 1,
  };
}

function ZoomButton({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        width: 30,
        height: 30,
        borderRadius: 8,
        border: `1px solid ${C.borderStrong}`,
        background: C.surfaceInput,
        color: C.muted,
        cursor: "pointer",
        fontSize: 14,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {children}
    </button>
  );
}

function VerifyRow({
  label,
  value,
  hint,
  valueColor,
  mono,
  last,
}: {
  label: string;
  value: string;
  hint?: string;
  valueColor?: string;
  mono?: boolean;
  last?: boolean;
}) {
  return (
    <div style={{ marginBottom: last ? 0 : 9 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: 12.5, alignItems: "baseline" }}>
        <span style={{ color: C.muted, flexShrink: 0 }}>{label}</span>
        <span
          style={{
            color: valueColor ?? C.text,
            fontFamily: mono ? MONO : "inherit",
            textAlign: "right",
            wordBreak: "break-all",
          }}
        >
          {value}
        </span>
      </div>
      {hint ? <div style={{ fontSize: 11, color: C.faint, textAlign: "right", marginTop: 2 }}>{hint}</div> : null}
    </div>
  );
}

function AuditTrail({ events }: { events: AdminOrderDTO["paymentEvents"] }) {
  const ordered = [...events].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
  const dotColor = (type: string) => {
    if (type.includes("confirmed") || type === "delivered") return C.success;
    if (type.includes("reject") || type.includes("issue")) return C.danger;
    if (type.includes("proof") || type.includes("submitted")) return C.warning;
    return C.accent;
  };
  return (
    <div>
      {ordered.map((event, index) => {
        const isLast = index === ordered.length - 1;
        const transition =
          event.fromStatus && event.toStatus
            ? `${orderStatusShort(event.fromStatus)} → ${orderStatusShort(event.toStatus)}`
            : event.note ?? "";
        return (
          <div key={event.id} style={{ display: "flex", gap: 11 }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: dotColor(event.type), marginTop: 4, flexShrink: 0 }} />
              {!isLast ? <span style={{ width: 1.5, flex: 1, background: "rgba(255,255,255,0.08)" }} /> : null}
            </div>
            <div style={{ paddingBottom: isLast ? 0 : 13, minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 500, color: C.text }}>{eventLabel(event.type)}</div>
              <div style={{ fontSize: 10.5, color: C.faint, fontFamily: MONO, marginTop: 2 }}>
                {formatDate(event.createdAt)}
                {transition ? ` · ${transition}` : ""}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function QueueSkeleton() {
  return (
    <>
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          style={{
            height: 84,
            borderRadius: 11,
            background: C.panel,
            border: `1px solid ${C.border}`,
            opacity: 0.5,
          }}
        />
      ))}
    </>
  );
}

function Banner({ tone, children }: { tone: "danger" | "success"; children: ReactNode }) {
  const danger = tone === "danger";
  return (
    <div
      style={{
        borderRadius: 9,
        border: `1px solid ${danger ? C.dangerBorder : C.successBorder}`,
        background: danger ? C.dangerSoft : C.successSoft,
        padding: "8px 12px",
        fontSize: 12,
        color: danger ? "#F3B4B4" : C.successText,
      }}
    >
      {children}
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label style={{ display: "block" }}>
      <span style={{ display: "block", fontSize: 12, color: C.muted, marginBottom: 6 }}>{label}</span>
      {children}
    </label>
  );
}

function CloseButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Fermer"
      style={{
        width: 30,
        height: 30,
        borderRadius: 8,
        border: `1px solid ${C.borderStrong}`,
        background: C.surfaceInput,
        color: C.muted,
        cursor: "pointer",
        flexShrink: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <line x1="18" y1="6" x2="6" y2="18" />
        <line x1="6" y1="6" x2="18" y2="18" />
      </svg>
    </button>
  );
}

function ModalShell({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(4,5,7,0.72)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
        zIndex: 60,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: 680,
          maxHeight: "90vh",
          overflowY: "auto",
          background: C.panel,
          border: `1px solid ${C.borderStrong}`,
          borderRadius: 16,
          padding: 22,
          boxShadow: "0 30px 90px rgba(0,0,0,0.6)",
        }}
      >
        {children}
      </div>
    </div>
  );
}
