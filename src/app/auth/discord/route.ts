import { randomBytes } from "crypto";
import { cookies, headers } from "next/headers";
import { NextResponse } from "next/server";
import { getDiscordClientId } from "@/lib/discord/config";
import { safeNextPath } from "@/lib/safeRedirect";

const DISCORD_STATE_COOKIE = "ghost_discord_oauth_state";

// mode drives the callback behaviour:
//   login | register -> authenticate or create by Discord identity
//   link             -> attach Discord to the already-logged-in customer
type OAuthMode = "login" | "register" | "link";

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

export async function GET(request: Request) {
  const clientId = getDiscordClientId();
  if (!clientId) {
    return NextResponse.redirect(new URL("/login?error=discord_config", request.url));
  }

  const url = new URL(request.url);
  const requested = url.searchParams.get("mode");
  const mode: OAuthMode =
    requested === "register" ? "register" : requested === "link" ? "link" : "login";
  // Optional post-link return path — only a same-origin relative path is kept.
  const nextPath = safeNextPath(url.searchParams.get("next"));
  const nextEncoded = nextPath ? Buffer.from(nextPath).toString("base64url") : "";
  const state = randomBytes(24).toString("base64url");
  const base = await siteUrl(request.url);

  (await cookies()).set(DISCORD_STATE_COOKIE, `${state}:${mode}:${nextEncoded}`, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 10 * 60,
  });

  // scope=identify only: we deliberately do NOT request email, because Ghost.ma
  // never auto-merges accounts on a shared, unverified provider email.
  const authUrl = new URL("https://discord.com/oauth2/authorize");
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("redirect_uri", `${base}/auth/discord/callback`);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", "identify");
  authUrl.searchParams.set("state", state);
  authUrl.searchParams.set("prompt", "consent");

  return NextResponse.redirect(authUrl);
}
