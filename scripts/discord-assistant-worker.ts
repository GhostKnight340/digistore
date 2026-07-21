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
  ThreadAutoArchiveDuration,
  type Message,
  type SendableChannels,
} from "discord.js";
import { routeAssistantMessage } from "../src/lib/ai-ops/discord/assistantRouting";
import { ConversationStore } from "../src/lib/ai-ops/discord/conversation";

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

const conversations = new ConversationStore();

type AssistantStatus = "ok" | "unauthorized" | "wrong_channel" | "bad_request" | "error";

interface AssistantResponse {
  status: AssistantStatus;
  answer?: string;
}

async function callAssistant(payload: {
  discordUserId: string;
  question: string;
  history: { role: "user" | "assistant"; content: string }[];
  channelId: string | null;
  parentId: string | null;
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
    const data = (await response.json()) as { status?: AssistantStatus; answer?: string };
    return { status: data.status ?? "error", answer: data.answer };
  } catch (error) {
    console.error("[assistant-worker] request failed:", error instanceof Error ? error.message : error);
    return { status: "error" };
  }
}

/** Post text to a channel/thread, chunked to Discord's 2000-char limit. */
async function sendChunked(channel: SendableChannels, text: string): Promise<void> {
  const body = text.length > 0 ? text : REPLIES.error;
  for (let i = 0; i < body.length; i += DISCORD_MAX_MESSAGE) {
    await channel.send(body.slice(i, i + DISCORD_MAX_MESSAGE));
  }
}

async function handleMessage(message: Message): Promise<void> {
  // Guild messages only; ignore bots (including self) and empty content.
  if (message.author.bot || !message.guildId) return;
  const botUser = message.client.user;
  if (!botUser) return;

  const inThread = message.channel.isThread();
  const threadId = message.channelId;
  const isKnownThread = inThread && conversations.has(threadId);

  // In a thread we already own, treat every message as a continuation. Elsewhere
  // the bot must be explicitly mentioned.
  if (!isKnownThread && !message.mentions.has(botUser)) return;

  const routed = routeAssistantMessage(message.content);
  if (!routed) return; // not a CEO question (empty, or another department)

  const parentId = inThread ? message.channel.parentId ?? null : null;
  const history = isKnownThread ? conversations.history(threadId) : [];

  try {
    if ("sendTyping" in message.channel) await message.channel.sendTyping();
  } catch {
    // Non-fatal: typing indicator is best-effort.
  }

  const started = Date.now();
  const result = await callAssistant({
    discordUserId: message.author.id,
    question: routed.question,
    history,
    channelId: message.channelId,
    parentId,
  });
  console.log(
    `[assistant-worker] question → ${result.status} (${Date.now() - started}ms, guild=${message.guildId})`,
  );

  if (result.status === "wrong_channel") return; // silent: not the assistant channel
  if (result.status === "unauthorized") {
    await safeReply(message, REPLIES.unauthorized);
    return;
  }
  if (result.status !== "ok" || !result.answer) {
    await safeReply(message, result.status === "error" ? REPLIES.error : REPLIES.unavailable);
    return;
  }

  // Success: answer in a thread so follow-ups have a stable conversation home.
  try {
    const thread = inThread
      ? message.channel
      : await message.startThread({
          name: `CEO · ${routed.question.slice(0, 80)}`,
          autoArchiveDuration: ThreadAutoArchiveDuration.OneDay,
        });
    if (thread.isSendable()) {
      await sendChunked(thread, result.answer);
      conversations.append(thread.id, { role: "user", content: routed.question });
      conversations.append(thread.id, { role: "assistant", content: result.answer });
    }
  } catch (error) {
    console.error("[assistant-worker] failed to post answer:", error instanceof Error ? error.message : error);
    await safeReply(message, REPLIES.error);
  }
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
