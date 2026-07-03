"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useStoreSettings } from "@/context/StoreSettingsContext";
import { sendTestEmailAction } from "@/app/actions/admin";
import type { EmailTemplateKey } from "@/lib/emailTemplates";
import {
  emailPreviewSampleVariables,
  renderEmailPreview,
} from "@/lib/emailPreview";

const labels: Record<string, string> = {
  welcome: "Welcome",
  email_confirmation: "Email confirmation",
  email_verification: "Email verification",
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

const sampleVariableKeys = Object.keys(emailPreviewSampleVariables);

/**
 * Renders the compiled email HTML inside a sandboxed iframe. The iframe is its
 * own document, so it does not inherit the admin dashboard CSS, and the preview
 * matches exactly what a customer sees in their inbox.
 */
function EmailPreviewFrame({ html }: { html: string }) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(720);

  const resize = () => {
    const doc = frameRef.current?.contentDocument;
    if (doc?.body) {
      setHeight(Math.max(doc.documentElement.scrollHeight, doc.body.scrollHeight));
    }
  };

  return (
    <iframe
      ref={frameRef}
      title="Aperçu de l'email"
      srcDoc={html}
      onLoad={resize}
      sandbox="allow-same-origin"
      className="w-full rounded-xl border border-border bg-white"
      style={{ height }}
    />
  );
}

export default function EmailTemplatesPanel() {
  const { settings, saveSettings } = useStoreSettings();
  const keys = Object.keys(settings.emailTemplates);
  const [active, setActive] = useState(keys[0] ?? "order_received");
  const [draft, setDraft] = useState(settings.emailTemplates);
  const [message, setMessage] = useState("");
  const [testRecipient, setTestRecipient] = useState(
    process.env.NEXT_PUBLIC_SUPPORT_EMAIL ?? "",
  );
  const [sending, setSending] = useState(false);

  // Keep the local draft in sync when settings are (re)loaded/saved elsewhere.
  useEffect(() => {
    setDraft(settings.emailTemplates);
  }, [settings.emailTemplates]);

  const template = draft[active];

  // Live preview: full branded email rendered through the SAME renderer used
  // for real outgoing emails, reflecting unsaved subject/body edits instantly.
  const preview = useMemo(() => {
    return renderEmailPreview(settings, active as EmailTemplateKey, template);
  }, [settings, active, template]);

  async function save() {
    const result = await saveSettings({ ...settings, emailTemplates: draft });
    setMessage(result.ok ? "Templates enregistrés." : result.error ?? "Enregistrement impossible.");
  }

  async function sendTest() {
    setSending(true);
    setMessage("");
    // Send the exact edited draft so the test email == the preview above.
    const result = await sendTestEmailAction(testRecipient, active as EmailTemplateKey, {
      subject: template.subject,
      body: template.body,
    });
    setSending(false);
    setMessage(
      result.ok
        ? "Email test traité. Consultez EmailLog pour le statut."
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
            <p className="text-xs text-muted">Variables: {sampleVariableKeys.map((key) => `{{${key}}}`).join(" ")}</p>
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
              disabled={sending}
              className="btn-ghost h-10 px-4 text-xs disabled:opacity-60"
            >
              {sending ? "Envoi..." : "Envoyer un test"}
            </button>
          </div>
          {message ? <p className="w-full text-xs text-muted">{message}</p> : null}
        </div>

        <div className="grid gap-5 2xl:grid-cols-2">
          {/* Editor — kept separate from the rendered preview. */}
          <section className="card p-5">
            <p className="text-xs uppercase tracking-wide text-muted">Éditeur</p>
            <label className="mt-3 block">
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
                rows={16}
                className="input min-h-72 py-3 font-mono text-sm"
              />
            </label>
          </section>

          {/* Final rendered email — exactly what the customer receives. */}
          <section className="card p-5">
            <p className="text-xs uppercase tracking-wide text-muted">Aperçu email</p>
            <p className="mt-2 text-sm text-muted">
              Sujet : <span className="font-semibold text-white">{preview.subject}</span>
            </p>
            <div className="mt-4">
              <EmailPreviewFrame html={preview.html} />
            </div>
          </section>
        </div>
      </div>
    </section>
  );
}
