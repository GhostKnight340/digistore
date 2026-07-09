"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { disconnectGoogleAction, setInitialPasswordAction } from "@/app/actions/auth";
import { disconnectDiscordAction } from "@/app/actions/discord";
import PasswordField from "@/components/ui/PasswordField";

export type LoginMethodsProps = {
  googleConnected: boolean;
  discordConnected: boolean;
  discordUsername: string | null;
  hasPassword: boolean;
  /** Real (non-placeholder) email — required before a password can be set. */
  emailUsable: boolean;
  canDisconnectGoogle: boolean;
  canDisconnectDiscord: boolean;
};

const LINK_ERRORS: Record<string, string> = {
  google_already_linked: "Ce compte Google est déjà lié à un autre compte Ghost.ma.",
  discord_already_linked: "Ce compte Discord est déjà lié à un autre compte Ghost.ma.",
  google_account_conflict: "Association impossible. Contactez le support.",
};

export default function LoginMethods(props: LoginMethodsProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [banner, setBanner] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (searchParams.get("google") === "linked") setBanner({ kind: "ok", text: "Compte Google connecté." });
    const err = searchParams.get("error");
    if (err && LINK_ERRORS[err]) setBanner({ kind: "error", text: LINK_ERRORS[err] });
  }, [searchParams]);

  async function run(action: () => Promise<{ ok: boolean; error?: string; message?: string }>) {
    setBusy(true);
    const res = await action();
    setBusy(false);
    setBanner(res.ok ? { kind: "ok", text: res.message || "Mis à jour." } : { kind: "error", text: res.error || "Action impossible." });
    if (res.ok) router.refresh();
  }

  async function submitPassword(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setBusy(true);
    const res = await setInitialPasswordAction({
      password: String(form.get("password") || ""),
      confirmPassword: String(form.get("confirmPassword") || ""),
    });
    setBusy(false);
    if (res.ok) {
      setBanner({ kind: "ok", text: res.message || "Mot de passe défini." });
      setShowPassword(false);
      router.refresh();
    } else {
      setBanner({ kind: "error", text: res.error || "Action impossible." });
    }
  }

  return (
    <div className="card mt-6 p-6">
      <h2 className="text-lg font-bold text-white">Méthodes de connexion</h2>
      <p className="mt-1 text-sm text-muted">Gérez comment vous vous connectez à votre compte.</p>

      {banner && (
        <p className={`mt-4 rounded-lg px-3 py-2 text-sm ${banner.kind === "ok" ? "bg-green-500/10 text-green-400" : "bg-red-500/10 text-red-400"}`}>
          {banner.text}
        </p>
      )}

      <div className="mt-5 divide-y divide-border">
        {/* Google */}
        <Row
          icon={<GoogleIcon />}
          title="Google"
          status={props.googleConnected ? "Connecté" : "Non connecté"}
          connected={props.googleConnected}
        >
          {props.googleConnected ? (
            props.canDisconnectGoogle ? (
              <button type="button" disabled={busy} onClick={() => run(disconnectGoogleAction)} className="text-sm text-muted hover:text-white disabled:opacity-60">
                Déconnecter
              </button>
            ) : null
          ) : (
            <a href="/auth/google?mode=link" className="btn-ghost text-sm">Connecter Google</a>
          )}
        </Row>

        {/* Discord (login link) */}
        <Row
          icon={<DiscordIcon />}
          title="Discord"
          status={props.discordConnected ? `Connecté${props.discordUsername ? ` — @${props.discordUsername}` : ""}` : "Non connecté"}
          connected={props.discordConnected}
        >
          {props.discordConnected ? (
            props.canDisconnectDiscord ? (
              <button type="button" disabled={busy} onClick={() => run(disconnectDiscordAction)} className="text-sm text-muted hover:text-white disabled:opacity-60">
                Déconnecter
              </button>
            ) : null
          ) : (
            <a href="/auth/discord?mode=link" className="btn-ghost text-sm">Connecter Discord</a>
          )}
        </Row>

        {/* Email + password */}
        <Row
          icon={<KeyIcon />}
          title="E-mail et mot de passe"
          status={props.hasPassword ? "Configuré" : "Non configuré"}
          connected={props.hasPassword}
        >
          {props.hasPassword ? (
            <a href="/account/security" className="btn-ghost text-sm">Modifier</a>
          ) : props.emailUsable ? (
            <button type="button" onClick={() => setShowPassword((v) => !v)} className="btn-ghost text-sm">
              Définir un mot de passe
            </button>
          ) : (
            <span className="text-xs text-faint">Ajoutez une adresse e-mail d’abord</span>
          )}
        </Row>
      </div>

      {showPassword && !props.hasPassword && props.emailUsable && (
        <form onSubmit={submitPassword} className="mt-5 space-y-3 rounded-xl border border-border bg-surface p-4">
          <PasswordField name="password" placeholder="Nouveau mot de passe" autoComplete="new-password" />
          <PasswordField name="confirmPassword" placeholder="Confirmer le mot de passe" autoComplete="new-password" />
          <p className="text-xs text-muted">Au moins 8 caractères, avec une lettre et un chiffre.</p>
          <button className="btn-primary text-sm disabled:opacity-60" disabled={busy}>
            {busy ? "Enregistrement..." : "Définir le mot de passe"}
          </button>
        </form>
      )}
    </div>
  );
}

function Row({
  icon,
  title,
  status,
  connected,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  status: string;
  connected: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 py-3.5">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-surface">{icon}</span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-white">{title}</p>
        <p className={`truncate text-xs ${connected ? "text-green-400" : "text-muted"}`}>{status}</p>
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden>
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.24 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.1c-.22-.66-.35-1.36-.35-2.1s.13-1.44.35-2.1V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l3.66-2.84z" />
      <path fill="#EA4335" d="M12 5.37c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06L5.84 9.9C6.71 7.3 9.14 5.37 12 5.37z" />
    </svg>
  );
}

function DiscordIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="#5865F2" aria-hidden>
      <path d="M20.317 4.369a19.79 19.79 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.865-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128c.126-.094.252-.192.372-.291a.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.009c.12.099.246.198.373.292a.077.077 0 0 1-.006.127 12.3 12.3 0 0 1-1.873.891.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.055c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.028zM8.02 15.331c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.211 0 2.176 1.096 2.157 2.42 0 1.333-.955 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.211 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
    </svg>
  );
}

function KeyIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="#9A9FAB" strokeWidth={2} className="h-5 w-5" aria-hidden>
      <path d="M21 2l-2 2m-3.5 3.5a4 4 0 1 1-5.66 5.66L3 19v2h2l5.84-5.84A4 4 0 0 1 15.5 7.5Z" />
    </svg>
  );
}
