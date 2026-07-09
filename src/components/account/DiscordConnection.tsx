"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  generateDiscordActivationCodeAction,
  checkDiscordActivationAction,
  setDiscordDeliveryPreferenceAction,
  deactivateDiscordDmAction,
  disconnectDiscordAction,
} from "@/app/actions/discord";
import Checkbox from "@/components/ui/Checkbox";

export type DiscordConnectionProps = {
  discordId: string | null;
  discordUsername: string | null;
  discordGlobalName: string | null;
  discordAvatar: string | null;
  discordDmActivated: boolean;
  discordDmUsername: string | null;
  discordDmDisplayName: string | null;
  discordDmAvatar: string | null;
  discordOrderDeliveryEnabled: boolean;
  canDisconnect: boolean;
  /** Discord application id = bot user id; used to open the bot profile/DM. */
  applicationId: string | null;
};

function DiscordGlyph({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="#5865F2" aria-hidden>
      <path d="M20.317 4.369a19.79 19.79 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.865-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128c.126-.094.252-.192.372-.291a.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.009c.12.099.246.198.373.292a.077.077 0 0 1-.006.127 12.3 12.3 0 0 1-1.873.891.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.055c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.028zM8.02 15.331c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.211 0 2.176 1.096 2.157 2.42 0 1.333-.955 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.211 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
    </svg>
  );
}

function Avatar({ url, fallback }: { url: string | null; fallback: string }) {
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt="" className="h-10 w-10 rounded-full object-cover" />;
  }
  return (
    <div className="grid h-10 w-10 place-items-center rounded-full bg-[#5865F2]/20 text-sm font-semibold text-[#9FB8FF]">
      {fallback.slice(0, 1).toUpperCase()}
    </div>
  );
}

