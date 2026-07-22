"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import type { OpsHealthStatus } from "@/lib/dto";
import { OpsCard, StatusBadge, WarningRow, relativeTime } from "@/components/admin/operations/shared";
import ActionDialog from "@/components/admin/clients/ActionDialog";
import type {
  DiscoveredAccountDTO,
  InstagramCommentDTO,
  InstagramMediaDTO,
  InstagramStatusDTO,
} from "@/lib/composio/instagram/types";
import {
  connectInstagramAction,
  reconnectInstagramAction,
  discoverInstagramAccountsAction,
  linkInstagramAccountAction,
  testInstagramConnectionAction,
  syncInstagramAction,
  unlinkInstagramAction,
  revokeInstagramAction,
  loadInstagramCommentsAction,
  replyToInstagramCommentAction,
  publishInstagramMediaAction,
} from "@/app/actions/instagram";

type Banner = "connected" | "error-oauth" | "error-verify" | null;
type Msg = { tone: "ok" | "err"; text: string } | null;

function health(status: InstagramStatusDTO["status"]): OpsHealthStatus {
  switch (status) {
    case "CONNECTED":
      return "healthy";
    case "EXPIRED":
    case "REAUTH_REQUIRED":
      return "warning";
    case "ERROR":
      return "offline";
    default:
      return "unknown";
  }
}

function InstagramLogo({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.5" cy="6.5" r="0.6" fill="currentColor" />
    </svg>
  );
}

