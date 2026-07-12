"use client";

import { useEffect, useState } from "react";
import { useStoreSettings } from "@/context/StoreSettingsContext";
import { previewEmailTemplateAction, sendTestEmailAction } from "@/app/actions/admin";
import {
  EMAIL_TEMPLATE_LABELS,
  EMAIL_TEMPLATE_VARIABLES,
  type EmailTemplateKey,
  type RenderedEmailTemplate,
} from "@/lib/emailTemplates";

export default function EmailTemplatesPanel() {
  const { settings, saveSettings } = useStoreSettings();
  const keys = Object.keys(settings.emailTemplates) as EmailTemplateKey[];
  const [active, setActive] = useState<EmailTemplateKey>(keys[0] ?? "order_received");
  const [draft, setDraft] = useState(settings.emailTemplates);
  const [message, setMessage] = useState("");
  const [testRecipient, setTestRecipient] = useState(
    process.env.NEXT_PUBLIC_SUPPORT_EMAIL ?? "",
  );
  const [preview, setPreview] = useState<RenderedEmailTemplate | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const template = draft[active];
  const variables = EMAIL_TEMPLATE_VARIABLES[active] ?? [];

  useEffect(() => {
    let cancelled = false;
    setPreviewLoading(true);
    const timeout = setTimeout(() => {
      previewEmailTemplateAction(active, template.subject, template.body)
        .then((rendered) => {
          if (!cancelled) setPreview(rendered);
        })
        .finally(() => {
          if (!cancelled) setPreviewLoading(false);
        });
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [active, template.subject, template.body]);

  async function save() {
    const result = await saveSettings({ ...settings, emailTemplates: draft });
    setMessage(result.ok ? "Templates enregistrés." : result.error ?? "Enregistrement impossible.");
  }

  async function sendTest() {
    const result = await sendTestEmailAction(testRecipient, active, template.subject, template.body);
    setMessage(result.ok ? "Email test traité. Consultez EmailLog pour le statut." : result.error ?? "Envoi impossible.");
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
            {EMAIL_TEMPLATE_LABELS[key] ?? key}
          </button>
        ))}
      </aside>

      <div className="space-y-5">
        <div className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-canvas/95 p-4 backdrop-blur">
          <div>
            <h2 className="text-xl font-bold text-white">
              {EMAIL_TEMPLATE_LABELS[active] ?? active}
            </h2>
            <p className="text-xs text-muted">
              Variables disponibles : {variables.map((variable) => `{{${variable.key}}}`).join(" ")}
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
          <p className="text-xs uppercase tracking-wide text-muted">Aperçu</p>
          <h3 className="mt-2 text-lg font-semibold text-white">
            {preview?.subject ?? (previewLoading ? "Chargement…" : "")}
          </h3>
          <div className="mt-4 overflow-hidden rounded-xl border border-border bg-surface">
            {preview ? (
              <iframe
                title="Aperçu de l'email"
                srcDoc={preview.html}
                sandbox=""
                className="h-[720px] w-full bg-white"
              />
            ) : (
              <p className="p-4 text-sm text-muted">Chargement de l&apos;aperçu…</p>
            )}
          </div>
        </section>
      </div>
    </section>
  );
}
