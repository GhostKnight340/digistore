"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { trackEvent } from "@/lib/analytics";
import {
  FEEDBACK_TYPES,
  FEEDBACK_LIMITS,
  validateFeedback,
  looksLikeSupportIssue,
  capturePageContext,
  type FeedbackPageContext,
} from "@/lib/feedback";
import { submitFeedbackAction } from "@/app/actions/feedback";

const ACCEPTED = ["image/png", "image/jpeg", "image/webp", "image/jpg"];
const MAX_BYTES = 5 * 1024 * 1024;

type Attachment = { id: string; previewUrl: string; name: string };

export default function FeedbackDialog({
  open,
  onClose,
  customer,
}: {
  open: boolean;
  onClose: () => void;
  customer: { name: string; email: string } | null;
}) {
  const [type, setType] = useState<string>("suggestion");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [contactAllowed, setContactAllowed] = useState(false);
  const [guestName, setGuestName] = useState("");
  const [guestEmail, setGuestEmail] = useState("");
  const [includePage, setIncludePage] = useState(true);
  const [attachment, setAttachment] = useState<Attachment | null>(null);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [context, setContext] = useState<FeedbackPageContext | null>(null);

  const dialogRef = useRef<HTMLDivElement | null>(null);
  const firstFieldRef = useRef<HTMLInputElement | null>(null);
  const triggerReturnRef = useRef<Element | null>(null);

  function reset() {
    setType("suggestion");
    setSubject("");
    setMessage("");
    setContactAllowed(false);
    setGuestName("");
    setGuestEmail("");
    setIncludePage(true);
    setAttachment(null);
    setError(null);
    setSuccess(null);
  }

  // On open: capture context, remember the trigger for focus return, focus first field.
  useEffect(() => {
    if (!open) return;
    triggerReturnRef.current = document.activeElement;
    setContext(capturePageContext());
    const t = setTimeout(() => firstFieldRef.current?.focus(), 40);
    return () => clearTimeout(t);
  }, [open]);

  // Escape + focus trap.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        close();
      }
      if (e.key === "Tab" && dialogRef.current) {
        const focusable = dialogRef.current.querySelectorAll<HTMLElement>(
          'a[href],button:not([disabled]),input:not([disabled]),textarea:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])',
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function close() {
    onClose();
    (triggerReturnRef.current as HTMLElement | null)?.focus?.();
    // Reset after the close transition so a reopened dialog is fresh.
    setTimeout(reset, 200);
  }

  const effectiveEmail = customer?.email ?? guestEmail.trim();
  const showSupportNotice = looksLikeSupportIssue(subject, message);

  async function onFile(file: File | undefined) {
    if (!file) return;
    setError(null);
    if (!ACCEPTED.includes(file.type)) {
      setError("Seules les images PNG, JPG et WebP sont autorisées.");
      return;
    }
    if (file.size > MAX_BYTES) {
      setError("Le fichier dépasse la limite de 5 Mo.");
      return;
    }
    setUploading(true);
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch("/api/feedback/attachment", { method: "POST", body });
      const data = (await res.json()) as { attachmentId?: string; error?: string };
      if (!res.ok || !data.attachmentId) {
        setError(data.error ?? "Import impossible.");
        return;
      }
      setAttachment({
        id: data.attachmentId,
        previewUrl: URL.createObjectURL(file),
        name: file.name,
      });
    } catch {
      setError("Import impossible.");
    } finally {
      setUploading(false);
    }
  }

  async function submit() {
    setError(null);
    const validation = validateFeedback({ type, subject, message, contactAllowed, effectiveEmail });
    if (validation) {
      setError(validation);
      return;
    }
    setSubmitting(true);
    trackEvent("feedback_submit", { feedback_type: type });
    try {
      const res = await submitFeedbackAction({
        type,
        subject,
        message,
        contactAllowed,
        guestName: customer ? undefined : guestName,
        guestEmail: customer ? undefined : guestEmail,
        attachmentId: attachment?.id ?? null,
        context: includePage && context ? context : {},
      });
      if (res.ok && res.reference) {
        trackEvent("feedback_submitted", { feedback_type: type });
        setSuccess(res.reference);
      } else {
        trackEvent("feedback_submit_failed", { reason: res.rateLimited ? "rate_limited" : "invalid" });
        setError(res.error ?? "Envoi impossible. Réessayez.");
      }
    } catch {
      trackEvent("feedback_submit_failed", { reason: "error" });
      setError("Envoi impossible. Réessayez.");
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) return null;

  const subjectLeft = FEEDBACK_LIMITS.subjectMax - subject.length;
  const messageCount = message.trim().length;

  return (
    <div
      className="fixed inset-0 z-[90] flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4"
      role="presentation"
      onClick={() => !submitting && close()}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="feedback-title"
        className="max-h-[100dvh] w-full overflow-y-auto rounded-t-2xl border border-border bg-card p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-card sm:max-w-lg sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {success ? (
          <SuccessView
            reference={success}
            contactAllowed={contactAllowed}
            onClose={close}
            onAnother={() => {
              reset();
              setContext(capturePageContext());
            }}
          />
        ) : (
          <>
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h2 id="feedback-title" className="text-lg font-semibold text-white">
                  Partagez votre avis
                </h2>
                <p className="mt-1 text-sm text-muted">
                  Une idée, une suggestion ou quelque chose à améliorer ? Votre retour nous aide
                  à faire évoluer Ghost.ma.
                </p>
              </div>
              <button
                type="button"
                onClick={close}
                aria-label="Fermer"
                className="shrink-0 rounded-lg p-1 text-faint hover:text-white"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-5 w-5" aria-hidden>
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            <div className="space-y-4">
              {/* Type */}
              <fieldset>
                <legend className="mb-1.5 text-xs font-medium text-muted">Type de retour</legend>
                <div className="grid grid-cols-2 gap-2">
                  {FEEDBACK_TYPES.map((t) => (
                    <button
                      key={t.value}
                      type="button"
                      aria-pressed={type === t.value}
                      onClick={() => {
                        setType(t.value);
                        trackEvent("feedback_type_selected", { feedback_type: t.value });
                      }}
                      className={`rounded-lg border px-3 py-2 text-left text-[13px] font-medium transition ${
                        type === t.value
                          ? "border-accent bg-accent/10 text-white"
                          : "border-border text-muted hover:border-accent/60 hover:text-white"
                      }`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </fieldset>

              {showSupportNotice && (
                <div role="note" className="rounded-lg border border-amber-500/30 bg-amber-500/[0.07] p-3 text-[13px] text-[#f6d9ad]">
                  Pour un problème lié à une commande ou à un paiement, utilisez le support afin
                  d’obtenir une réponse plus rapide.
                  <div className="mt-2">
                    <Link
                      href="/support"
                      onClick={() => trackEvent("feedback_support_redirect", {})}
                      className="btn-ghost h-8 px-3 text-xs"
                    >
                      Contacter le support
                    </Link>
                  </div>
                </div>
              )}

              {/* Subject */}
              <label className="block">
                <span className="mb-1 flex items-center justify-between text-xs font-medium text-muted">
                  Sujet
                  <span className={subjectLeft < 0 ? "text-red-400" : "text-faint"}>{subjectLeft}</span>
                </span>
                <input
                  ref={firstFieldRef}
                  className="input"
                  value={subject}
                  maxLength={FEEDBACK_LIMITS.subjectMax}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="Résumé en quelques mots"
                />
              </label>

              {/* Message (optional) */}
              <label className="block">
                <span className="mb-1 flex items-center justify-between text-xs font-medium text-muted">
                  <span>
                    Message <span className="text-faint">· facultatif</span>
                  </span>
                  <span className="text-faint">
                    {messageCount}/{FEEDBACK_LIMITS.messageMax}
                  </span>
                </span>
                <textarea
                  className="input min-h-[110px]"
                  value={message}
                  maxLength={FEEDBACK_LIMITS.messageMax}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Décrivez votre idée ou ce qui pourrait être amélioré…"
                />
              </label>

              {/* Contact */}
              {customer ? (
                <div className="rounded-lg border border-border bg-surface px-3 py-2.5 text-[13px]">
                  <p className="text-muted">
                    Connecté en tant que <span className="text-white">{customer.name}</span>
                  </p>
                  <p className="text-faint">{customer.email}</p>
                </div>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block">
                    <span className="mb-1 block text-xs font-medium text-muted">
                      Nom <span className="text-faint">· facultatif</span>
                    </span>
                    <input className="input" value={guestName} onChange={(e) => setGuestName(e.target.value)} />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-xs font-medium text-muted">
                      E-mail{" "}
                      <span className="text-faint">{contactAllowed ? "· requis" : "· facultatif"}</span>
                    </span>
                    <input
                      type="email"
                      className="input"
                      value={guestEmail}
                      onChange={(e) => setGuestEmail(e.target.value)}
                      placeholder="vous@exemple.com"
                    />
                  </label>
                </div>
              )}

              <label className="flex items-start gap-2.5 text-[13px] text-muted">
                <input
                  type="checkbox"
                  checked={contactAllowed}
                  onChange={(e) => setContactAllowed(e.target.checked)}
                  className="mt-0.5 h-4 w-4 shrink-0 accent-[#3e7bfa]"
                />
                <span>Vous pouvez me contacter au sujet de ce retour.</span>
              </label>

              {/* Related page */}
              <label className="flex items-center gap-2.5 text-[13px] text-muted">
                <input
                  type="checkbox"
                  checked={includePage}
                  onChange={(e) => setIncludePage(e.target.checked)}
                  className="h-4 w-4 shrink-0 accent-[#3e7bfa]"
                />
                <span>
                  Inclure la page actuelle
                  {includePage && context?.relatedRoute ? (
                    <span className="text-faint"> ({context.relatedRoute})</span>
                  ) : null}
                </span>
              </label>

              {/* Attachment */}
              <div>
                <span className="mb-1 block text-xs font-medium text-muted">
                  Capture d’écran <span className="text-faint">· facultatif</span>
                </span>
                {attachment ? (
                  <div className="flex items-center gap-3 rounded-lg border border-border bg-surface p-2.5">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={attachment.previewUrl} alt="" className="h-12 w-12 rounded object-cover" />
                    <span className="min-w-0 flex-1 truncate text-[13px] text-muted">{attachment.name}</span>
                    <button
                      type="button"
                      onClick={() => setAttachment(null)}
                      className="text-xs text-faint hover:text-white"
                    >
                      Retirer
                    </button>
                  </div>
                ) : (
                  <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-border px-3 py-3 text-[13px] text-muted transition hover:border-accent/60">
                    {uploading ? "Import…" : "Glissez une image ou cliquez pour ajouter"}
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      className="hidden"
                      disabled={uploading}
                      onChange={(e) => onFile(e.target.files?.[0])}
                    />
                  </label>
                )}
              </div>

              {error && (
                <p role="alert" className="text-sm text-red-400">
                  {error}
                </p>
              )}

              <div className="flex justify-end gap-2 pt-1">
                <button type="button" className="btn-ghost" onClick={close} disabled={submitting}>
                  Annuler
                </button>
                <button type="button" className="btn-primary" onClick={submit} disabled={submitting || uploading}>
                  {submitting ? "Envoi…" : "Envoyer"}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function SuccessView({
  reference,
  contactAllowed,
  onClose,
  onAnother,
}: {
  reference: string;
  contactAllowed: boolean;
  onClose: () => void;
  onAnother: () => void;
}) {
  return (
    <div className="py-4 text-center" role="status" aria-live="polite">
      <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-accent-soft text-accent-strong">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} className="h-7 w-7" aria-hidden>
          <path d="M5 12.5l4.5 4.5L19 7" />
        </svg>
      </span>
      <h2 className="mt-4 text-lg font-semibold text-white">Merci pour votre retour.</h2>
      <p className="mt-1 text-sm text-muted">
        Votre avis a bien été envoyé et sera examiné par l’équipe Ghost.ma.
      </p>
      {contactAllowed && (
        <p className="mt-1 text-sm text-muted">
          Nous pourrons vous contacter à l’adresse indiquée si des précisions sont nécessaires.
        </p>
      )}
      <p className="mt-3 font-mono text-xs text-faint">Référence : {reference}</p>
      <div className="mt-5 flex justify-center gap-2">
        <button type="button" className="btn-ghost" onClick={onAnother}>
          Envoyer un autre retour
        </button>
        <button type="button" className="btn-primary" onClick={onClose}>
          Fermer
        </button>
      </div>
    </div>
  );
}
