"use client";

import { useEffect, useMemo, useState } from "react";
import { useStoreSettings } from "@/context/StoreSettingsContext";
import { getEmailDiagnosticsAction, sendTestEmailAction } from "@/app/actions/admin";
import type { EmailDiagnostics } from "@/lib/email/config";
import type { EmailTemplateKey } from "@/lib/emailTemplates";

const labels: Record<string, string> = {
  welcome: "Welcome",
  email_confirmation: "Email confirmation",
  password_reset: "Password reset",
  order_received: "Order received",
  awaiting_payment: "Awaiting payment",
  proof_received: "Proof received",
  new_proof_requested: "New proof requested",
  payment_rejected: "Payment rejected",
  payment_confirmed: "Payment confirmed",
  order_delivered: "Order delivered",
  refund_update: "Refund update",
};

const sample: Record<string, string> = {
  customer_name: "Amine",
  order_number: "#000128",
  order_url: "https://ghost.ma/order/example",
  payment_url: "https://ghost.ma/payment/example",
  delivery_url: "https://ghost.ma/delivery/example",
  total: "250 MAD",
  reason: "Justificatif illisible",
  support_email: "support@ghost.ma",
  support_whatsapp: "+212 600 000 000",
  codes: "AAAA-BBBB-CCCC",
};

function renderTemplate(value: string) {
  return value.replace(/\{\{([a-z_]+)\}\}/g, (_, key: string) => sample[key] ?? `{{${key}}}`);
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
  const [diagnostics, setDiagnostics] = useState<EmailDiagnostics | null>(null);

  useEffect(() => {
    getEmailDiagnosticsAction()
      .then(setDiagnostics)
      .catch(() => setDiagnostics(null));
  }, []);
  const template = draft[active];
  const preview = useMemo(
    () => ({
      subject: renderTemplate(template.subject),
      body: renderTemplate(template.body),
    }),
    [template],
  );

  async function save() {
    const result = await saveSettings({ ...settings, emailTemplates: draft });
    setMessage(result.ok ? "Templates enregistrés." : result.error ?? "Enregistrement impossible.");
  }

  async function sendTest() {
    const result = await sendTestEmailAction(testRecipient, active as EmailTemplateKey);
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
            {labels[key] ?? key}
          </button>
        ))}
      </aside>

      <div className="space-y-5">
        <div className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-base/95 p-4 backdrop-blur">
          <div>
            <h2 className="text-xl font-bold text-white">Templates email</h2>
            <p className="text-xs text-muted">Variables: {Object.keys(sample).map((key) => `{{${key}}}`).join(" ")}</p>
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
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-white">Diagnostic Resend</h3>
            <span className="text-xs text-muted">
              Environnement : {diagnostics?.environment ?? "…"}
            </span>
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <DiagnosticRow
              label="Clé API Resend configurée"
              ok={diagnostics?.resendKeyConfigured}
            />
            <DiagnosticRow
              label="Emails réels activés"
              ok={diagnostics?.realEmailsEnabled}
            />
            <DiagnosticRow
              label="Adresse d'envoi configurée"
              ok={diagnostics?.fromAddressConfigured}
              detail={diagnostics?.fromAddress}
            />
            <DiagnosticRow
              label="Reply-to configuré"
              ok={diagnostics?.replyToConfigured}
              detail={diagnostics?.replyToAddress}
            />
          </div>
          <p className="mt-3 text-xs text-muted">
            La valeur de la clé n'est jamais affichée. Si la clé est absente en
            production, ajoutez RESEND_API_KEY au projet Vercel (scope
            Production) puis redéployez.
          </p>
        </section>

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
          <h3 className="mt-2 text-lg font-semibold text-white">{preview.subject}</h3>
          <pre className="mt-4 whitespace-pre-wrap rounded-xl border border-border bg-surface p-4 text-sm leading-relaxed text-muted">
            {preview.body}
          </pre>
        </section>
      </div>
    </section>
  );
}

function DiagnosticRow({
  label,
  ok,
  detail,
}: {
  label: string;
  ok?: boolean;
  detail?: string;
}) {
  const state = ok === undefined ? "…" : ok ? "Oui" : "Non";
  const tone =
    ok === undefined
      ? "border-border text-muted"
      : ok
        ? "border-green-500/30 text-green-400"
        : "border-red-500/30 text-red-400";
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-surface px-3 py-2">
      <div className="min-w-0">
        <p className="text-xs text-white">{label}</p>
        {detail ? <p className="truncate text-[11px] text-muted">{detail}</p> : null}
      </div>
      <span className={`chip shrink-0 ${tone}`}>{state}</span>
    </div>
  );
}