export default function DiscordConnection(props: DiscordConnectionProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [banner, setBanner] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [pref, setPref] = useState(props.discordOrderDeliveryEnabled);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (searchParams.get("discord") === "linked") {
      setBanner({ kind: "ok", text: "Compte Discord connecté." });
    }
  }, [searchParams]);

  const connectedName =
    props.discordGlobalName || props.discordUsername || "Compte Discord";
  const dmName =
    props.discordDmDisplayName || props.discordDmUsername || connectedName;

  async function onTogglePref(next: boolean) {
    setPref(next);
    const res = await setDiscordDeliveryPreferenceAction(next);
    if (!res.ok) {
      setPref(!next);
      setBanner({ kind: "error", text: res.error || "Action impossible." });
    }
  }

  async function onDeactivate() {
    setBusy(true);
    const res = await deactivateDiscordDmAction();
    setBusy(false);
    if (res.ok) {
      setBanner({ kind: "ok", text: res.message || "Messages Discord désactivés." });
      router.refresh();
    } else {
      setBanner({ kind: "error", text: res.error || "Action impossible." });
    }
  }

  async function onDisconnect() {
    setBusy(true);
    const res = await disconnectDiscordAction();
    setBusy(false);
    if (res.ok) {
      setBanner({ kind: "ok", text: res.message || "Compte Discord déconnecté." });
      router.refresh();
    } else {
      setBanner({ kind: "error", text: res.error || "Action impossible." });
    }
  }

  return (
    <div className="card mt-6 p-6">
      <div className="flex items-center gap-3">
        <span className="grid h-9 w-9 place-items-center rounded-lg bg-[#5865F2]/15">
          <DiscordGlyph />
        </span>
        <h2 className="text-lg font-bold text-white">Discord</h2>
      </div>

      {banner && (
        <p
          className={`mt-4 rounded-lg px-3 py-2 text-sm ${
            banner.kind === "ok"
              ? "bg-green-500/10 text-green-400"
              : "bg-red-500/10 text-red-400"
          }`}
        >
          {banner.text}
        </p>
      )}

      {/* STATE A — not connected */}
      {!props.discordId && (
        <div className="mt-4">
          <p className="text-sm text-muted">
            Connectez votre compte Discord pour recevoir vos commandes directement en
            message privé.
          </p>
          <a
            href="/auth/discord?mode=link"
            className="btn-primary mt-4 inline-flex items-center gap-2"
          >
            <DiscordGlyph className="h-4 w-4" />
            Connecter Discord
          </a>
        </div>
      )}

      {/* STATE B — connected, DM not activated */}
      {props.discordId && !props.discordDmActivated && (
        <div className="mt-4">
          <div className="flex items-center gap-3 rounded-xl border border-border bg-surface px-4 py-3">
            <Avatar url={props.discordAvatar} fallback={connectedName} />
            <div className="min-w-0">
              <p className="font-medium text-white">Discord connecté</p>
              <p className="truncate text-sm text-muted">{connectedName}</p>
            </div>
          </div>
          <p className="mt-4 text-sm text-muted">
            Pour recevoir vos commandes en message privé, activez les messages Discord en
            envoyant un code unique au bot Ghost.ma.
          </p>
          <button
            type="button"
            onClick={() => setModalOpen(true)}
            className="btn-primary mt-4"
          >
            Activer les messages Discord
          </button>
        </div>
      )}

      {/* STATE C — DM activated */}
      {props.discordId && props.discordDmActivated && (
        <div className="mt-4 space-y-4">
          <div className="flex items-center gap-3 rounded-xl border border-green-500/25 bg-green-500/[0.06] px-4 py-3">
            <Avatar url={props.discordDmAvatar ?? props.discordAvatar} fallback={dmName} />
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-2 font-medium text-white">
                Discord activé
                <span className="inline-flex items-center gap-1 rounded-full border border-green-500/30 bg-green-500/10 px-2 py-0.5 text-[11px] font-semibold text-green-400">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.6} className="h-3 w-3" aria-hidden>
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                  Vérifié
                </span>
              </p>
              <p className="truncate text-sm text-muted">{dmName}</p>
            </div>
          </div>

          <div>
            <Checkbox
              checked={pref}
              onChange={(e) => onTogglePref((e.target as HTMLInputElement).checked)}
              label={<span className="text-text">Recevoir aussi mes commandes par Discord</span>}
            />
            <p className="mt-1 pl-[26px] text-xs text-muted">
              Préférence par défaut pour vos prochaines commandes éligibles.
            </p>
          </div>

          <div className="flex flex-wrap gap-3 pt-1">
            <button
              type="button"
              onClick={onDeactivate}
              disabled={busy}
              className="btn-ghost text-sm disabled:opacity-60"
            >
              Désactiver les messages Discord
            </button>
            {props.canDisconnect ? (
              <button
                type="button"
                onClick={onDisconnect}
                disabled={busy}
                className="text-sm text-muted underline-offset-2 hover:text-white hover:underline disabled:opacity-60"
              >
                Déconnecter Discord
              </button>
            ) : (
              <span className="text-xs text-faint">
                Définissez un mot de passe pour pouvoir déconnecter Discord.
              </span>
            )}
          </div>
        </div>
      )}

      {modalOpen && (
        <ActivationModal
          applicationId={props.applicationId}
          onClose={() => setModalOpen(false)}
          onActivated={() => {
            setModalOpen(false);
            setBanner({ kind: "ok", text: "Discord activé avec succès." });
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

function ActivationModal({
  applicationId,
  onClose,
  onActivated,
}: {
  applicationId: string | null;
  onClose: () => void;
  onActivated: () => void;
}) {
  const [code, setCode] = useState<string | null>(null);
  const [loadError, setLoadError] = useState("");
  const [copied, setCopied] = useState(false);
  const [checking, setChecking] = useState(false);
  const [pending, setPending] = useState("");

  useEffect(() => {
    let active = true;
    generateDiscordActivationCodeAction().then((res) => {
      if (!active) return;
      if (res.ok && res.code) setCode(res.code);
      else setLoadError(res.error || "Impossible de générer le code.");
    });
    return () => {
      active = false;
    };
  }, []);

  async function copyCode() {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  async function confirmSent() {
    setChecking(true);
    setPending("");
    const res = await checkDiscordActivationAction();
    setChecking(false);
    if (res.ok && res.activated) {
      onActivated();
    } else {
      setPending("Code non reçu pour le moment. Envoyez le code au bot puis réessayez.");
    }
  }

  // Bot user id == Discord application id; opens the bot profile where the
  // customer can start/continue a DM. We never claim to send on their behalf.
  const openUrl = applicationId
    ? `https://discord.com/users/${applicationId}`
    : "https://discord.com/channels/@me";

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-border-strong bg-surface2 p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <h3 className="text-lg font-bold text-white">Activer les messages Discord</h3>
          <button
            type="button"
            onClick={onClose}
            className="text-muted hover:text-white"
            aria-label="Fermer"
          >
            ✕
          </button>
        </div>
        <p className="mt-2 text-sm text-muted">
          Copiez ce code puis envoyez-le au bot Ghost.ma sur Discord.
        </p>

        <div className="mt-4 rounded-xl border border-border bg-base px-4 py-5 text-center">
          {loadError ? (
            <p className="text-sm text-red-400">{loadError}</p>
          ) : code ? (
            <p className="font-mono text-2xl font-bold tracking-[0.2em] text-white">{code}</p>
          ) : (
            <p className="text-sm text-muted">Génération…</p>
          )}
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={copyCode}
            disabled={!code}
            className="btn-ghost text-sm disabled:opacity-60"
          >
            {copied ? "Code copié" : "Copier le code"}
          </button>
          <a
            href={openUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-ghost inline-flex items-center justify-center text-sm"
          >
            Ouvrir Discord
          </a>
        </div>

        <button
          type="button"
          onClick={confirmSent}
          disabled={checking || !code}
          className="btn-primary mt-3 w-full disabled:opacity-60"
        >
          {checking ? "Vérification…" : "J’ai envoyé le code"}
        </button>

        {pending && (
          <p className="mt-3 rounded-lg bg-amber-500/10 px-3 py-2 text-sm text-amber-400">
            {pending}
          </p>
        )}
        <p className="mt-3 text-center text-xs text-faint">
          Le code expire après 15 minutes. Envoyer le code au bot n’est pas automatique.
        </p>
      </div>
    </div>
  );
}
