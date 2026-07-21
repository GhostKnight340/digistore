"use client";

/**
 * Admin conversation-memory inspector (spec §3). Shows METADATA ONLY — never the
 * stored message content or any secret — and lets an admin clear a conversation
 * by its identity key. Wired to listConversationsAction / clearConversationAction.
 */

import { useState } from "react";
import { OpsCard } from "@/components/admin/operations/shared";
import { clearConversationAction } from "@/app/actions/aiOperations";

export interface ConversationRow {
  key: string;
  guildId: string;
  channelId: string;
  threadId: string | null;
  discordUserId: string;
  module: string;
  messageCount: number;
  hasSummary: boolean;
  activeRange: string | null;
  lastActivityAt: string;
  expiresAt: string;
}

function short(v: string): string {
  return v.length > 12 ? `${v.slice(0, 6)}…${v.slice(-4)}` : v;
}

function fmt(iso: string): string {
  return new Date(iso).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" });
}

export default function AiConversationsView({ conversations }: { conversations: ConversationRow[] }) {
  const [rows, setRows] = useState(conversations);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const clear = async (key: string) => {
    setBusy(key);
    setMessage(null);
    const res = await clearConversationAction(key);
    setBusy(null);
    if (res.ok) {
      setRows((r) => r.filter((x) => x.key !== key));
      setMessage("Conversation effacée.");
    } else {
      setMessage(res.error ?? "Échec.");
    }
  };

  return (
    <OpsCard title={`Conversations en mémoire (${rows.length})`}>
      <p className="mb-3 text-xs text-faint">
        Métadonnées uniquement — le contenu des messages n’est jamais affiché.
      </p>
      {rows.length === 0 ? (
        <p className="text-sm text-faint">Aucune conversation en mémoire.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-faint">
                <th className="py-1 pr-3">Utilisateur</th>
                <th className="py-1 pr-3">Salon / Fil</th>
                <th className="py-1 pr-3">Module</th>
                <th className="py-1 pr-3">Msgs</th>
                <th className="py-1 pr-3">Résumé</th>
                <th className="py-1 pr-3">Période</th>
                <th className="py-1 pr-3">Dernière activité</th>
                <th className="py-1 pr-3">Expire</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.key} className="border-t border-white/5 text-white">
                  <td className="py-1 pr-3 font-mono">{short(c.discordUserId)}</td>
                  <td className="py-1 pr-3 font-mono">
                    {short(c.channelId)}
                    {c.threadId ? ` / ${short(c.threadId)}` : ""}
                  </td>
                  <td className="py-1 pr-3">{c.module}</td>
                  <td className="py-1 pr-3">{c.messageCount}</td>
                  <td className="py-1 pr-3">{c.hasSummary ? "oui" : "—"}</td>
                  <td className="py-1 pr-3">{c.activeRange ?? "—"}</td>
                  <td className="py-1 pr-3">{fmt(c.lastActivityAt)}</td>
                  <td className="py-1 pr-3">{fmt(c.expiresAt)}</td>
                  <td className="py-1">
                    <button
                      type="button"
                      disabled={busy === c.key}
                      onClick={() => clear(c.key)}
                      className="btn-ghost text-xs"
                    >
                      Effacer
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {message && <p className="mt-3 text-xs text-muted">{message}</p>}
    </OpsCard>
  );
}
