"use client";

import { useMemo, useState } from "react";

function maskCode(code: string): string {
  const parts = code.split("-");
  if (parts.length >= 4) {
    return [parts[0], "••••", ...parts.slice(2)].join("-");
  }
  if (code.length <= 8) return "••••";
  return `${code.slice(0, 5)}••••${code.slice(-4)}`;
}

export default function CopyCode({
  code,
  index,
}: {
  code: string;
  index?: number;
}) {
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState(false);
  const maskedCode = useMemo(() => maskCode(code), [code]);

  async function copy() {
    if (!revealed) return;
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard not available */
    }
  }

  return (
    <div className="rounded-2xl border border-border-strong bg-gradient-to-b from-surface2 to-base p-4 shadow-soft">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-[11px] font-medium uppercase tracking-wide text-faint">
            Code disponible{typeof index === "number" ? ` #${index + 1}` : ""}
          </p>
          <code className="mt-2 flex min-h-[3rem] items-center break-all rounded-xl border border-white/10 bg-black/40 px-4 py-3 font-mono text-[1rem] font-semibold tracking-wider text-white">
            {revealed ? code : maskedCode}
          </code>
        </div>

        <div className="flex shrink-0 gap-2 sm:flex-col">
          {!revealed ? (
            <button
              type="button"
              onClick={() => setRevealed(true)}
              className="btn-ghost h-10 px-4 text-xs"
            >
              Afficher le code
            </button>
          ) : (
            <button
              type="button"
              onClick={copy}
              className="btn-primary h-10 px-4 text-xs"
            >
              {copied ? "Code copié" : "Copier le code"}
            </button>
          )}
        </div>
      </div>

      <div className="mt-3 rounded-xl border border-border bg-surface/70 px-3 py-2 text-xs leading-relaxed text-muted">
        Code sécurisé: affichez-le uniquement lorsque vous êtes prêt à
        l'utiliser. Il reste sauvegardé dans votre historique de commandes.
      </div>
    </div>
  );
}
