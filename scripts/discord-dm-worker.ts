/**
 * Standalone Discord DM worker — the ONLY piece of this feature that needs a
 * persistent Gateway connection, which cannot run inside Vercel serverless
 * functions. Run it as a small always-on process (Railway / Render / Fly).
 *
 * Responsibility: when a customer DMs the Ghost.ma bot an activation code, POST
 * it (with the verified Discord sender id) to the app's internal
 * /api/discord/activate endpoint, authenticated by an HMAC signature, then
 * reply in the DM. This process never touches the database directly and never
 * needs DATABASE_URL — the web app owns all persistence.
 *
 * discord.js is imported ONLY here; no Next.js/app code imports it, so it is
 * never pulled into the web bundle.
 *
 * Env (set on the worker host, out of band from Vercel):
 *   DISCORD_BOT_TOKEN        - same bot token the web app uses
 *   DISCORD_DM_WORKER_SECRET - shared HMAC secret (must match the web app)
 *   INTERNAL_API_BASE_URL    - e.g. https://ghost.ma  (no trailing slash)
 *
 * Run: npm run discord:dm-worker
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

const ACTIVATION_CODE_REGEX = /\bGHOST-[A-Z0-9]{6}\b/i;

const REPLIES = {
  activated:
    "✅ Discord activé pour Ghost.ma !\n\n" +
    "Votre compte est maintenant connecté aux messages privés Ghost.ma.\n\n" +
    "Lorsque vous choisissez la livraison Discord pour une commande, votre code pourra également être envoyé directement dans cette conversation.",
  invalid:
    "Ce code est invalide. Vérifiez le code ou générez-en un nouveau depuis votre compte Ghost.ma.",
  expired:
    "Ce code a expiré. Générez un nouveau code depuis votre compte Ghost.ma.",
  error:
    "Une erreur est survenue. Réessayez dans un instant ou générez un nouveau code depuis votre compte Ghost.ma.",
} as const;

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`[dm-worker] Missing required env var ${name}. Aborting.`);
    process.exit(1);
  }
  return value;
}

const BOT_TOKEN = requireEnv("DISCORD_BOT_TOKEN");
const WORKER_SECRET = requireEnv("DISCORD_DM_WORKER_SECRET");
const API_BASE_URL = requireEnv("INTERNAL_API_BASE_URL").replace(/\/$/, "");

type ActivateStatus = "activated" | "invalid" | "expired" | "error";

async function callActivate(payload: {
  code: string;
  discordUserId: string;
  discordUsername: string | null;
  discordDisplayName: string | null;
  discordAvatar: string | null;
}): Promise<ActivateStatus> {
  const rawBody = JSON.stringify(payload);
  const timestamp = String(Date.now());
  const signature = createHmac("sha256", WORKER_SECRET)
    .update(`${timestamp}.${rawBody}`)
    .digest("hex");

  try {
    const response = await fetch(`${API_BASE_URL}/api/discord/activate`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-ghost-signature": signature,
        "x-ghost-timestamp": timestamp,
      },
      body: rawBody,
    });
    if (!response.ok) {
      // Do not log the code; log only status.
      console.error(`[dm-worker] activate endpoint returned ${response.status}`);
      return "error";
    }
    const data = (await response.json()) as { status?: ActivateStatus };
    return data.status ?? "error";
  } catch (error) {
    console.error("[dm-worker] activate request failed:", error instanceof Error ? error.message : error);
    return "error";
  }
}

async function handleMessage(message: Message) {
  // DMs only, ignore bots (including self). guildId is null in DMs.
  if (message.author.bot || message.guildId) return;

  const match = message.content.match(ACTIVATION_CODE_REGEX);
  if (!match) return;
  const code = match[0].toUpperCase();

  const status = await callActivate({
    code,
    discordUserId: message.author.id,
    discordUsername: message.author.username ?? null,
    discordDisplayName: message.author.globalName ?? null,
    discordAvatar: message.author.avatar ?? null,
  });

  try {
    await message.reply(REPLIES[status]);
  } catch (error) {
    console.error("[dm-worker] failed to reply:", error instanceof Error ? error.message : error);
  }
}

const client = new Client({
  intents: [GatewayIntentBits.DirectMessages, GatewayIntentBits.MessageContent],
  // DM channels/messages arrive as partials — enable so events still fire.
  partials: [Partials.Channel, Partials.Message],
});

client.once(Events.ClientReady, (ready) => {
  console.log(`[dm-worker] Logged in as ${ready.user.tag}. Listening for DMs.`);
});

client.on(Events.MessageCreate, (message) => {
  void handleMessage(message);
});

client.on(Events.Error, (error) => {
  console.error("[dm-worker] client error:", error.message);
});

void client.login(BOT_TOKEN);