export default function InstagramIntegrationView({
  status,
  media,
  banner,
}: {
  status: InstagramStatusDTO;
  media: InstagramMediaDTO[];
  banner: Banner;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<Msg>(
    banner === "connected"
      ? { tone: "ok", text: "Compte Instagram connecté." }
      : banner === "error-oauth"
        ? { tone: "err", text: "La connexion Instagram a été annulée ou refusée." }
        : banner === "error-verify"
          ? { tone: "err", text: "La connexion n’a pas pu être vérifiée. Réessayez." }
          : null,
  );
  const [discovered, setDiscovered] = useState<DiscoveredAccountDTO[] | null>(null);
  const [dialog, setDialog] = useState<null | "unlink" | "revoke">(null);

  const publishAvailable = status.capabilities.find((c) => c.key === "publish")?.available ?? false;
  const replyAvailable = status.capabilities.find((c) => c.key === "commentReply")?.available ?? false;

  /** Runs a server action that returns { ok, error } and refreshes the page. */
  function run(action: () => Promise<{ ok: boolean; error?: string }>, okText: string) {
    setMsg(null);
    startTransition(async () => {
      const res = await action();
      setMsg(res.ok ? { tone: "ok", text: okText } : { tone: "err", text: res.error ?? "Échec de l’action." });
      router.refresh();
    });
  }

  function connectOAuth(action: typeof connectInstagramAction) {
    setMsg(null);
    startTransition(async () => {
      const res = await action();
      if (res.ok && res.data?.redirectUrl) {
        window.location.href = res.data.redirectUrl;
        return;
      }
      setMsg({ tone: "err", text: res.error ?? "Impossible de démarrer la connexion." });
    });
  }

  function discover() {
    setMsg(null);
    startTransition(async () => {
      const res = await discoverInstagramAccountsAction();
      if (res.ok) setDiscovered(res.data ?? []);
      else setMsg({ tone: "err", text: res.error ?? "Détection impossible." });
    });
  }

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      {/* Header */}
      <header className="flex items-center gap-3">
        <span
          className="flex h-11 w-11 items-center justify-center rounded-2xl text-white"
          style={{ background: "linear-gradient(135deg,#F58529,#DD2A7B 50%,#8134AF 90%)" }}
        >
          <InstagramLogo />
        </span>
        <div className="min-w-0">
          <h1 className="text-lg font-semibold text-white">Instagram</h1>
          <p className="text-xs text-muted">Intégration via Composio · Compte professionnel</p>
        </div>
        <span className="flex-1" />
        <StatusBadge status={health(status.status)} label={status.statusLabel} />
      </header>

      {msg && (
        <p className={`text-sm ${msg.tone === "ok" ? "text-emerald-400" : "text-red-400"}`}>{msg.text}</p>
      )}

      {!status.configured && (
        <WarningRow
          severity="critical"
          title="Composio n’est pas configuré"
          description="La clé API Composio est absente sur ce serveur. Ajoutez COMPOSIO_API_KEY puis rechargez la page."
        />
      )}

      {status.lastError && (
        <WarningRow severity="warning" title="Dernière erreur" description={status.lastError.message} />
      )}

      {/* Not connected → connect panel */}
      {status.configured && !status.connected && (
        <OpsCard title="Connecter Instagram" icon={<InstagramLogo size={16} />}>
          <p className="text-sm text-muted">
            Reliez le compte Instagram professionnel déjà connecté dans Composio, ou démarrez une nouvelle
            connexion OAuth gérée.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" className="btn-primary" disabled={pending} onClick={() => connectOAuth(connectInstagramAction)}>
              Connecter Instagram
            </button>
            <button type="button" className="btn-ghost" disabled={pending} onClick={discover}>
              Détecter un compte existant
            </button>
          </div>

          {discovered && (
            <div className="mt-4 space-y-2">
              {discovered.length === 0 ? (
                <p className="text-xs text-muted">Aucun compte Instagram connecté trouvé dans Composio.</p>
              ) : (
                discovered.map((acc) => (
                  <div key={acc.ref} className="flex items-center gap-3 rounded-xl border border-border bg-surface2/40 px-3 py-2.5">
                    <InstagramLogo size={16} />
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] text-white">{acc.username ?? "Compte Instagram"}</p>
                      <p className="text-[11px] text-faint">
                        {acc.status}
                        {acc.createdAt ? ` · ${relativeTime(acc.createdAt)}` : ""}
                      </p>
                    </div>
                    <button
                      type="button"
                      className="btn-primary"
                      disabled={pending}
                      onClick={() => run(() => linkInstagramAccountAction(acc.ref), "Compte lié et vérifié.")}
                    >
                      Lier ce compte
                    </button>
                  </div>
                ))
              )}
            </div>
          )}
        </OpsCard>
      )}

      {/* Connected → account + capabilities */}
      {status.connected && (
        <>
          <OpsCard
            title="Compte"
            icon={<InstagramLogo size={16} />}
            headerRight={
              status.profileUrl ? (
                <a href={status.profileUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-muted hover:text-white">
                  Ouvrir Instagram ↗
                </a>
              ) : null
            }
          >
            <div className="flex items-start gap-4">
              {status.profilePictureUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={status.profilePictureUrl} alt="" className="h-16 w-16 rounded-full object-cover" />
              ) : (
                <span className="flex h-16 w-16 items-center justify-center rounded-full bg-surface2 text-muted">
                  <InstagramLogo />
                </span>
              )}
              <div className="grid flex-1 grid-cols-2 gap-x-4 gap-y-1.5 text-sm sm:grid-cols-3">
                <Field label="Nom d’utilisateur" value={status.username ? `@${status.username}` : "—"} />
                <Field label="Nom du profil" value={status.profileName ?? "—"} />
                <Field label="Type de compte" value={status.accountType ?? "—"} />
                <Field label="ID de compte" value={status.accountId ?? "—"} mono />
                <Field label="Page Facebook" value={status.facebookPageName ?? status.facebookPageId ?? "—"} />
                <Field label="Connecté" value={status.connectedAt ? relativeTime(status.connectedAt) : "—"} />
                <Field label="Vérifié" value={status.lastVerifiedAt ? relativeTime(status.lastVerifiedAt) : "—"} />
                <Field label="Synchronisé" value={status.lastSyncAt ? relativeTime(status.lastSyncAt) : "—"} />
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <button type="button" className="btn-ghost" disabled={pending} onClick={() => run(testInstagramConnectionAction, "Connexion vérifiée.")}>
                Tester la connexion
              </button>
              <button type="button" className="btn-ghost" disabled={pending} onClick={() => run(syncInstagramAction, "Profil synchronisé.")}>
                Synchroniser maintenant
              </button>
              <button type="button" className="btn-ghost" disabled={pending} onClick={() => connectOAuth(reconnectInstagramAction)}>
                Reconnecter
              </button>
              <button type="button" className="btn-ghost !text-red-400" disabled={pending} onClick={() => setDialog("unlink")}>
                Déconnecter
              </button>
            </div>
          </OpsCard>

          <CapabilitiesCard status={status} />

          <RecentMediaCard
            media={media}
            replyAvailable={replyAvailable}
            username={status.username}
            pending={pending}
          />

          {publishAvailable && <PublishCard username={status.username} onDone={() => router.refresh()} />}

          {/* Explicit, separate revoke */}
          <OpsCard title="Zone sensible" icon={<InstagramLogo size={16} />}>
            <p className="text-sm text-muted">
              « Déconnecter » retire le compte de Ghost.ma sans révoquer l’accès dans Composio. « Révoquer »
              supprime aussi la connexion Composio (l’accès Instagram devra être ré-autorisé).
            </p>
            <div className="mt-3">
              <button type="button" className="btn-ghost !text-red-400" disabled={pending} onClick={() => setDialog("revoke")}>
                Révoquer la connexion Composio
              </button>
            </div>
          </OpsCard>
        </>
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
          run(unlinkInstagramAction, "Compte déconnecté de Ghost.ma.");
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
          run(revokeInstagramAction, "Connexion révoquée.");
        }}
      />
    </div>
  );
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-medium uppercase tracking-wide text-faint">{label}</p>
      <p className={`truncate text-[13px] text-white ${mono ? "font-mono text-[11px]" : ""}`}>{value}</p>
    </div>
  );
}

