import { cookies, headers } from "next/headers";
import { NextResponse } from "next/server";
import { ensureDatabaseReady, prisma } from "@/lib/db/prisma";
import { setCustomerSession } from "@/lib/auth";
import { notifyAccountCreated } from "@/lib/discord/notify";

const GOOGLE_STATE_COOKIE = "ghost_google_oauth_state";

type GoogleTokenResponse = {
  access_token?: string;
  error?: string;
  error_description?: string;
};

type GoogleUserInfo = {
  sub?: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
  given_name?: string;
  picture?: string;
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

function loginRedirect(requestUrl: string, error: string) {
  return NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(error)}`, requestUrl));
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const providerError = url.searchParams.get("error");

  if (providerError) return loginRedirect(request.url, providerError);
  if (!code || !state) return loginRedirect(request.url, "google_cancelled");

  const cookieStore = await cookies();
  const stored = cookieStore.get(GOOGLE_STATE_COOKIE)?.value;
  cookieStore.delete(GOOGLE_STATE_COOKIE);

  const [storedState, mode = "login"] = stored?.split(":") ?? [];
  if (!storedState || storedState !== state) {
    return loginRedirect(request.url, "google_state");
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) return loginRedirect(request.url, "google_config");

  const base = await siteUrl(request.url);
  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      grant_type: "authorization_code",
      redirect_uri: `${base}/auth/google/callback`,
    }),
  });

  const token = (await tokenResponse.json()) as GoogleTokenResponse;
  if (!tokenResponse.ok || !token.access_token) {
    console.error("[auth:google:token]", token.error, token.error_description);
    return loginRedirect(request.url, "google_provider");
  }

  const profileResponse = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
    headers: { authorization: `Bearer ${token.access_token}` },
  });
  const profile = (await profileResponse.json()) as GoogleUserInfo;
  if (!profileResponse.ok) {
    console.error("[auth:google:profile]", profile);
    return loginRedirect(request.url, "google_provider");
  }
  if (!profile.email) return loginRedirect(request.url, "google_missing_email");
  if (!profile.sub) return loginRedirect(request.url, "google_provider");

  await ensureDatabaseReady();
  const email = profile.email.trim().toLowerCase();
  const name = profile.name?.trim() || profile.given_name?.trim() || email.split("@")[0] || "Client";
  const now = new Date();

  const existingByGoogleId = await prisma.customer.findFirst({ where: { googleId: profile.sub } });
  const existingByEmail = await prisma.customer.findUnique({ where: { email } });
  const existing = existingByGoogleId ?? existingByEmail;
  const isNewAccount = !existing;

  try {
    const customer = existing
      ? await prisma.customer.update({
          where: { id: existing.id },
          data: {
            name,
            email,
            image: profile.picture ?? existing.image,
            googleId: profile.sub,
            authProvider: existing.passwordHash ? "password_google" : "google",
            emailVerified: existing.emailVerified || profile.email_verified !== false,
            emailVerifiedAt:
              existing.emailVerifiedAt ?? (profile.email_verified === false ? null : now),
            lastLoginAt: now,
          },
        })
      : await prisma.customer.create({
          data: {
            name,
            email,
            image: profile.picture ?? null,
            googleId: profile.sub,
            authProvider: "google",
            emailVerified: profile.email_verified ?? true,
            emailVerifiedAt: profile.email_verified === false ? null : now,
            lastLoginAt: now,
          },
        });

    await setCustomerSession(customer.id, true);

    if (isNewAccount) {
      void notifyAccountCreated({
        customerId: customer.id,
        name,
        email,
        createdAt: now.toISOString(),
      });
    }

    return NextResponse.redirect(new URL(mode === "register" ? "/account" : "/account/orders", base));
  } catch (error) {
    console.error("[auth:google:customer]", error);
    return loginRedirect(request.url, "google_account_conflict");
  }
}
