import { cookies, headers } from "next/headers";
import { NextResponse } from "next/server";
import { ensureDatabaseReady, prisma } from "@/lib/db/prisma";
import { getCurrentCustomer, setCustomerSession } from "@/lib/auth";
import { getDiscordClientId, getDiscordClientSecret } from "@/lib/discord/config";
import { notifyAccountCreated } from "@/lib/discord/notify";

const DISCORD_STATE_COOKIE = "ghost_discord_oauth_state";

type DiscordTokenResponse = {
  access_token?: string;
  error?: string;
  error_description?: string;
};

type DiscordUserInfo = {
  id?: string;
  username?: string;
  global_name?: string | null;
  avatar?: string | null;
};

async function siteUrl(requestUrl: string) {
  const origin = new URL(requestUrl).origin;
  if (origin.includes("localhost") || origin.includes("127.0.0.1")) return origin;

  const configured = process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL || process.env.APP_URL;
  if (configured) return configured.replace(/\/$/, "");

  let host = "localhost:3000";
  try {
    host = (await headers()).get("host") || host;
  } catch {
    // Static or non-request invocations use the local development fallback.
  }
  return `${host.includes("localhost") ? "http" : "https"}://${host}`;
}

function errorRedirect(requestUrl: string, error: string, mode: string) {
  // Linking failures return to the account page; login/register to /login.
  const path = mode === "link" ? "/account" : "/login";
  return NextResponse.redirect(new URL(`${path}?error=${encodeURIComponent(error)}`, requestUrl));
}

function avatarUrl(id: string, avatar: string | null | undefined): string | null {
  if (!avatar) return null;
  const ext = avatar.startsWith("a_") ? "gif" : "png";
  return `https://cdn.discordapp.com/avatars/${id}/${avatar}.${ext}`;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const providerError = url.searchParams.get("error");

  const cookieStore = await cookies();
  const stored = cookieStore.get(DISCORD_STATE_COOKIE)?.value;
  cookieStore.delete(DISCORD_STATE_COOKIE);
  const [storedState, mode = "login"] = stored?.split(":") ?? [];

  if (providerError) return errorRedirect(request.url, "discord_cancelled", mode);
  if (!code || !state) return errorRedirect(request.url, "discord_cancelled", mode);
  if (!storedState || storedState !== state) {
    return errorRedirect(request.url, "discord_state", mode);
  }

  const clientId = getDiscordClientId();
  const clientSecret = getDiscordClientSecret();
  if (!clientId || !clientSecret) return errorRedirect(request.url, "discord_config", mode);

  const base = await siteUrl(request.url);
  const tokenResponse = await fetch("https://discord.com/api/oauth2/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "authorization_code",
      code,
      redirect_uri: `${base}/auth/discord/callback`,
    }),
  });

  const token = (await tokenResponse.json()) as DiscordTokenResponse;
  if (!tokenResponse.ok || !token.access_token) {
    console.error("[auth:discord:token]", token.error, token.error_description);
    return errorRedirect(request.url, "discord_provider", mode);
  }

  const profileResponse = await fetch("https://discord.com/api/v10/users/@me", {
    headers: { authorization: `Bearer ${token.access_token}` },
  });
  const profile = (await profileResponse.json()) as DiscordUserInfo;
  // The OAuth access token has done its job (identity fetch); it is never
  // persisted. Nothing below stores or logs it.
  if (!profileResponse.ok || !profile.id) {
    console.error("[auth:discord:profile]", profileResponse.status);
    return errorRedirect(request.url, "discord_provider", mode);
  }

  await ensureDatabaseReady();
  const discordId = profile.id;
  const discordUsername = profile.username ?? null;
  const discordGlobalName = profile.global_name ?? null;
  const discordAvatar = avatarUrl(discordId, profile.avatar);
  const displayName = discordGlobalName || discordUsername || "Client";
  const now = new Date();

  const discordProfileData = {
    discordId,
    discordUsername,
    discordGlobalName,
    discordAvatar,
  };

  // --- Link mode: attach Discord to the already-authenticated customer -------
  if (mode === "link") {
    const current = await getCurrentCustomer();
    if (!current) return errorRedirect(request.url, "discord_login_required", mode);

    const owner = await prisma.customer.findUnique({ where: { discordId } });
    if (owner && owner.id !== current.id) {
      // This Discord identity already belongs to a different account. Never
      // merge — surface a clear error instead.
      return errorRedirect(request.url, "discord_already_linked", mode);
    }

    try {
      await prisma.customer.update({
        where: { id: current.id },
        data: {
          ...discordProfileData,
          image: current.image ?? discordAvatar,
        },
      });
      return NextResponse.redirect(new URL("/account?discord=linked", base));
    } catch (error) {
      console.error("[auth:discord:link]", error);
      return errorRedirect(request.url, "discord_account_conflict", mode);
    }
  }

  // --- Login / register: identity is the Discord id, never a shared email ----
  const existing = await prisma.customer.findUnique({ where: { discordId } });
  const isNewAccount = !existing;

  try {
    let customerId: string;
    if (existing) {
      await prisma.customer.update({
        where: { id: existing.id },
        data: {
          ...discordProfileData,
          image: existing.image ?? discordAvatar,
          authProvider: existing.passwordHash
            ? "password_discord"
            : existing.googleId
              ? "google_discord"
              : "discord",
          lastLoginAt: now,
        },
      });
      customerId = existing.id;
    } else {
      // Discord's `identify` scope returns no email, and Ghost.ma never merges
      // accounts on a provider email. Brand-new Discord accounts therefore get a
      // stable, non-deliverable placeholder address keyed to the Discord id;
      // the customer can set a real email later from their account.
      const placeholderEmail = `discord-${discordId}@users.noreply.ghost.ma`;
      const created = await prisma.customer.create({
        data: {
          name: displayName,
          email: placeholderEmail,
          image: discordAvatar,
          authProvider: "discord",
          emailVerified: false,
          lastLoginAt: now,
          ...discordProfileData,
        },
      });
      customerId = created.id;
    }

    await setCustomerSession(customerId, true);

    if (isNewAccount) {
      void notifyAccountCreated({
        customerId,
        name: displayName,
        email: `Discord: @${discordUsername ?? displayName}`,
        createdAt: now.toISOString(),
      });
    }

    return NextResponse.redirect(
      new URL(mode === "register" ? "/account" : "/account/orders", base),
    );
  } catch (error) {
    console.error("[auth:discord:customer]", error);
    return errorRedirect(request.url, "discord_account_conflict", mode);
  }
}