function CapabilitiesCard({ status }: { status: InstagramStatusDTO }) {
  return (
    <OpsCard title="Capacités" icon={<InstagramLogo size={16} />}>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {status.capabilities.map((cap) => (
          <div key={cap.key} className="flex items-center justify-between rounded-xl border border-border bg-surface2/40 px-3 py-2">
            <span className="text-[13px] text-white">{cap.label}</span>
            <span className={`text-[11px] font-medium ${cap.available ? "text-emerald-400" : "text-faint"}`}>
              {cap.available ? "Disponible" : "Non disponible"}
            </span>
          </div>
        ))}
        {/* Instagram Direct Messaging is out of scope — needs extra Meta review. */}
        <div className="flex items-center justify-between rounded-xl border border-border bg-surface2/20 px-3 py-2 opacity-70">
          <span className="text-[13px] text-white">Messagerie privée</span>
          <span className="text-[11px] font-medium text-faint">Non disponible</span>
        </div>
      </div>
      <p className="mt-3 text-[11px] text-muted">
        La messagerie Instagram nécessite des autorisations Meta supplémentaires et n’est pas activée
        actuellement.
      </p>
    </OpsCard>
  );
}

function RecentMediaCard({
  media,
  replyAvailable,
  username,
  pending,
}: {
  media: InstagramMediaDTO[];
  replyAvailable: boolean;
  username: string | null;
  pending: boolean;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [comments, setComments] = useState<InstagramCommentDTO[]>([]);
  const [loading, setLoading] = useState(false);
  const [, startTransition] = useTransition();

  function toggle(mediaId: string) {
    if (openId === mediaId) {
      setOpenId(null);
      setComments([]);
      return;
    }
    setOpenId(mediaId);
    setComments([]);
    setLoading(true);
    startTransition(async () => {
      const res = await loadInstagramCommentsAction(mediaId);
      setComments(res.ok ? res.data ?? [] : []);
      setLoading(false);
    });
  }

  return (
    <OpsCard title="Publications récentes" icon={<InstagramLogo size={16} />}>
      {media.length === 0 ? (
        <p className="text-sm text-muted">Aucune publication à afficher (ou lecture non autorisée).</p>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {media.map((m) => (
            <div key={m.id} className="overflow-hidden rounded-xl border border-border bg-surface2/40">
              {m.thumbnailUrl || m.mediaUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={m.thumbnailUrl ?? m.mediaUrl ?? ""} alt="" className="aspect-square w-full object-cover" />
              ) : (
                <div className="flex aspect-square w-full items-center justify-center text-faint">
                  <InstagramLogo />
                </div>
              )}
              <div className="p-2">
                <p className="line-clamp-2 text-[11px] text-muted">{m.caption ?? "—"}</p>
                <div className="mt-1 flex items-center justify-between text-[10px] text-faint">
                  <span>{m.timestamp ? relativeTime(m.timestamp) : ""}</span>
                  <span>{m.commentsCount != null ? `${m.commentsCount} 💬` : ""}</span>
                </div>
                <div className="mt-1.5 flex items-center gap-2">
                  {m.permalink && (
                    <a href={m.permalink} target="_blank" rel="noopener noreferrer" className="text-[11px] text-muted hover:text-white">
                      Voir ↗
                    </a>
                  )}
                  {replyAvailable && (
                    <button type="button" className="text-[11px] text-muted hover:text-white" onClick={() => toggle(m.id)}>
                      {openId === m.id ? "Masquer" : "Commentaires"}
                    </button>
                  )}
                </div>
              </div>
              {openId === m.id && (
                <div className="border-t border-border p-2">
                  <CommentsPanel
                    comments={comments}
                    loading={loading}
                    username={username}
                    canReply={replyAvailable}
                    parentPending={pending}
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </OpsCard>
  );
}

function CommentsPanel({
  comments,
  loading,
  username,
  canReply,
  parentPending,
}: {
  comments: InstagramCommentDTO[];
  loading: boolean;
  username: string | null;
  canReply: boolean;
  parentPending: boolean;
}) {
  if (loading) return <p className="text-[11px] text-faint">Chargement…</p>;
  if (comments.length === 0) return <p className="text-[11px] text-faint">Aucun commentaire.</p>;
  return (
    <ul className="space-y-2">
      {comments.map((c) => (
        <li key={c.id}>
          <ReplyRow comment={c} username={username} canReply={canReply} parentPending={parentPending} />
        </li>
      ))}
    </ul>
  );
}

function ReplyRow({
  comment,
  username,
  canReply,
  parentPending,
}: {
  comment: InstagramCommentDTO;
  username: string | null;
  canReply: boolean;
  parentPending: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [token] = useState(() => (typeof crypto !== "undefined" ? crypto.randomUUID() : String(Date.now())));
  const [pending, startTransition] = useTransition();
  const [confirm, setConfirm] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  function submit() {
    setConfirm(false);
    setError(null);
    startTransition(async () => {
      const res = await replyToInstagramCommentAction({ commentId: comment.id, message: text.trim(), token });
      if (res.ok) {
        setDone(true);
        setOpen(false);
        router.refresh();
      } else {
        setError(res.error ?? "Échec de l’envoi.");
      }
    });
  }

  return (
    <div className="rounded-lg bg-surface2/30 px-2 py-1.5">
      <p className="text-[11px] text-white">
        <span className="font-semibold">{comment.username ? `@${comment.username}` : "—"}</span>
        {comment.replied && <span className="ml-1 text-[10px] text-emerald-400">· répondu</span>}
      </p>
      <p className="text-[11px] text-muted">{comment.text ?? "—"}</p>
      {canReply && !done && (
        <div className="mt-1">
          {!open ? (
            <button type="button" className="text-[11px] text-muted hover:text-white" onClick={() => setOpen(true)}>
              Répondre
            </button>
          ) : (
            <div className="space-y-1.5">
              <textarea
                className="input min-h-[52px] text-[12px]"
                placeholder="Votre réponse…"
                value={text}
                maxLength={2200}
                onChange={(e) => setText(e.target.value)}
              />
              <p className="text-[10px] text-faint">Publié en tant que {username ? `@${username}` : "ce compte"}.</p>
              {error && <p className="text-[11px] text-red-400">{error}</p>}
              <div className="flex gap-2">
                <button
                  type="button"
                  className="btn-primary !py-1 !text-[11px]"
                  disabled={pending || parentPending || !text.trim()}
                  onClick={() => setConfirm(true)}
                >
                  Publier la réponse
                </button>
                <button type="button" className="btn-ghost !py-1 !text-[11px]" disabled={pending} onClick={() => setOpen(false)}>
                  Annuler
                </button>
              </div>
            </div>
          )}
        </div>
      )}
      {done && <p className="mt-1 text-[11px] text-emerald-400">Réponse envoyée.</p>}

      <ActionDialog
        open={confirm}
        title="Publier la réponse ?"
        description={`La réponse sera publiée publiquement en tant que ${username ? `@${username}` : "ce compte"} sur Instagram.`}
        confirmLabel="Publier la réponse"
        busy={pending}
        onCancel={() => setConfirm(false)}
        onConfirm={submit}
      />
    </div>
  );
}

function PublishCard({ username, onDone }: { username: string | null; onDone: () => void }) {
  const [imageUrl, setImageUrl] = useState("");
  const [caption, setCaption] = useState("");
  const [token] = useState(() => (typeof crypto !== "undefined" ? crypto.randomUUID() : String(Date.now())));
  const [confirm, setConfirm] = useState(false);
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<Msg>(null);

  const validUrl = /^https:\/\/.+\.(jpe?g|png)(\?.*)?$/i.test(imageUrl.trim());

  function submit() {
    setConfirm(false);
    setResult(null);
    startTransition(async () => {
      const res = await publishInstagramMediaAction({ imageUrl: imageUrl.trim(), caption: caption.trim(), token });
      if (res.ok) {
        setResult({ tone: "ok", text: "Publication envoyée à Instagram." });
        setImageUrl("");
        setCaption("");
        onDone();
      } else {
        setResult({ tone: "err", text: res.error ?? "Échec de la publication." });
      }
    });
  }

  return (
    <OpsCard title="Publier sur Instagram" icon={<InstagramLogo size={16} />}>
      <p className="text-sm text-muted">
        Publiez une image (JPG/PNG) via une URL publique https. Chaque publication demande une confirmation.
      </p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-muted">URL de l’image (https, JPG/PNG)</span>
            <input className="input" placeholder="https://…/image.jpg" value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-muted">Légende</span>
            <textarea className="input min-h-[90px]" placeholder="Légende…" value={caption} maxLength={2200} onChange={(e) => setCaption(e.target.value)} />
          </label>
        </div>
        <div className="rounded-xl border border-border bg-surface2/40 p-3">
          <p className="text-[10px] font-medium uppercase tracking-wide text-faint">Aperçu</p>
          {validUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={imageUrl.trim()} alt="" className="mt-2 aspect-square w-full rounded-lg object-cover" />
          ) : (
            <div className="mt-2 flex aspect-square w-full items-center justify-center rounded-lg text-faint">
              <InstagramLogo />
            </div>
          )}
          <p className="mt-2 text-[11px] text-muted">Compte : {username ? `@${username}` : "—"} · Type : Image</p>
        </div>
      </div>
      {result && <p className={`mt-2 text-sm ${result.tone === "ok" ? "text-emerald-400" : "text-red-400"}`}>{result.text}</p>}
      <div className="mt-3">
        <button type="button" className="btn-primary" disabled={pending || !validUrl} onClick={() => setConfirm(true)}>
          Publier sur Instagram
        </button>
      </div>

      <ActionDialog
        open={confirm}
        title="Publier sur Instagram ?"
        description={`Image publiée en tant que ${username ? `@${username}` : "ce compte"}. Légende : ${caption.trim() ? `« ${caption.trim().slice(0, 120)} »` : "(aucune)"}`}
        confirmLabel="Publier sur Instagram"
        busy={pending}
        onCancel={() => setConfirm(false)}
        onConfirm={submit}
      />
    </OpsCard>
  );
}
