import "server-only";

import type { DiscordEmbed } from "@/lib/discord/client";
import { sendExpenseEmbed } from "@/lib/discord/notify";
import { recordNotification } from "@/lib/db/expenses";

/**
 * Send an expense embed AND persist its outcome as an ExpenseNotificationLog
 * row. Never throws: a Discord or logging failure must never roll back or lose
 * the underlying financial record (the caller has already committed it). A
 * `failed` row is recorded so the admin can retry.
 */
export async function postAndLog(params: {
  embed: DiscordEmbed;
  kind: string;
  dedupeKey: string;
  recurringExpenseId?: string | null;
  entryId?: string | null;
  occurrenceDate?: Date | null;
}): Promise<{ ok: boolean; error?: string }> {
  let result: { ok: boolean; disabled?: boolean; messageId?: string; error?: string };
  try {
    result = await sendExpenseEmbed(params.embed);
  } catch (error) {
    result = { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
  try {
    await recordNotification({
      recurringExpenseId: params.recurringExpenseId ?? null,
      expenseEntryId: params.entryId ?? null,
      occurrenceDate: params.occurrenceDate ?? null,
      kind: params.kind,
      status: result.ok ? "sent" : "failed",
      error: result.ok ? null : result.error ?? null,
      discordMessageId: result.messageId ?? null,
      dedupeKey: params.dedupeKey,
    });
  } catch (logError) {
    console.error("[expenses:notify:log]", logError instanceof Error ? logError.message : logError);
  }
  return { ok: result.ok, error: result.error };
}
