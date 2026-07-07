/**
 * One-time, idempotent Discord server setup.
 *
 * Creates the category/channel structure the app expects, reusing any
 * category or channel that already exists by exact name match instead of
 * duplicating it. Prints the resulting channel ID env var assignments so
 * they can be copied into `.env` / Vercel — never prints the bot token.
 *
 * Run with: npm run discord:setup
 */
import "dotenv/config";
import {
  listGuildChannels,
  createGuildCategory,
  createGuildTextChannel,
  DISCORD_CHANNEL_TYPE,
  type DiscordChannel,
} from "../src/lib/discord/client";
import { DISCORD_SERVER_STRUCTURE } from "../src/lib/discord/channels";

async function main() {
  const guildId = process.env.DISCORD_GUILD_ID;
  if (!process.env.DISCORD_BOT_TOKEN) {
    console.error("DISCORD_BOT_TOKEN is not set. Aborting.");
    process.exitCode = 1;
    return;
  }
  if (!guildId) {
    console.error("DISCORD_GUILD_ID is not set. Aborting.");
    process.exitCode = 1;
    return;
  }

  console.log(`Inspecting guild ${guildId}...`);
  const existingChannels = await listGuildChannels(guildId);
  const channels: DiscordChannel[] = [...existingChannels];

  const results: { envVar: string; id: string }[] = [];

  for (const category of DISCORD_SERVER_STRUCTURE) {
    let categoryChannel = channels.find(
      (channel) =>
        channel.type === DISCORD_CHANNEL_TYPE.GUILD_CATEGORY &&
        channel.name === category.name,
    );

    if (categoryChannel) {
      console.log(`Category "${category.name}" already exists, reusing it.`);
    } else {
      console.log(`Creating category "${category.name}"...`);
      categoryChannel = await createGuildCategory(guildId, category.name);
      channels.push(categoryChannel);
    }

    for (const channelDef of category.channels) {
      let textChannel = channels.find(
        (channel) =>
          channel.type === DISCORD_CHANNEL_TYPE.GUILD_TEXT &&
          channel.name === channelDef.name &&
          channel.parent_id === categoryChannel!.id,
      );

      if (textChannel) {
        console.log(`  #${channelDef.name} already exists, reusing it.`);
      } else {
        console.log(`  Creating #${channelDef.name}...`);
        textChannel = await createGuildTextChannel(
          guildId,
          channelDef.name,
          categoryChannel!.id,
        );
        channels.push(textChannel);
      }

      results.push({ envVar: channelDef.envVar, id: textChannel.id });
    }
  }

  console.log("\nSetup complete. Add the following to your environment (e.g. Vercel):\n");
  for (const result of results) {
    console.log(`${result.envVar}=${result.id}`);
  }
}

main().catch((error) => {
  console.error("[discord:setup] Failed:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
