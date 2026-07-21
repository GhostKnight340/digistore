import { createHmac, timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";
import { getDiscordDmWorkerSecret } from "@/lib/discord/config";
import { authorizeDiscordAdmin } from "@/lib/ai-ops/discord/assistantAuth";
import { answerBusinessQuestion } from "@/lib/ai-ops/modules/discordAssistant";
import { listChannelMappings } from "@/lib/ai-ops/discordChannels";
import {
  loadConversation,
  appendTurn,
  resetConversation,
} from "@/lib/ai-ops/discord/conversationStore";
import type { ConversationIdentity } from "@/lib/ai-ops/discord/conversationBuffer";
import { HELP_REPLY, RESET_REPLY } from "@/lib/ai-ops/discord/replyMessages";

/**
 * Internal endpoint called ONLY by the standalone Discord assistant worker after
 * an admin mentions the bot with a business question. Authenticated with the
 * same HMAC-SHA256 scheme as /api/discord/activate (shared worker secret over
 * `${timestamp}.${rawBody}`), so a serverless function never needs a Gateway
 * connection and the worker never needs database access.
 *
 * The web app owns every guardrail: it authorizes the Discord user as an admin,
 * optionally enforces the configured assistant channel, then routes the question
 * through the AI Operations runner (global switch, permissions, budget, logging).
 * It returns only a coarse status plus the already-safe answer text — never a
 * secret, a schema, or a raw tool payload.
 */

const MAX_SKEW_MS = 5 * 60 * 1000;

function safeEqualHex(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "hex");
  const bufB = Buffer.from(b, "hex");
  if (bufA.length !== bufB.length || bufA.length === 0) return false;
  return timingSafeEqual(bufA, bufB);
}

interface AssistantRequest {
  discordUserId?: string;
  question?: string;
  command?: "reset" | "help";
  guildId?: string | null;
  channelId?: string | null;
  threadId?: string | null;
}

/**
 * If an "assistant" channel is configured, the message must be in it (threads
 * carry their parent channel id). No mapping configured → allow anywhere (the
 * mention + admin gates still apply).
 */
async function channelAllowed(channelId?: string | null): Promise<boolean> {
  try {
    const mappings = await listChannelMappings();
    const assistant = mappings.find((m) => m.purpose === "assistant");
    if (!assistant) return true;
    return channelId === assistant.channelId;
  } catch {
    // A lookup failure should not silently open the assistant everywhere.
    return false;
  }
}

export async function POST(request: Request) {
  const secret = getDiscordDmWorkerSecret();
  if (!secret) {
    return NextResponse.json({ error: "unavailable" }, { status: 503 });
  }

  const signature = request.headers.get("x-ghost-signature") ?? "";
  const timestamp = request.headers.get("x-ghost-timestamp") ?? "";
  const rawBody = await request.text();

  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(Date.now() - ts) > MAX_SKEW_MS) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const expected = createHmac("sha256", secret)
    .update(`${timestamp}.${rawBody}`)
    .digest("hex");
  if (!safeEqualHex(signature, expected)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let payload: AssistantRequest;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  const discordUserId = payload.discordUserId ?? "";
  const question = (payload.question ?? "").trim();
  if (!discordUserId || !question) {
    return NextResponse.json({ status: "bad_request" });
  }

  // Authorization: admins only (spec §11).
  const decision = await authorizeDiscordAdmin(discordUserId);
  if (!decision.authorized) {
    return NextResponse.json({ status: "unauthorized" });
  }

  if (!(await channelAllowed(payload.channelId))) {
    return NextResponse.json({ status: "wrong_channel" });
  }

  // Conversation identity — scopes memory to this guild/channel/thread/user.
  const identity: ConversationIdentity = {
    guildId: payload.guildId ?? "-",
    channelId: payload.channelId ?? "-",
    threadId: payload.threadId ?? null,
    discordUserId,
    module: "discord_assistant",
  };

  // Commands (no model run, no cost).
  if (payload.command === "help") {
    return NextResponse.json({ status: "ok", answer: HELP_REPLY, kind: "help" });
  }
  if (payload.command === "reset") {
    await resetConversation(identity);
    return NextResponse.json({ status: "ok", answer: RESET_REPLY, kind: "reset" });
  }

  try {
    const loaded = await loadConversation(identity);
    const result = await answerBusinessQuestion({
      question,
      history: loaded.history,
      discordUserId,
    });
    if (!result.ok) {
      // Coarse reason only; the worker maps it to a short user-facing line.
      return NextResponse.json({ status: "error", reason: result.reason });
    }
    // Persist the turn so context survives worker restarts / other instances.
    await appendTurn(identity, question, result.answer);
    return NextResponse.json({ status: "ok", answer: result.answer });
  } catch (error) {
    console.error("[discord:assistant:endpoint]", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
