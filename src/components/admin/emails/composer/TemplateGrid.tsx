"use client";

import { COMPOSER_TEMPLATES } from "@/lib/email/composerTemplates";

/** 3-column grid of template cards. Selecting one seeds subject/title/modules. */
export default function TemplateGrid({
  value,
  onSelect,
}: {
  value: string;
  onSelect: (key: string) => void;
}) {
  return (
    <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
      {COMPOSER_TEMPLATES.map((t) => {
        const active = t.key === value;
        return (
          <button
            key={t.key}
            type="button"
            onClick={() => onSelect(t.key)}
            aria-pressed={active}
            className={`flex flex-col rounded-xl border p-3 text-left transition ${
              active
                ? "border-accent/70 bg-accent/10 ring-1 ring-accent/30"
                : "border-border bg-surface hover:border-border-strong hover:bg-surface2"
            }`}
          >
            <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-faint">
              {t.category}
            </span>
            <span className="mt-1 text-sm font-medium text-text">{t.label}</span>
            <span className="mt-0.5 text-xs text-muted">{t.purpose}</span>
          </button>
        );
      })}
    </div>
  );
}
