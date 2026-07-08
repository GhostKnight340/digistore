"use client";

import { useEffect, useRef, useState } from "react";
import { useStoreSettings } from "@/context/StoreSettingsContext";
import { renderLegalContent } from "@/lib/legalPages";
import { normalizeLegalHtml, sanitizeLegalHtml } from "@/lib/legalHtml";
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
  const editorRef = useRef<HTMLDivElement | null>(null);
  const page = draft[active];

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    const normalized = normalizeLegalHtml(page.content);
    if (editor.innerHTML !== normalized) editor.innerHTML = normalized;
  }, [active, page.content]);

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
                <FormatButton label="H2" onClick={() => formatBlock("h2")} />
                <FormatButton label="H3" onClick={() => formatBlock("h3")} />
                <FormatButton label="B" onClick={() => format("bold")} />
                <FormatButton label="I" onClick={() => format("italic")} />
                <FormatButton label="U" onClick={() => format("underline")} />
                <FormatButton label="• Liste" onClick={() => format("insertUnorderedList")} />
                <FormatButton label="1. Liste" onClick={() => format("insertOrderedList")} />
                <FormatButton label="Lien" onClick={insertLink} />
                <FormatButton label="Séparateur" onClick={() => insertHtml("<hr>")} />
              </div>
            </div>
            <div
              ref={editorRef}
              contentEditable
              suppressContentEditableWarning
              onInput={syncEditorContent}
              onBlur={syncEditorContent}
              onPaste={handlePaste}
              className="legal-content input min-h-[30rem] max-w-none overflow-y-auto bg-surface py-3 text-sm leading-6 text-text focus:border-accent/70 focus:ring-2 focus:ring-accent/25"
            />
            <p className="mt-2 text-xs text-muted">
              Format pris en charge : titres, gras, italique, souligné, listes imbriquées, liens et séparateurs.
            </p>
          </div>
        </section>

        <section className="card p-5">
          <div className="mb-5 border-b border-border pb-4">
            <h3 className="text-lg font-bold text-white">Aperçu public</h3>
            <p className="mt-1 text-xs text-muted">
              Le rendu ci-dessous utilise la même mise en forme que les pages publiques.
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

  function syncEditorContent() {
    const editor = editorRef.current;
    if (!editor) return;
    update(active, "content", sanitizeLegalHtml(editor.innerHTML));
  }

  function focusEditor() {
    editorRef.current?.focus();
  }

  function format(command: string) {
    focusEditor();
    document.execCommand(command);
    syncEditorContent();
  }

  function formatBlock(tagName: "h2" | "h3") {
    focusEditor();
    document.execCommand("formatBlock", false, tagName);
    syncEditorContent();
  }

  function insertHtml(html: string) {
    focusEditor();
    document.execCommand("insertHTML", false, sanitizeLegalHtml(html));
    syncEditorContent();
  }

  function insertLink() {
    focusEditor();
    const href = window.prompt("URL du lien", "https://example.com");
    if (!href) return;
    document.execCommand("createLink", false, href);
    syncEditorContent();
  }

  function handlePaste(event: React.ClipboardEvent<HTMLDivElement>) {
    event.preventDefault();
    const html = event.clipboardData.getData("text/html");
    const text = event.clipboardData.getData("text/plain");
    insertHtml(normalizeLegalHtml(html || text));
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

