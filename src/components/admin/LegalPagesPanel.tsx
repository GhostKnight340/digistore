"use client";

import { useState } from "react";
import { useStoreSettings } from "@/context/StoreSettingsContext";

const labels: Record<string, string> = {
  terms: "Conditions Générales de Vente",
  privacy: "Politique de Confidentialité",
  refunds: "Politique de Remboursement",
  legal: "Mentions légales",
  support: "Contact & Support",
};

export default function LegalPagesPanel() {
  const { settings, saveSettings } = useStoreSettings();
  const keys = Object.keys(settings.legalPages);
  const [active, setActive] = useState(keys[0] ?? "terms");
  const [draft, setDraft] = useState(settings.legalPages);
  const [message, setMessage] = useState("");
  const page = draft[active];

  async function save() {
    const result = await saveSettings({ ...settings, legalPages: draft });
    setMessage(result.ok ? "Pages légales enregistrées." : result.error ?? "Enregistrement impossible.");
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
            <h2 className="text-xl font-bold text-white">Pages légales</h2>
            <p className="text-xs text-muted">Utilisez des placeholders pour les champs d'identité entreprise.</p>
          </div>
          <button type="button" onClick={save} className="btn-primary h-10 px-4 text-xs">
            Enregistrer
          </button>
          {message ? <p className="w-full text-xs text-muted">{message}</p> : null}
        </div>

        <section className="card p-5">
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Titre" value={page.title} onChange={(value) => update(active, "title", value)} />
            <Field label="Slug" value={page.slug} onChange={(value) => update(active, "slug", value)} />
            <Field label="SEO title" value={page.seoTitle} onChange={(value) => update(active, "seoTitle", value)} />
            <Field label="SEO description" value={page.seoDescription} onChange={(value) => update(active, "seoDescription", value)} />
          </div>
          <label className="mt-4 block">
            <span className="mb-2 block text-sm font-medium text-white">Contenu</span>
            <textarea
              value={page.content}
              onChange={(event) => update(active, "content", event.target.value)}
              rows={16}
              className="input min-h-96 py-3 text-sm"
            />
          </label>
        </section>
      </div>
    </section>
  );

  function update(
    key: string,
    field: keyof typeof page,
    value: string,
  ) {
    setDraft((current) => ({
      ...current,
      [key]: { ...current[key], [field]: value },
    }));
  }
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-medium text-white">{label}</span>
      <input value={value} onChange={(event) => onChange(event.target.value)} className="input" />
    </label>
  );
}
