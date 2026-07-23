"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import ActionDialog from "@/components/admin/clients/ActionDialog";
import { relativeTime } from "@/components/admin/operations/shared";
import type { InstagramStatusDTO, StudioContentItemDTO } from "@/lib/composio/instagram/types";
import {
  reconnectInstagramAction,
  revokeInstagramAction,
  syncInstagramAction,
  testInstagramConnectionAction,
  unlinkInstagramAction,
} from "@/app/actions/instagram";
import {
  cancelScheduledAction,
  deleteItemAction,
  duplicateItemAction,
  publishExistingAction,
  scheduleItemAction,
} from "@/app/actions/instagramStudio";
import { C } from "./tokens";
import { Icon } from "./Icon";
import { Composer } from "./Composer";
import { QueuePanel, PublicationsPanel, type RowAction } from "./Panels";
import { ScheduleModal } from "./ScheduleModal";

type Tab = "create" | "queue" | "publications";
type Toast = { id: number; text: string; tone: "ok" | "err" | "info" } | null;

/** Small responsive hook: collapses the composer to one column below 900px. */
function useViewport(): "desktop" | "mobile" {
  const [vp, setVp] = useState<"desktop" | "mobile">("desktop");
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 900px)");
    const apply = () => setVp(mq.matches ? "mobile" : "desktop");
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);
  return vp;
}

