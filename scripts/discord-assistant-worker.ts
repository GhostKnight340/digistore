/**
 * Standalone Discord CEO-assistant worker — the piece that needs a persistent
 * Gateway connection (impossible inside Vercel serverless). Run it as a small
 * always-on process alongside (or instead of) the DM worker; it reuses the SAME
 * Ghost.ma bot.
 *
 * Responsibility: when an admin @mentions the bot in the guild with a business
 * question, POST the question (with the verified Discord sender id) to the app's
 * internal /api/discord/assistant endpoint — HMAC-signed with the shared worker
 * secret — then post the answer back in a thread. The web app owns ALL logic and
 * persistence: authorization, the safe tool layer, the AI provider, budgets, and
 * logging. This process never touches the database and never needs DATABASE_URL.
 *
 * Short-term conversation context lives here, in memory, scoped per thread, so
 * follow-ups in the same thread stay coherent and expire when idle.
 *
 * discord.js is imported ONLY in worker scripts; no Next.js/app code imports it.
 *
 * Env (set on the worker host, out of band from Vercel):
 *   DISCORD_BOT_TOKEN        - same bot token the web app uses
 *   DISCORD_DM_WORKER_SECRET - shared HMAC secret (must match the web app)
 *   INTERNAL_API_BASE_URL    - e.g. https://ghost.ma  (no trailing slash)
 *
 * Run: npm run discord:assistant-worker
 */
import "dotenv/config";
import { createHmac } from "node:crypto";
import {
  Client,
  Events,
  GatewayIntentBits,
  Partials,
  type Message,
} from "discord.js";
import { routeAssistantMessage } from "../src/lib/ai-ops/discord/assistantRouting";
import { assistantErrorReply } from "../src/lib/ai-ops/discord/replyMessages";

const DISCORD_MAX_MESSAGE = 2000;

const REPLIES = {
  unauthorized:
    "⛔ The Ghost.ma CEO assistant is available to administrators only.",
  unavailable:
    "⚠️ The assistant is unavailable right now. Please try again shortly.",
  error:
    "⚠️ Something went wrong answering that. Please try again shortly.",
} as const;

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`[assistant-worker] Missing required env var ${name}. Aborting.`);
    process.exit(1);
  }
  return value;
}

const BOT_TOKEN = requireEnv("DISCORD_BOT_TOKEN");
const WORKER_SECRET = requireEnv("DISCORD_DM_WORKER_SECRET");
const API_BASE_URL = requireEnv("INTERNAL_API_BASE_URL").replace(/\/$/, "");

type AssistantStatus = "ok" | "unauthorized" | "wrong_channel" | "bad_request" | "error";

interface AssistantResponse {
  status: AssistantStatus;
  answer?: string;
  reason?: string;
}

async function callAssistant(payload: {
  discordUserId: string;
  question: string;
  command?: "reset" | "help";
  guildId: string | null;
  channelId: string | null;
  threadId: string | null;
}): Promise<AssistantResponse> {
  const rawBody = JSON.stringify(payload);
  const timestamp = String(Date.now());
  const signature = createHmac("sha256", WORKER_SECRET)
    .update(`${timestamp}.${rawBody}`)
    .digest("hex");

  try {
    const response = await fetch(`${API_BASE_URL}/api/discord/assistant`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-ghost-signature": signature,
        "x-ghost-timestamp": timestamp,
      },
      body: rawBody,
    });
    if (!response.ok) {
      console.error(`[assistant-worker] endpoint returned ${response.status}`);
      return { status: "error" };
    }
    const data = (await response.json()) as { status?: AssistantStatus; answer?: string; reason?: string };
    return { status: data.status ?? "error", answer: data.answer, reason: data.reason };
  } catch (error) {
    console.error("[assistant-worker] request failed:", error instanceof Error ? error.message : error);
    return { status: "error" };
  }
}

