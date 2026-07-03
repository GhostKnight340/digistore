"use client";

import { useEffect, useMemo, useState } from "react";
import { useStoreSettings } from "@/context/StoreSettingsContext";
import { previewEmailTemplateAction, sendTestEmailAction } from "@/app/actions/admin";
import type { EmailTemplateKey, RenderedEmailTemplate } from "@/lib/emailTemplates";
import { EMAIL_TEMPLATE_VARIABLE_KEYS } from "@/lib/emailSampleData";

const labels: Record<string, string> = {
  welcome: "Welcome",
  email_verification: "Email verification",
  email_confirmation: "Email confirmation",
  password_reset: "Password reset",
  password_changed: "Password changed",
  order_received: "Order received",
  awaiting_payment: "Awaiting payment",
  proof_received: "Proof received",
  new_proof_requested: "New proof requested",
  payment_rejected: "Payment rejected",
  payment_confirmed: "Payment confirmed",
  order_delivered: "Order delivered",
  refund_update: "Refund update",
};

const PREVIEW_DEBOUNCE_MS = 350;

export default function EmailTemplatesPanel() {
  const { settings, saveSettings } = useStoreSettings();
  const keys = Object.keys(settings.emailTemplates);
  const [active, setActive] = useState(keys[0] ?? "order_received");
  const [draft, setDraft] = useState(settings.emailTemplates);
  const [message, setMessage] = useState("");
  const [testRecipient, setTestRecipient] = useState(
    process.env.NEXT_PUBLIC_SUPPORT_EMAIL ?? "",
  );
  const [preview, setPreview] = useState<RenderedEmailTemplate | null>(null);
  const [previewLoading, setPreviewLoading] = useState(true);
  const [previewError, setPreviewError] = useState("");

  const template = draft[active];

  // The exact settings the preview and the test email are rendered with:
  // saved store settings (footer, badges, social links, branding) plus the
  // unsaved template drafts being edited here.
  const previewSettings = useMemo(
    () => ({ ...settings, emailTemplates: draft }),
    [settings, draft],
  );

  useEffect(() => {
    let cancelled = false;
    setPreviewLoading(true);
    const timer = setTimeout(async () => {
      const result = await previewEmailTemplateAction(
        active as EmailTemplateKey,
        previewSettings,
      );
      if (cancelled) return;
      setPreviewLoading(false);
      if (result.ok && result.preview) {
        setPreview(result.preview);
        setPreviewError("");
      } else {
        setPreviewError(result.error ?? "Aperçu indisponible.");
      }
    }, PREVIEW_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [active, previewSettings]);

  async function save() {
    const result = await saveSettings({ ...settings, emailTemplates: draft });
    setMessage(result.ok ? "Templates enregistrés." : result.error ?? "Enregistrement impossible.");
  }

  async function sendTest() {
    const result = await sendTestEmailAction(
      testRecipient,
      active as EmailTemplateKey,
      previewSettings,
    );
    setMessage(
      result.ok
        ? "Email test envoyé avec le rendu affiché dans l'aperçu. Consultez EmailLog pour le statut."
        : result.error ?? "Envoi impossible.",
    );
  }

  return (
    <section className="grid gap-5 xl:grid-cols-[260px_1fr]">
      <aside className="card h-fit overflow-hidden">
        {keys.map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => setActive(key)}
            className={`block w-full border-b border-border px-4 py-3 text-left text-sm ${
              active === key ? "bg-accent/10 text-white" : "text-muted hover:bg-surface hover:text-white"
            }`}
          >
            {labels[key] ?? key}
          </button>
        ))}
      </aside>

      <div className="space-y-5">
        <div className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-base/95 p-4 backdrop-blur">
          <div>
            <h2 className="text-xl font-bold text-white">Templates email</h2>
            <p className="text-xs text-muted">
              Variables: {EMAIL_TEMPLATE_VARIABLE_KEYS.map((key) => `{{${key}}}`).join(" ")}
            </p>
          </div>
          <button type="button" onClick={save} className="btn-primary h-10 px-4 text-xs">
            Enregistrer
          </button>
          <div className="flex w-full flex-wrap gap-2">
            <input
              value={testRecipient}
              onChange={(event) => setTestRecipient(event.target.value)}
              className="input h-10 min-w-56 flex-1 py-0 text-xs"
              placeholder="email@exemple.com"
            />
            <button
              type="button"
              onClick={sendTest}
              className="btn-ghost h-10 px-4 text-xs"
            >
              Envoyer un test
            </button>
          </div>
          {message ? <p className="w-full text-xs text-muted">{message}</p> : null}
        </div>

        <section className="card p-5">
          <label className="block">
            <span className="mb-2 block text-sm font-medium text-white">Sujet</span>
            <input
              value={template.subject}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  [active]: { ...current[active], subject: event.target.value },
                }))
              }
              className="input"
            />
          </label>
          <label className="mt-4 block">
            <span className="mb-2 block text-sm font-medium text-white">Corps</span>
            <textarea
              value={template.body}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  [active]: { ...current[active], body: event.target.value },
                }))
              }
              rows={12}
              className="input min-h-72 py-3 font-mono text-sm"
            />
          </label>
        </section>

        <section className="card p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-xs uppercase tracking-wide text-muted">Aperçu</p>
              <p className="mt-1 text-xs text-muted">
                Rendu exact de l&apos;e-mail envoyé au client (données d&apos;exemple).
              </p>
            </div>
            {previewLoading ? <span className="text-xs text-muted">Actualisation...</span> : null}
          </div>
          {previewError ? (
            <p className="mt-4 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400">{previewError}</p>
          ) : null}
          {preview ? (
            <>
              <h3 className="mt-3 text-lg font-semibold text-white">{preview.subject}</h3>
              <iframe
                title="Aperçu de l'e-mail"
                sandbox=""
                srcDoc={preview.html}
                className={`mt-4 h-[720px] w-full rounded-xl border border-border bg-[#080a0f] transition-opacity ${
                  previewLoading ? "opacity-60" : "opacity-100"
                }`}
              />
            </>
          ) : previewLoading ? (
            <p className="mt-4 text-sm text-muted">Chargement de l&apos;aperçu...</p>
          ) : null}
        </section>
      </div>
    </section>
  );
}