export default function InstagramStudio({
  status,
  queue,
  publications,
  banner,
}: {
  status: InstagramStatusDTO;
  queue: StudioContentItemDTO[];
  publications: StudioContentItemDTO[];
  banner: "connected" | "error-oauth" | "error-verify" | null;
}) {
  const router = useRouter();
  const viewport = useViewport();
  const [tab, setTab] = useState<Tab>("create");
  const [toast, setToast] = useState<Toast>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [dialog, setDialog] = useState<null | "unlink" | "revoke">(null);
  const [pending, startTransition] = useTransition();
  const [editItem, setEditItem] = useState<StudioContentItemDTO | null>(null);
  const [scheduleTarget, setScheduleTarget] = useState<StudioContentItemDTO | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handle = status.username ? `@${status.username}` : "@compte";
  const publishAvailable = useMemo(
    () => status.capabilities.find((c) => c.key === "publish")?.available ?? false,
    [status.capabilities],
  );

  useEffect(() => {
    if (banner === "connected") showToast("Compte Instagram connecté.", "ok");
    else if (banner === "error-oauth") showToast("La connexion a été annulée ou refusée.", "err");
    else if (banner === "error-verify") showToast("La connexion n’a pas pu être vérifiée.", "err");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function showToast(text: string, tone: "ok" | "err" | "info") {
    setToast({ id: Date.now(), text, tone });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), tone === "info" ? 1400 : 2400);
  }

  function onPersisted(opts?: { goToQueue?: boolean }) {
    if (opts?.goToQueue) setTab("queue");
    router.refresh();
  }

  function runAction(action: () => Promise<{ ok: boolean; error?: string }>, okText: string) {
    setMenuOpen(false);
    startTransition(async () => {
      const res = await action();
      showToast(res.ok ? okText : res.error ?? "Échec de l’action.", res.ok ? "ok" : "err");
      router.refresh();
    });
  }

  function reconnect() {
    setMenuOpen(false);
    startTransition(async () => {
      const res = await reconnectInstagramAction();
      if (res.ok && res.data?.redirectUrl) window.location.href = res.data.redirectUrl;
      else showToast(res.error ?? "Impossible de démarrer la reconnexion.", "err");
    });
  }

  /** Routes a queue/publications row action to its server action or UI state. */
  function handleRowAction(action: RowAction, item: StudioContentItemDTO) {
    switch (action) {
      case "edit":
        setEditItem(item);
        setTab("create");
        return;
      case "reschedule":
        setScheduleTarget(item);
        return;
      case "duplicate":
        startTransition(async () => {
          const res = await duplicateItemAction(item.id);
          showToast(res.ok ? "Élément dupliqué." : res.error ?? "Échec.", res.ok ? "ok" : "err");
          router.refresh();
        });
        return;
      case "delete":
        startTransition(async () => {
          const res = await deleteItemAction(item.id);
          showToast(res.ok ? "Élément supprimé." : res.error ?? "Échec.", res.ok ? "ok" : "err");
          router.refresh();
        });
        return;
      case "cancel":
        startTransition(async () => {
          const res = await cancelScheduledAction(item.id);
          showToast(res.ok ? "Programmation annulée." : res.error ?? "Échec.", res.ok ? "ok" : "err");
          router.refresh();
        });
        return;
      case "publish":
      case "retry":
        showToast("Publication en cours…", "info");
        startTransition(async () => {
          const res = await publishExistingAction(item.id);
          showToast(res.ok ? "Publication publiée." : res.error ?? "Échec de la publication.", res.ok ? "ok" : "err");
          router.refresh();
        });
        return;
      default:
        return;
    }
  }

  /** Confirm from the schedule modal (a queue item, or a freshly-saved draft). */
  function confirmSchedule(date: string, time: string) {
    const target = scheduleTarget;
    if (!target) return;
    startTransition(async () => {
      const res = await scheduleItemAction({ id: target.id, date, time });
      if (res.ok) {
        setScheduleTarget(null);
        setEditItem(null);
        setTab("queue");
        showToast("Publication programmée.", "ok");
        router.refresh();
      } else {
        showToast(res.error ?? "Programmation impossible.", "err");
      }
    });
  }

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", background: C.appBg, position: "relative", overflow: "hidden" }}>
      {/* STICKY HEADER */}
      <div style={{ flexShrink: 0, background: "rgba(9,10,12,0.88)", backdropFilter: "blur(14px)", borderBottom: `1px solid ${C.borderCard}`, padding: "20px 34px 0" }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 600, letterSpacing: "-0.025em", margin: 0 }}>Instagram</h1>
          <p style={{ fontSize: 13, color: C.muted, margin: "4px 0 0" }}>
            Studio de contenu — création, planification et suivi des publications.
          </p>
        </div>

        {/* account status row */}
        <div style={{ marginTop: 16, display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", background: C.card, border: `1px solid ${C.borderCard}`, borderRadius: 12, position: "relative" }}>
          <div style={{ width: 32, height: 32, borderRadius: 9, flexShrink: 0, background: "linear-gradient(145deg,#f58529,#dd2a7b 45%,#8134af 75%,#515bd4)", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
            {status.profilePictureUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={status.profilePictureUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            ) : (
              <Icon name="image" size={16} color="#fff" strokeWidth={2} />
            )}
          </div>
          <div style={{ display: "flex", flexDirection: "column", lineHeight: 1.25, minWidth: 0 }}>
            <span style={{ fontSize: 13.5, fontWeight: 600 }}>{handle}</span>
            <span style={{ fontSize: 11.5, color: C.muted }}>
              {status.lastSyncAt ? `Synchronisé ${relativeTime(status.lastSyncAt)}` : "Jamais synchronisé"}
            </span>
          </div>
          <span style={{ display: "flex", alignItems: "center", gap: 6, height: 24, padding: "0 10px", borderRadius: 7, background: "rgba(46,160,103,0.12)", border: "1px solid rgba(46,160,103,0.28)", marginLeft: 6 }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: C.success, boxShadow: `0 0 6px ${C.success}` }} />
            <span style={{ fontSize: 11.5, fontWeight: 500, color: C.successText }}>Connecté</span>
          </span>
          <div style={{ flex: 1 }} />
          <button type="button" aria-label="Synchroniser maintenant" title="Synchroniser maintenant" disabled={pending} onClick={() => runAction(syncInstagramAction, "Profil synchronisé.")} style={roundBtn}>
            <Icon name="refresh" size={14} color={C.dim} strokeWidth={2} />
          </button>
          <button type="button" aria-label="Plus d’options" title="Plus d’options" onClick={() => setMenuOpen((o) => !o)} style={roundBtn}>
            <Icon name="more" size={15} color={C.dim} strokeWidth={2.2} />
          </button>
          {menuOpen && (
            <>
              <div onClick={() => setMenuOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 40 }} />
              <div style={{ position: "absolute", top: 52, right: 14, background: C.menu, border: `1px solid rgba(255,255,255,0.12)`, borderRadius: 11, padding: 6, minWidth: 210, boxShadow: "0 20px 44px rgba(0,0,0,0.5)", zIndex: 50 }}>
                <MenuItem label="Tester la connexion" onClick={() => runAction(testInstagramConnectionAction, "Connexion vérifiée.")} />
                <MenuItem label="Reconnecter" onClick={reconnect} />
                {status.profileUrl && <MenuItem label="Ouvrir Instagram ↗" onClick={() => { setMenuOpen(false); window.open(status.profileUrl!, "_blank"); }} />}
                <MenuItem label="Déconnecter" tone="danger" onClick={() => { setMenuOpen(false); setDialog("unlink"); }} />
              </div>
            </>
          )}
        </div>

        {/* main tabs */}
        <div style={{ display: "flex", gap: 4, marginTop: 16 }}>
          {([["create", "Créer"], ["queue", "File d’attente"], ["publications", "Publications"]] as const).map(([k, label]) => {
            const on = tab === k;
            return (
              <button key={k} type="button" onClick={() => setTab(k)} style={{ height: 38, padding: "0 15px", border: "none", background: "transparent", color: on ? C.accentTextBright : C.dim2, fontSize: 13.5, fontWeight: on ? 600 : 500, cursor: "pointer", borderBottom: `2px solid ${on ? C.accent : "transparent"}` }}>
                {label}
                {k === "queue" && queue.length > 0 ? ` · ${queue.length}` : ""}
              </button>
            );
          })}
        </div>
      </div>

      {/* SCROLL AREA */}
      <div style={{ flex: 1, minHeight: 0, overflowY: "auto", overflowX: "hidden" }}>
        <div style={{ maxWidth: 1320, margin: "0 auto", padding: "22px 34px 0" }}>
          {tab === "create" && (
            <Composer
              key={editItem?.id ?? "new"}
              handle={handle}
              avatarUrl={status.profilePictureUrl}
              publishAvailable={publishAvailable}
              viewport={viewport}
              initialItem={editItem}
              onToast={showToast}
              onPersisted={onPersisted}
              onExitEdit={() => setEditItem(null)}
              onSchedule={(item) => setScheduleTarget(item)}
            />
          )}
          {tab === "queue" && <QueuePanel items={queue} handle={handle} avatarUrl={status.profilePictureUrl} busy={pending} onAction={handleRowAction} />}
          {tab === "publications" && <PublicationsPanel items={publications} onAction={handleRowAction} />}

          {/* ZONE SENSIBLE (all tabs) */}
          <div style={{ margin: "6px 0 34px", paddingTop: 18, borderTop: `1px solid ${C.borderSubtle}` }}>
            <div style={{ background: C.card, border: `1px solid ${C.borderCard}`, borderRadius: 16, padding: "18px 20px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 9 }}>
                <Icon name="alert" size={15} color={C.danger} strokeWidth={2} />
                <span style={{ fontSize: 14.5, fontWeight: 600 }}>Zone sensible</span>
              </div>
              <p style={{ fontSize: 12.5, color: C.dim2, margin: "0 0 14px", lineHeight: 1.6 }}>
                « Déconnecter » retire le compte de Ghost.ma sans révoquer l’accès dans Composio. « Révoquer »
                supprime aussi la connexion Composio (l’accès Instagram devra être ré-autorisé).
              </p>
              <div style={{ display: "flex", gap: 10 }}>
                <button type="button" disabled={pending} onClick={() => setDialog("unlink")} style={{ height: 34, padding: "0 14px", borderRadius: 9, border: `1px solid rgba(255,255,255,0.12)`, background: "transparent", color: C.text2, fontSize: 12.5, fontWeight: 500, cursor: "pointer" }}>
                  Déconnecter
                </button>
                <button type="button" disabled={pending} onClick={() => setDialog("revoke")} style={{ height: 34, padding: "0 14px", borderRadius: 9, border: `1px solid rgba(229,72,77,0.35)`, background: "rgba(229,72,77,0.08)", color: C.dangerText, fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>
                  Révoquer la connexion Composio
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* TOAST */}
      {toast && (
        <div style={{ position: "absolute", bottom: 22, left: "50%", transform: "translateX(-50%)", zIndex: 120, padding: "11px 18px", borderRadius: 11, background: C.menu, border: `1px solid ${toast.tone === "err" ? "rgba(229,72,77,0.4)" : toast.tone === "ok" ? "rgba(46,160,103,0.4)" : "rgba(255,255,255,0.14)"}`, boxShadow: "0 20px 44px rgba(0,0,0,0.5)", fontSize: 13, fontWeight: 500, display: "flex", alignItems: "center", gap: 9, color: C.text }}>
          {toast.tone === "ok" && <Icon name="check" size={14} color={C.success} strokeWidth={2.4} />}
          {toast.tone === "err" && <Icon name="alert" size={14} color={C.danger} strokeWidth={2} />}
          {toast.text}
        </div>
      )}

      <ActionDialog
        open={dialog === "unlink"}
        title="Déconnecter Instagram ?"
        description="Le compte sera retiré de Ghost.ma. L’accès Composio et le compte Instagram ne sont pas supprimés."
        confirmLabel="Déconnecter"
        tone="danger"
        busy={pending}
        onCancel={() => setDialog(null)}
        onConfirm={() => {
          setDialog(null);
          runAction(unlinkInstagramAction, "Compte déconnecté de Ghost.ma.");
        }}
      />
      <ActionDialog
        open={dialog === "revoke"}
        title="Révoquer la connexion Composio ?"
        description="La connexion Composio sera supprimée. Vous devrez ré-autoriser Instagram pour reconnecter."
        confirmLabel="Révoquer"
        tone="danger"
        busy={pending}
        onCancel={() => setDialog(null)}
        onConfirm={() => {
          setDialog(null);
          runAction(revokeInstagramAction, "Connexion révoquée.");
        }}
      />

      <ScheduleModal
        open={scheduleTarget !== null}
        busy={pending}
        initialDate={scheduleTarget?.scheduledFor ? scheduleTarget.scheduledFor.slice(0, 10) : null}
        initialTime={scheduleTarget?.scheduledFor ? scheduleTarget.scheduledFor.slice(11, 16) : null}
        onCancel={() => setScheduleTarget(null)}
        onConfirm={confirmSchedule}
      />
    </div>
  );
}

const roundBtn: React.CSSProperties = {
  width: 30,
  height: 30,
  borderRadius: 8,
  border: `1px solid ${C.borderInput}`,
  background: C.surface,
  color: C.dim,
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};

function MenuItem({ label, onClick, tone }: { label: string; onClick: () => void; tone?: "danger" }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{ display: "block", width: "100%", textAlign: "left", padding: "8px 10px", border: "none", borderRadius: 8, background: "transparent", color: tone === "danger" ? C.dangerText : C.text2, fontSize: 12.5, fontWeight: 500, cursor: "pointer" }}
      onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.05)")}
      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
    >
      {label}
    </button>
  );
}
