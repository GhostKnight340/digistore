import { randomBytes } from "crypto";
import { cookies, headers } from "next/headers";
import { NextResponse } from "next/server";

const GOOGLE_STATE_COOKIE = "ghost_google_oauth_state";

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
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    return NextResponse.redirect(new URL("/login?error=google_config", request.url));
  }

  const url = new URL(request.url);
  const requestedMode = url.searchParams.get("mode");
  // login | register | link (attach Google to the current account)
  //       | link_discord (authenticate a Google account and move the current
  //       Discord identity onto it — used by the onboarding completion page).
  const mode =
    requestedMode === "register"
      ? "register"
      : requestedMode === "link"
        ? "link"
        : requestedMode === "link_discord"
          ? "link_discord"
          : "login";
  const state = randomBytes(24).toString("base64url");
  const base = await siteUrl(request.url);

  (await cookies()).set(GOOGLE_STATE_COOKIE, `${state}:${mode}`, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 10 * 60,
  });

  const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("redirect_uri", `${base}/auth/google/callback`);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", "openid email profile");
  authUrl.searchParams.set("state", state);
  authUrl.searchParams.set("prompt", "select_account");

  return NextResponse.redirect(authUrl);
}
