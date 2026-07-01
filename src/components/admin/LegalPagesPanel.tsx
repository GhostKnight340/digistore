"use client";

import { useRef, useState } from "react";
import { useStoreSettings } from "@/context/StoreSettingsContext";
import { renderLegalContent } from "@/lib/legalPages";
import LegalContent from "@/components/legal/LegalContent";

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
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
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
          <div className="mt-4">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
              <span className="block text-sm font-medium text-white">Contenu</span>
              <div className="flex flex-wrap gap-2">
                <FormatButton label="H2" onClick={() => wrapSelection("## ", "")} />
                <FormatButton label="H3" onClick={() => wrapSelection("### ", "")} />
                <FormatButton label="B" onClick={() => wrapSelection("**", "**", "texte en gras")} />
                <FormatButton label="I" onClick={() => wrapSelection("*", "*", "texte en italique")} />
                <FormatButton label="U" onClick={() => wrapSelection("<u>", "</u>", "texte soulignÃ©")} />
                <FormatButton label="â€¢ Liste" onClick={() => insertBlock("- Ã‰lÃ©ment de liste")} />
                <FormatButton label="1. Liste" onClick={() => insertBlock("1. Premier Ã©lÃ©ment")} />
                <FormatButton label="Lien" onClick={() => wrapSelection("[", "](https://example.com)", "texte du lien")} />
                <FormatButton label="SÃ©parateur" onClick={() => insertBlock("---")} />
              </div>
            </div>
            <textarea
              ref={textareaRef}
              value={page.content}
              onChange={(event) => update(active, "content", event.target.value)}
              rows={18}
              className="input min-h-[30rem] py-3 font-mono text-sm leading-6"
              placeholder={[
                "## Titre de section",
                "",
                "Texte avec **gras**, *italique*, <u>soulignÃ©</u> et [lien](https://ghost.ma).",
                "",
                "- Ã‰lÃ©ment de liste",
                "- Autre Ã©lÃ©ment",
                "",
                "---",
              ].join("\n")}
            />
            <p className="mt-2 text-xs text-muted">
              Format pris en charge : titres Markdown, gras, italique, soulignÃ©, listes, liens et sÃ©parateurs.
            </p>
          </div>
        </section>

        <section className="card p-5">
          <div className="mb-5 border-b border-border pb-4">
            <h3 className="text-lg font-bold text-white">AperÃ§u public</h3>
            <p className="mt-1 text-xs text-muted">
              Le rendu ci-dessous utilise la mÃªme mise en forme que les pages publiques.
            </p>
          </div>
          <div className="max-h-[42rem] overflow-y-auto pr-2">
            <LegalContent content={renderLegalContent(page.content, settings)} />
          </div>
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

  function replaceContent(value: string, cursorPosition?: number) {
    update(active, "content", value);
    window.requestAnimationFrame(() => {
      textareaRef.current?.focus();
      if (cursorPosition != null) {
        textareaRef.current?.setSelectionRange(cursorPosition, cursorPosition);
      }
    });
  }

  function wrapSelection(prefix: string, suffix: string, fallback = "texte") {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selected = page.content.slice(start, end) || fallback;
    const replacement = `${prefix}${selected}${suffix}`;
    replaceContent(
      `${page.content.slice(0, start)}${replacement}${page.content.slice(end)}`,
      start + replacement.length,
    );
  }

  function insertBlock(markdown: string) {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const start = textarea.selectionStart;
    const before = page.content.slice(0, start);
    const after = page.content.slice(start);
    const prefix = before.endsWith("\n\n") || before.length === 0 ? "" : before.endsWith("\n") ? "\n" : "\n\n";
    const suffix = after.startsWith("\n") || after.length === 0 ? "" : "\n\n";
    const replacement = `${prefix}${markdown}${suffix}`;
    replaceContent(`${before}${replacement}${after}`, start + replacement.length);
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

function FormatButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-muted transition hover:border-accent/60 hover:text-white"
    >
      {label}
    </button>
  );
}

