"use client";

/**
 * Per-conversation AI assistance (Phase D) — mounted in the manual support
 * inbox. The agent can ask the assistant to draft/summarize/detect/retrieve
 * policy/rewrite/translate/suggest a next action for THIS ticket. Results are
 * shown to the agent and can be inserted into the reply composer — nothing is
 * ever sent automatically. Works even when AI Support Coverage is inactive.
 */

import { useState, useTransition } from "react";
import { assistConversationAction } from "@/app/actions/aiSupport";

const TOOLS: { key: string; label: string; needsDraft?: boolean; needsLang?: boolean }[] = [
  { key: "draft_reply", label: "Brouillon de réponse" },
  { key: "summarize", label: "Résumer" },
  { key: "detect_issue", label: "Détecter le problème" },
  { key: "retrieve_policy", label: "Politique liée" },
  { key: "rewrite", label: "Reformuler", needsDraft: true },
  { key: "translate", label: "Traduire", needsDraft: true, needsLang: true },
  { key: "suggest_next_action", label: "Action suivante" },
];

const LANGS = [
  { code: "en", label: "EN" },
  { code: "fr", label: "FR" },
  { code: "ar", label: "AR" },
];

export default function ConversationAssistant({
  ticketId,
  draft,
  onInsert,
}: {
  ticketId: string;
  draft: string;
  onInsert: (text: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lang, setLang] = useState("en");
  const [agentContext, setAgentContext] = useState("");
  const [busyTool, setBusyTool] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const run = (tool: { key: string; needsDraft?: boolean }) => {
    setError(null);
    if (tool.needsDraft && !draft.trim()) {
      setError("Écrivez d'abord un brouillon dans la zone de réponse.");
      return;
    }
    setBusyTool(tool.key);
    start(async () => {
      const res = await assistConversationAction({
        ticketId,
        tool: tool.key,
        text: draft,
        targetLanguage: lang,
        agentContext: agentContext.trim() || undefined,
      });
      if (res.ok) {
        setResult(res.text);
        setNote(res.note ?? null);
      } else {
        setError(res.error);
        setResult(null);
        setNote(null);
      }
      setBusyTool(null);
    });
  };

  return (
    <div className="mt-3 rounded-lg border border-border/60 bg-surface2/30 p-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between text-xs font-medium text-faint hover:text-white"
      >
        <span>✦ Assistant IA (aide, ne s&apos;envoie jamais seul)</span>
        <span>{open ? "−" : "+"}</span>
      </button>

      {open && (
        <div className="mt-3 flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-1.5">
            {TOOLS.map((t) => (
              <button
                key={t.key}
                type="button"
                disabled={pending}
                onClick={() => run(t)}
                className="rounded-md border border-border bg-canvas px-2 py-1 text-[11px] text-white hover:border-accent disabled:opacity-50"
              >
                {busyTool === t.key ? "…" : t.label}
              </button>
            ))}
            <select
              value={lang}
              onChange={(e) => setLang(e.target.value)}
              className="rounded-md border border-border bg-canvas px-1.5 py-1 text-[11px] text-white"
              title="Langue de traduction"
            >
              {LANGS.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
            </select>
          </div>

          {/* Optional agent context — for Darija/unclear messages, explain in English. */}
          <textarea
            value={agentContext}
            onChange={(e) => setAgentContext(e.target.value)}
            rows={2}
            maxLength={2000}
            placeholder="Contexte pour l'IA (optionnel) — ex. traduction en anglais si le client a écrit en darija, ou précision sur sa demande."
            className="w-full rounded-md border border-border bg-canvas px-2 py-1.5 text-[12px] text-white placeholder:text-faint"
          />

          {error && <p className="text-[11px] text-red-400">{error}</p>}

          {result && (
            <div className="rounded-md border border-border bg-canvas p-2">
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-faint">Brouillon de réponse (client)</p>
              <pre className="max-h-48 overflow-auto whitespace-pre-wrap text-[13px] leading-relaxed text-white">{result}</pre>
              <div className="mt-2 flex gap-2">
                <button type="button" onClick={() => onInsert(result)} className="btn-ghost py-1 text-[11px]">
                  Insérer dans la réponse
                </button>
                <button type="button" onClick={() => { setResult(null); setNote(null); }} className="btn-ghost py-1 text-[11px]">
                  Effacer
                </button>
              </div>
            </div>
          )}

          {/* Agent-facing note — what's wrong / what to do. NEVER inserted / sent. */}
          {note && (
            <div className="rounded-md border border-amber-500/25 bg-amber-500/[0.07] p-2">
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-amber-300/80">Pour vous · ce qui se passe / à faire</p>
              <pre className="max-h-40 overflow-auto whitespace-pre-wrap text-[13px] leading-relaxed text-white/90">{note}</pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