/** Reply to a message, chunked to Discord's 2000-char limit. Stateless. */
async function replyChunked(message: Message, text: string): Promise<void> {
  const body = text.length > 0 ? text : REPLIES.error;
  const chunks: string[] = [];
  for (let i = 0; i < body.length; i += DISCORD_MAX_MESSAGE) {
    chunks.push(body.slice(i, i + DISCORD_MAX_MESSAGE));
  }
  try {
    for (let i = 0; i < chunks.length; i++) {
      if (i === 0) await message.reply(chunks[i]);
      else if (message.channel.isSendable()) await message.channel.send(chunks[i]);
    }
  } catch (error) {
    console.error("[assistant-worker] failed to post answer:", error instanceof Error ? error.message : error);
  }
}

async function handleMessage(message: Message): Promise<void> {
  // Guild messages only; ignore bots (including self). The bot must be mentioned
  // — conversation memory is durable (DB), so no thread bookkeeping is needed.
  if (message.author.bot || !message.guildId) return;
  const botUser = message.client.user;
  if (!botUser || !message.mentions.has(botUser)) return;

  const routed = routeAssistantMessage(message.content);
  if (!routed) return; // not a CEO question (empty, or another department)

  // Conversation identity: keyed on the thread when inside one, else the channel.
  const inThread = message.channel.isThread();
  const channelId = inThread ? message.channel.parentId ?? message.channelId : message.channelId;
  const threadId = inThread ? message.channelId : null;

  try {
    if ("sendTyping" in message.channel) await message.channel.sendTyping();
  } catch {
    // Non-fatal: typing indicator is best-effort.
  }

  const started = Date.now();
  const result = await callAssistant({
    discordUserId: message.author.id,
    question: routed.question,
    command: routed.command,
    guildId: message.guildId,
    channelId,
    threadId,
  });
  console.log(
    `[assistant-worker] ${routed.command ?? "question"} → ${result.status} (${Date.now() - started}ms, guild=${message.guildId})`,
  );

  if (result.status === "wrong_channel") return; // silent: not the assistant channel
  if (result.status === "unauthorized") {
    await safeReply(message, REPLIES.unauthorized);
    return;
  }
  if (result.status !== "ok" || !result.answer) {
    await safeReply(message, assistantErrorReply(result.reason));
    return;
  }
  await replyChunked(message, result.answer);
}

async function safeReply(message: Message, text: string): Promise<void> {
  try {
    await message.reply(text);
  } catch (error) {
    console.error("[assistant-worker] failed to reply:", error instanceof Error ? error.message : error);
  }
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
  partials: [Partials.Channel, Partials.Message],
});

client.once(Events.ClientReady, (ready) => {
  console.log(`[assistant-worker] Discord login success — logged in as ${ready.user.tag}`);
  console.log(`[assistant-worker] Ready. Mention the bot with "CEO <question>" in your server.`);
});

client.on(Events.MessageCreate, (message) => {
  void handleMessage(message);
});

client.on(Events.Error, (error) => {
  console.error("[assistant-worker] client error:", error.message);
});

// --- Graceful shutdown -------------------------------------------------------
let shuttingDown = false;
async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[assistant-worker] received ${signal} — shutting down…`);
  try {
    await client.destroy();
    console.log("[assistant-worker] Discord client destroyed. Goodbye.");
  } catch (error) {
    console.error("[assistant-worker] error during shutdown:", error instanceof Error ? error.message : error);
  } finally {
    process.exit(0);
  }
}
process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

// --- Startup -----------------------------------------------------------------
console.log("[assistant-worker] starting…");
console.log(`[assistant-worker] assistant endpoint: ${API_BASE_URL}/api/discord/assistant`);
console.log("[assistant-worker] connecting to Discord Gateway…");
void client.login(BOT_TOKEN).catch((error) => {
  console.error("[assistant-worker] Discord login FAILED:", error instanceof Error ? error.message : error);
  process.exit(1);
});
