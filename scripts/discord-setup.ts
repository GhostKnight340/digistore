/**
 * One-time, idempotent Discord server setup.
 *
 * Creates the category/channel structure the app expects, reusing any
 * category or channel that already exists by exact name match instead of
 * duplicating it. Also creates (or reuses) a "Business manager" role and
 * locks every business channel down to that role + the bot + the configured
 * owner, so anyone without the role sees nothing sensitive. Prints the
 * resulting channel/role ID env var assignments so they can be copied into
 * `.env` / Vercel — never prints the bot token.
 *
 * Run with: npm run discord:setup
 */
import "dotenv/config";
import {
  listGuildChannels,
  createGuildCategory,
  createGuildTextChannel,
  listGuildRoles,
  createGuildRole,
  reorderGuildRoles,
  getGuildMember,
  setChannelPermissionOverwrite,
  getCurrentBotUser,
  DISCORD_CHANNEL_TYPE,
  DISCORD_PERMISSION,
  DISCORD_OVERWRITE_TYPE,
  type DiscordChannel,
  type DiscordPermissionOverwrite,
} from "../src/lib/discord/client";
import {
  DISCORD_SERVER_STRUCTURE,
  DISCORD_BUSINESS_MANAGER_ROLE,
} from "../src/lib/discord/channels";

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

  console.log(`Ensuring "${DISCORD_BUSINESS_MANAGER_ROLE.name}" role exists...`);
  const existingRoles = await listGuildRoles(guildId);
  let businessManagerRole = existingRoles.find(
    (role) => role.name === DISCORD_BUSINESS_MANAGER_ROLE.name,
  );
  if (businessManagerRole) {
    console.log(`Role "${DISCORD_BUSINESS_MANAGER_ROLE.name}" already exists, reusing it.`);
  } else {
    console.log(`Creating role "${DISCORD_BUSINESS_MANAGER_ROLE.name}"...`);
    businessManagerRole = await createGuildRole(guildId, DISCORD_BUSINESS_MANAGER_ROLE.name);
  }

  const botUser = await getCurrentBotUser();
  const ownerUserId = process.env.DISCORD_OWNER_USER_ID;

  console.log("Checking role hierarchy...");
  const botMember = await getGuildMember(guildId, botUser.id);
  const botRoleId = botMember.roles[0];
  const currentRoles = await listGuildRoles(guildId);
  const botRole = currentRoles.find((role) => role.id === botRoleId);
  const currentBusinessManagerRole = currentRoles.find(
    (role) => role.id === businessManagerRole!.id,
  )!;

  if (botRole && botRole.position <= currentBusinessManagerRole.position) {
    console.log(
      `Bot's role is not above "${DISCORD_BUSINESS_MANAGER_ROLE.name}" — reordering so the bot can manage its permissions...`,
    );
    // The business role always sits just above @everyone (position 1); the
    // bot's own role goes one slot above that so it can manage it.
    await reorderGuildRoles(guildId, [
      { id: currentBusinessManagerRole.id, position: 1 },
      { id: botRole.id, position: 2 },
    ]);
  } else {
    console.log("Bot's role is already above the business role, no reorder needed.");
  }

  const readWriteAccess =
    DISCORD_PERMISSION.VIEW_CHANNEL |
    DISCORD_PERMISSION.SEND_MESSAGES |
    DISCORD_PERMISSION.READ_MESSAGE_HISTORY;

  function privacyOverwrites(): DiscordPermissionOverwrite[] {
    // The bot's own allow MUST be applied before @everyone is ever denied.
    // If these were reversed and the run failed partway through (e.g. a
    // transient error on the next call), the bot would lose visibility into
    // the channel with no explicit allow yet — and since bots can't bypass
    // overwrites like server owners can, it would be permanently unable to
    // fix its own permissions via the API from that point on.
    const overwrites: DiscordPermissionOverwrite[] = [
      {
        id: botUser.id,
        type: DISCORD_OVERWRITE_TYPE.MEMBER,
        allow: readWriteAccess,
        deny: 0,
      },
    ];
    if (ownerUserId) {
      overwrites.push({
        id: ownerUserId,
        type: DISCORD_OVERWRITE_TYPE.MEMBER,
        allow: readWriteAccess,
        deny: 0,
      });
    }
    overwrites.push(
      {
        id: businessManagerRole!.id,
        type: DISCORD_OVERWRITE_TYPE.ROLE,
        allow: readWriteAccess,
        deny: 0,
      },
      {
        id: guildId!,
        type: DISCORD_OVERWRITE_TYPE.ROLE,
        allow: 0,
        deny: DISCORD_PERMISSION.VIEW_CHANNEL,
      },
    );
    return overwrites;
  }

  async function applyPrivacy(channelId: string) {
    for (const overwrite of privacyOverwrites()) {
      await setChannelPermissionOverwrite(channelId, overwrite);
    }
  }

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
    await applyPrivacy(categoryChannel.id);

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
      await applyPrivacy(textChannel.id);

      results.push({ envVar: channelDef.envVar, id: textChannel.id });
    }
  }

  console.log("\nSetup complete. Add the following to your environment (e.g. Vercel):\n");
  for (const result of results) {
    console.log(`${result.envVar}=${result.id}`);
  }
  console.log(`${DISCORD_BUSINESS_MANAGER_ROLE.envVar}=${businessManagerRole.id}`);
  console.log(
    `\nAssign the "${DISCORD_BUSINESS_MANAGER_ROLE.name}" role in Discord to anyone who should see these channels. Everyone else sees nothing in them.`,
  );
}

main().catch((error) => {
  console.error("[discord:setup] Failed:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
