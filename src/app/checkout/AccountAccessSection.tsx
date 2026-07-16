"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { loginCustomerAction } from "@/app/actions/auth";
import {
  confirmCheckoutCodeAction,
  requestCheckoutCodeAction,
} from "@/app/actions/checkoutAuth";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type AccountValues = {
  name: string;
  email: string;
  password: string;
  confirmPassword: string;
  acceptTerms: boolean;
};

export type AccountGateState = {
  mode: "register" | "login";
  values: AccountValues;
  emailVerified: boolean;
  /** All register fields valid AND email verified — safe to place the order. */
  ready: boolean;
  /** Short French explanation of what remains incomplete, or null when ready. */
  incompleteReason: string | null;
};

// ── Shared verified-email + "Vérifier" block ────────────────────────────────

type VerifyBlockProps = {
  email: string;
  onEmailChange?: (value: string) => void;
  /** Fixed email (logged-in account verification) — the field becomes read-only. */
  fixedEmail?: boolean;
  name?: string;
  verified: boolean;
  onVerifiedChange: (verified: boolean) => void;
  /** Called when the server reports the email already belongs to an account. */
  onAccountExists?: () => void;
};

function EmailVerifyBlock({
  email,
  onEmailChange,
  fixedEmail = false,
  name,
  verified,
  onVerifiedChange,
  onAccountExists,
}: VerifyBlockProps) {
  const [codeSent, setCodeSent] = useState(false);
  const [code, setCode] = useState("");
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [accountExists, setAccountExists] = useState(false);
  const [cooldownUntil, setCooldownUntil] = useState(0);
  const [now, setNow] = useState(() => 0);

  const emailValid = EMAIL_RE.test(email.trim());
  const cooldownLeft = Math.max(0, Math.ceil((cooldownUntil - now) / 1000));

  // Tick once a second only while a cooldown is active.
  useEffect(() => {
    if (cooldownUntil <= Date.now()) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [cooldownUntil]);

  async function sendCode() {
    if (sending || !emailValid || cooldownLeft > 0) return;
    setSending(true);
    setError("");
    setNotice("");
    setAccountExists(false);
    try {
      const result = await requestCheckoutCodeAction({ email: email.trim(), name });
      if (result.status === "sent") {
        setCodeSent(true);
        setCooldownUntil(Date.now() + result.cooldownSec * 1000);
        setNotice("Un code de vérification a été envoyé à votre adresse e-mail.");
      } else if (result.status === "account_exists") {
        setAccountExists(true);
        onAccountExists?.();
      } else if (result.status === "rate_limited") {
        setCooldownUntil(Date.now() + (result.retryAfterSec ?? 60) * 1000);
        setError("Trop de tentatives. Patientez un instant avant de réessayer.");
      } else {
        setError("Veuillez saisir une adresse e-mail valide.");
      }
    } catch {
      setError("L’envoi du code a échoué. Réessayez.");
    } finally {
      setSending(false);
    }
  }

  async function confirmCode() {
    if (verifying || code.length !== 6) return;
    setVerifying(true);
    setError("");
    try {
      const result = await confirmCheckoutCodeAction({ email: email.trim(), code });
      if (result.status === "verified") {
        onVerifiedChange(true);
        setNotice("");
      } else if (result.status === "incorrect") {
        setError(
          result.attemptsLeft != null
            ? `Code incorrect. ${result.attemptsLeft} tentative(s) restante(s).`
            : "Code incorrect.",
        );
      } else if (result.status === "expired") {
        setError("Ce code a expiré. Demandez-en un nouveau.");
      } else if (result.status === "too_many_attempts") {
        setError("Trop de tentatives. Demandez un nouveau code.");
      } else {
        setError("Session expirée. Demandez un nouveau code.");
      }
    } catch {
      setError("La vérification a échoué. Réessayez.");
    } finally {
      setVerifying(false);
    }
  }

  function editEmail(value: string) {
    onEmailChange?.(value);
    // Editing the email immediately revokes the verified state and any sent code.
    if (verified) onVerifiedChange(false);
    setCodeSent(false);
    setCode("");
    setError("");
    setNotice("");
    setAccountExists(false);
  }

  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium text-white">E-mail</label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <div
          className={`flex h-[46px] flex-1 items-center gap-2 rounded-[11px] border bg-[#0B0C10] px-3.5 transition ${
            verified ? "border-[#5BC98C]/50" : "border-white/[0.09]"
          }`}
        >
          <input
            className="h-full flex-1 bg-transparent text-[14.5px] text-text outline-none placeholder:text-faint disabled:opacity-70"
            type="email"
            inputMode="email"
            autoComplete="email"
            value={email}
            disabled={fixedEmail || verified}
            onChange={(e) => editEmail(e.target.value)}
            placeholder="vous@example.com"
            aria-label="Adresse e-mail"
          />
          {verified && (
            <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-[#5BC98C]/30 bg-[#5BC98C]/12 px-2 py-0.5 text-[11px] font-medium text-[#5BC98C]">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.6} className="h-3 w-3" aria-hidden>
                <polyline points="20 6 9 17 4 12" />
              </svg>
              E-mail vérifié
            </span>
          )}
        </div>
        {!verified &&
          (codeSent ? (
            <button
              type="button"
              onClick={sendCode}
              disabled={sending || cooldownLeft > 0}
              className="btn-ghost h-[46px] shrink-0 px-4 text-[13px] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {cooldownLeft > 0 ? `Renvoyer (${cooldownLeft}s)` : sending ? "Envoi…" : "Renvoyer"}
            </button>
          ) : (
            <button
              type="button"
              onClick={sendCode}
              disabled={sending || !emailValid || cooldownLeft > 0}
              className="btn-primary h-[46px] shrink-0 px-5 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {sending ? "Envoi…" : "Vérifier"}
            </button>
          ))}
      </div>

      {!verified && (
        <p className="mt-2 flex items-start gap-1.5 text-[11.5px] text-[#E8A838]">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden>
            <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
            <path d="M12 9v4M12 17h.01" />
          </svg>
          <span>
            Utilisez une adresse e-mail valide. Elle sera utilisée pour confirmer votre commande,
            recevoir votre code et récupérer votre compte.
          </span>
        </p>
      )}

      {accountExists && (
        <div className="mt-2.5 flex flex-wrap items-center gap-2.5 rounded-[11px] border border-accent/[0.2] bg-accent/[0.07] px-3.5 py-2.5 text-[12.5px] text-[#9FB8FF]">
          <span>Un compte peut déjà être associé à cette adresse. Connectez-vous pour continuer.</span>
          <Link href="/forgot-password" className="underline hover:text-white">
            Mot de passe oublié ?
          </Link>
        </div>
      )}

      {codeSent && !verified && (
        <div className="mt-3 rounded-[13px] border border-white/[0.08] bg-[#0B0C10] p-3.5">
          <p className="text-[12.5px] text-muted">
            Un code de vérification a été envoyé à{" "}
            <span className="font-medium text-white">{email.trim()}</span>. Saisissez-le ci-dessous.
          </p>
          <div className="mt-2.5 flex flex-col gap-2 sm:flex-row">
            <input
              className="input flex-1 text-center font-mono text-[18px] tracking-[0.3em]"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  confirmCode();
                }
              }}
              placeholder="••••••"
              aria-label="Code de vérification"
            />
            <button
              type="button"
              onClick={confirmCode}
              disabled={verifying || code.length !== 6}
              className="btn-primary h-[46px] shrink-0 px-5 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {verifying ? "Vérification…" : "Confirmer le code"}
            </button>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11.5px] text-faint">
            <button
              type="button"
              onClick={sendCode}
              disabled={sending || cooldownLeft > 0}
              className="text-[#9FB8FF] hover:text-white disabled:opacity-50"
            >
              {cooldownLeft > 0 ? `Renvoyer le code (${cooldownLeft}s)` : "Renvoyer le code"}
            </button>
            {!fixedEmail && (
              <button type="button" onClick={() => editEmail("")} className="hover:text-white">
                Changer d’adresse e-mail
              </button>
            )}
          </div>
        </div>
      )}

      {notice && !error && !codeSent && (
        <p className="mt-2 text-[12px] text-[#5BC98C]">{notice}</p>
      )}
      {error && (
        <p role="alert" className="mt-2 text-[12px] text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}

// ── Controlled password input with show/hide ────────────────────────────────

function PasswordInput({
  value,
  onChange,
  placeholder,
  autoComplete,
  ariaLabel,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  autoComplete?: string;
  ariaLabel: string;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <input
        className="input pr-12"
        type={visible ? "text" : "password"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
        aria-label={ariaLabel}
      />
      <button
        type="button"
        aria-label={visible ? "Masquer le mot de passe" : "Afficher le mot de passe"}
        title={visible ? "Masquer le mot de passe" : "Afficher le mot de passe"}
        onClick={() => setVisible((v) => !v)}
        className="absolute right-2 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-lg text-muted transition hover:bg-surface2 hover:text-white"
      >
        {visible ? (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="h-5 w-5" aria-hidden>
            <path d="m3 3 18 18" />
            <path d="M10.58 10.58A2.75 2.75 0 0 0 12 14.75c.73 0 1.43-.29 1.94-.81" />
            <path d="M8.17 5.95A10.9 10.9 0 0 1 12 5.75C18.25 5.75 21.75 12 21.75 12a18.3 18.3 0 0 1-3.37 4.11" />
            <path d="M15.5 18.02a10.3 10.3 0 0 1-3.5.23C5.75 18.25 2.25 12 2.25 12a18.8 18.8 0 0 1 4.5-4.87" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="h-5 w-5" aria-hidden>
            <path d="M2.25 12s3.5-6.25 9.75-6.25S21.75 12 21.75 12 18.25 18.25 12 18.25 2.25 12 2.25 12Z" />
            <circle cx="12" cy="12" r="2.75" />
          </svg>
        )}
      </button>
    </div>
  );
}

function Requirement({ met, label }: { met: boolean; label: string }) {
  return (
    <span className={`inline-flex items-center gap-1 text-[11.5px] ${met ? "text-[#5BC98C]" : "text-faint"}`}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} className="h-3 w-3" aria-hidden>
        {met ? <polyline points="20 6 9 17 4 12" /> : <circle cx="12" cy="12" r="9" />}
      </svg>
      {label}
    </span>
  );
}

// ── Inline login sub-form ───────────────────────────────────────────────────

function InlineLogin({ presetEmail, onAuthenticated }: { presetEmail: string; onAuthenticated: () => void }) {
  const [email, setEmail] = useState(presetEmail);
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    setError("");
    try {
      const result = await loginCustomerAction({ email, password, remember });
      if (!result.ok) {
        setError(result.error || "E-mail ou mot de passe incorrect.");
        return;
      }
      onAuthenticated();
    } catch {
      setError("Une erreur est survenue. Veuillez réessayer.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} className="grid gap-3.5">
      <div>
        <label className="mb-1.5 block text-sm font-medium text-white">E-mail</label>
        <input
          className="input"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="vous@example.com"
        />
      </div>
      <div>
        <label className="mb-1.5 block text-sm font-medium text-white">Mot de passe</label>
        <PasswordInput
          value={password}
          onChange={setPassword}
          autoComplete="current-password"
          ariaLabel="Mot de passe"
        />
      </div>
      <div className="flex items-center justify-between text-[12.5px]">
        <label className="flex items-center gap-2 text-muted">
          <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
          Se souvenir de moi
        </label>
        <Link href="/forgot-password" className="text-accent hover:text-accent-hover">
          Mot de passe oublié ?
        </Link>
      </div>
      {error && <p className="rounded-lg bg-red-500/10 px-3 py-2 text-[13px] text-red-400">{error}</p>}
      <button
        type="submit"
        disabled={loading}
        className="btn-primary h-[46px] w-full disabled:cursor-not-allowed disabled:opacity-60"
      >
        {loading ? "Connexion…" : "Se connecter"}
      </button>
      <div className="grid gap-2.5 sm:grid-cols-2">
        <Link
          href="/auth/google?mode=login"
          className="flex h-11 items-center justify-center gap-2 rounded-xl border border-border-strong bg-surface2 px-3 text-[13px] font-semibold text-text transition hover:border-accent/50"
        >
          Google
        </Link>
        <Link
          href="/auth/discord?mode=login"
          className="flex h-11 items-center justify-center gap-2 rounded-xl border border-border-strong bg-surface2 px-3 text-[13px] font-semibold text-text transition hover:border-[#5865F2]/60"
        >
          Discord
        </Link>
      </div>
    </form>
  );
}

// ── Main account-access section (not logged in) ─────────────────────────────

export function AccountAccessSection({ onChange }: { onChange: (state: AccountGateState) => void }) {
  const router = useRouter();
  const [mode, setMode] = useState<"register" | "login">("register");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [emailVerified, setEmailVerified] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [acceptTerms, setAcceptTerms] = useState(false);

  const pwdLongEnough = password.length >= 8;
  const pwdLetterDigit = /[A-Za-z]/.test(password) && /[0-9]/.test(password);
  const pwdValid = pwdLongEnough && pwdLetterDigit;
  const confirmMatches = confirmPassword.length > 0 && confirmPassword === password;
  const nameValid = name.trim().length >= 2;
  const emailValid = EMAIL_RE.test(email.trim());

  const incompleteReason = useMemo(() => {
    if (!nameValid) return "Ajoutez votre nom complet.";
    if (!emailValid) return "Saisissez une adresse e-mail valide.";
    if (!emailVerified) return "Vérifiez votre adresse e-mail pour continuer vers le paiement.";
    if (!pwdValid) return "Choisissez un mot de passe valide.";
    if (!confirmMatches) return "Confirmez votre mot de passe.";
    if (!acceptTerms) return "Acceptez les conditions générales.";
    return null;
  }, [nameValid, emailValid, emailVerified, pwdValid, confirmMatches, acceptTerms]);

  const ready = mode === "register" && incompleteReason === null;

  // Report state upward whenever anything changes.
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  useEffect(() => {
    onChangeRef.current({
      mode,
      values: { name: name.trim(), email: email.trim(), password, confirmPassword, acceptTerms },
      emailVerified,
      ready,
      incompleteReason: mode === "register" ? incompleteReason : "Connectez-vous pour continuer.",
    });
  }, [mode, name, email, password, confirmPassword, acceptTerms, emailVerified, ready, incompleteReason]);

  const handleAuthenticated = useCallback(() => {
    router.refresh();
  }, [router]);

  return (
    <section className="overflow-hidden rounded-2xl border border-white/[0.07] bg-[#0F1015]">
      <div className="border-b border-white/[0.06] px-[18px] py-[18px] sm:px-[22px]">
        <h2 className="text-base font-semibold text-white">Vos informations</h2>
        <p className="mt-1.5 text-[13px] leading-relaxed text-muted">
          Créez votre compte pour sécuriser votre commande, suivre son avancement et recevoir votre
          code numérique.
        </p>
      </div>

      <div className="px-[18px] py-5 sm:px-[22px]">
        <div className="mb-5 grid grid-cols-2 gap-1 rounded-xl border border-white/[0.07] bg-[#0B0C10] p-1">
          {(["register", "login"] as const).map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setMode(item)}
              className={`rounded-lg py-2 text-[13.5px] font-semibold transition ${
                mode === item ? "bg-accent text-white" : "text-muted hover:text-white"
              }`}
            >
              {item === "register" ? "Créer un compte" : "Se connecter"}
            </button>
          ))}
        </div>

        {mode === "login" ? (
          <>
            <p className="mb-4 text-[13px] text-muted">
              Vous avez déjà un compte ? Se connecter — votre panier et votre sélection sont
              conservés.
            </p>
            <InlineLogin presetEmail={email.trim()} onAuthenticated={handleAuthenticated} />
          </>
        ) : (
          <div className="grid gap-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-white">Nom complet</label>
              <input
                className="input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Youssef El Amrani"
                autoComplete="name"
              />
            </div>

            <EmailVerifyBlock
              email={email}
              onEmailChange={setEmail}
              name={name}
              verified={emailVerified}
              onVerifiedChange={setEmailVerified}
              onAccountExists={() => setMode("login")}
            />

            <div>
              <label className="mb-1.5 block text-sm font-medium text-white">Mot de passe</label>
              <PasswordInput
                value={password}
                onChange={setPassword}
                placeholder="Minimum 8 caractères"
                autoComplete="new-password"
                ariaLabel="Mot de passe"
              />
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
                <Requirement met={pwdLongEnough} label="Au moins 8 caractères" />
                <Requirement met={pwdLetterDigit} label="Une lettre et un chiffre" />
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-white">
                Confirmer le mot de passe
              </label>
              <PasswordInput
                value={confirmPassword}
                onChange={setConfirmPassword}
                autoComplete="new-password"
                ariaLabel="Confirmer le mot de passe"
              />
              {confirmPassword.length > 0 && !confirmMatches && (
                <p className="mt-1.5 text-[11.5px] text-red-400">
                  Les mots de passe ne correspondent pas.
                </p>
              )}
            </div>

            <label className="flex items-start gap-2.5 text-[12.5px] leading-relaxed text-muted">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={acceptTerms}
                onChange={(e) => setAcceptTerms(e.target.checked)}
              />
              <span>
                Je confirme avoir 16 ans ou plus et j’accepte les{" "}
                <Link href="/conditions" className="text-accent hover:text-accent-hover">
                  conditions générales
                </Link>{" "}
                et l’
                <Link href="/privacy" className="text-accent hover:text-accent-hover">
                  avis de confidentialité
                </Link>
                .
              </span>
            </label>
          </div>
        )}
      </div>
    </section>
  );
}

// ── Logged-in but unverified: require verification before payment ───────────

export function AccountVerifyPanel({ email, name }: { email: string; name: string }) {
  const router = useRouter();
  const [verified, setVerified] = useState(false);

  useEffect(() => {
    // Once verified, refresh so the server re-renders checkout without the gate.
    if (verified) router.refresh();
  }, [verified, router]);

  return (
    <section className="overflow-hidden rounded-2xl border border-[#E8A838]/25 bg-[#E8A838]/[0.05]">
      <div className="border-b border-[#E8A838]/20 px-[18px] py-[18px] sm:px-[22px]">
        <h2 className="text-base font-semibold text-white">Vérifiez votre adresse e-mail</h2>
        <p className="mt-1.5 text-[13px] leading-relaxed text-muted">
          Votre compte n’est pas encore vérifié. Confirmez votre e-mail pour continuer vers le
          paiement.
        </p>
      </div>
      <div className="px-[18px] py-5 sm:px-[22px]">
        <EmailVerifyBlock
          email={email}
          fixedEmail
          name={name}
          verified={verified}
          onVerifiedChange={setVerified}
        />
      </div>
    </section>
  );
}
