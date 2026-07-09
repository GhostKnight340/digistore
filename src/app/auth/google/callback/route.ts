import { cookies, headers } from "next/headers";
import { NextResponse } from "next/server";
import { ensureDatabaseReady, prisma } from "@/lib/db/prisma";
import {
  getCurrentCustomer,
  isProfileIncomplete,
  setCustomerSession,
  transferDiscordIdentity,
} from "@/lib/auth";
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

function accountRedirect(base: string, params: string) {
  return NextResponse.redirect(new URL(`/account?${params}`, base));
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

  // --- Link mode: attach Google to the already-authenticated account ---------
  if (mode === "link") {
    const current = await getCurrentCustomer();
    if (!current) return loginRedirect(request.url, "google_state");
    const owner = await prisma.customer.findFirst({ where: { googleId: profile.sub } });
    if (owner && owner.id !== current.id) {
      return accountRedirect(base, "error=google_already_linked");
    }
    try {
      await prisma.customer.update({
        where: { id: current.id },
        data: {
          googleId: profile.sub,
          image: current.image ?? profile.picture ?? null,
          authProvider: current.hasPassword ? "password_google" : "google",
        },
      });
      return accountRedirect(base, "google=linked");
    } catch (error) {
      console.error("[auth:google:link]", error);
      return accountRedirect(base, "error=google_account_conflict");
    }
  }

  // --- Link-Discord mode: authenticate a Google account and move the current
  //     (incomplete) Discord identity onto it. -------------------------------
  if (mode === "link_discord") {
    const from = await getCurrentCustomer();
    if (!from || !from.discordId || !isProfileIncomplete(from)) {
      return loginRedirect(request.url, "google_state");
    }
    try {
      const googleOwner =
        (await prisma.customer.findFirst({ where: { googleId: profile.sub } })) ??
        (await prisma.customer.findUnique({ where: { email } }));
      let targetId: string;
      if (googleOwner) {
        if (googleOwner.discordId) return accountRedirect(base, "error=discord_already_linked");
        if (!googleOwner.googleId) {
          await prisma.customer.update({
            where: { id: googleOwner.id },
            data: {
              googleId: profile.sub,
              emailVerified: googleOwner.emailVerified || profile.email_verified !== false,
              emailVerifiedAt:
                googleOwner.emailVerifiedAt ?? (profile.email_verified === false ? null : now),
            },
          });
        }
        targetId = googleOwner.id;
      } else {
        const created = await prisma.customer.create({
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
        targetId = created.id;
      }
      const transfer = await transferDiscordIdentity(from.id, targetId);
      if (!transfer.ok) {
        return accountRedirect(base, "error=discord_already_linked");
      }
      await setCustomerSession(targetId, true);
      return accountRedirect(base, "discord=linked");
    } catch (error) {
      console.error("[auth:google:link_discord]", error);
      return accountRedirect(base, "error=google_account_conflict");
    }
  }

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
