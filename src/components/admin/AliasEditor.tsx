"use client";

import { useState } from "react";

/**
 * Compact tag input for a record's editable public-search aliases (products,
 * categories). Trims, lowercases, and prevents duplicates on add. The DB layer
 * re-normalizes on write, so this is just a friendly editor — never the source
 * of truth for cleanliness.
 */
export default function AliasEditor({
  aliases,
  onChange,
}: {
  aliases: string[];
  onChange: (next: string[]) => void;
}) {
  const [value, setValue] = useState("");

  function add() {
    const clean = value.trim().toLowerCase();
    if (!clean) return;
    if (!aliases.includes(clean)) onChange([...aliases, clean]);
    setValue("");
  }

  return (
    <div>
      {aliases.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-2">
          {aliases.map((alias) => (
            <span
              key={alias}
              className="inline-flex items-center gap-1 rounded-full border border-border bg-surface px-2.5 py-1 text-xs text-muted"
            >
              {alias}
              <button
                type="button"
                aria-label={`Retirer ${alias}`}
                onClick={() => onChange(aliases.filter((a) => a !== alias))}
                className="text-faint hover:text-white"
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="flex gap-2">
        <input
          className="input"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
          placeholder="ex. psn, carte psn"
        />
        <button type="button" className="btn-ghost" onClick={add}>
          Ajouter
        </button>
      </div>
    </div>
  );
}
