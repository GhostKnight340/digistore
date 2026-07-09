# Deploying the Discord DM worker on Cybrancee

This guide hosts the standalone **Discord DM activation worker**
(`scripts/discord-dm-worker.ts`) on **Cybrancee's Node.js bot/app hosting**.

The worker is the one piece of the Discord feature that needs a persistent
Gateway WebSocket connection, which Vercel serverless functions cannot hold
open. Everything else (Discord login, admin notifications, and **order-delivery
DMs**) runs inside the Next.js app on Vercel over the Discord REST API.

> **Scope of the worker:** it listens for customer DMs and verifies **activation
> codes** (`GHOST-XXXXXX`) against the web app. It does **not** send order
> deliveries — those are sent by the web app (`src/lib/discord/dm.ts`). See
> [Testing order-delivery DMs](#testing-order-delivery-dms) below.

For the underlying design see [`discord-dm-worker.md`](discord-dm-worker.md) and
the feature checklist in
[`discord-deployment-checklist.md`](discord-deployment-checklist.md).

---

## 1. Cybrancee service type

Choose a **Node.js application / bot hosting** service (a persistent, always-on
process). Do **not** use a static site or a "serverless function" plan — the
worker must stay running to keep its Gateway connection alive.

- The worker exposes **no HTTP port**; it only makes outbound calls. If Cybrancee
  asks for a port or a health-check URL, leave it blank / disable HTTP health
  checks (uptime is proven by the logs, see [step 8](#8-confirm-the-bot-is-online)).
- Run **exactly one instance**. Two instances would both reply to the same DM.

## 2. Node.js version

Use **Node.js 20 or 22** (LTS). discord.js v14 requires Node ≥ 18; this repo is
developed on Node 20+. Pick 22 if Cybrancee offers it.

## 3. Source

Point Cybrancee at this Git repository (branch `main`). The worker file is
`scripts/discord-dm-worker.ts` and is started via an npm script — no separate
repo or copy is needed.

## 4. Install command

```
npm install
```

`tsx` and `dotenv` are declared as **runtime dependencies**, so the worker runs
even if the host installs with `NODE_ENV=production`. If Cybrancee lets you skip
the Next.js build, that's fine — the worker does not need it.

## 5. Build command

**None.** The worker is run directly with `tsx` (a TypeScript runtime); there is
no compile step. Leave the build command empty, or set it to `true` / `echo skip`
if the panel requires a non-empty value.

## 6. Start command

```
npm run start:worker
```

(Equivalent to `npm run discord:dm-worker` — both run
`tsx scripts/discord-dm-worker.ts`.)

## 7. Environment variables

Set these three in Cybrancee's environment settings. Full descriptions are in
[`.env.discord-worker.example`](../.env.discord-worker.example).

| Variable | Required | Value |
| --- | --- | --- |
| `DISCORD_BOT_TOKEN` | ✅ | The bot token from the Discord Developer Portal. **Secret — server-only, never exposed client-side.** Same token the web app uses. |
| `DISCORD_DM_WORKER_SECRET` | ✅ | Shared HMAC secret. **Must exactly match** the `DISCORD_DM_WORKER_SECRET` set in Vercel, or activation returns 401. |
| `INTERNAL_API_BASE_URL` | ✅ | Production web origin, no trailing slash, e.g. `https://ghost.ma`. The worker calls `${INTERNAL_API_BASE_URL}/api/discord/activate`. |

Notes:
- If any of the three is missing, the worker logs `Missing required env var …`
  and exits immediately (visible in the Cybrancee logs).
- The worker never needs `DATABASE_URL` or any Reloadly/Stripe/Resend secrets.

### Discord Developer Portal

In the [Developer Portal](https://discord.com/developers/applications) → your app
→ **Bot** → **Privileged Gateway Intents**, enable **Message Content Intent** so
the worker can read DM text. The `Direct Messages` intent is not privileged. The
customer DMs the bot first, so a DM channel already exists for later delivery.

## 8. Confirm the bot is online

Open the Cybrancee **logs** for the app. A healthy startup prints, in order:

```
[dm-worker] starting…
[dm-worker] activation endpoint configured: https://ghost.ma/api/discord/activate
[dm-worker] connecting to Discord Gateway…
[dm-worker] Discord login success — logged in as YourBot#1234
[dm-worker] Ready to receive DMs. Send a "GHOST-XXXXXX" code to the bot to test.
```

You can also confirm the bot shows **online** in your Discord server member list.

## 9. Test an activation-code DM

1. In the web app, log in → `/account` → **"Activer les messages Discord"** to
   generate a `GHOST-XXXXXX` code.
2. From the same Discord account, open a DM with the bot and **send that code**.
3. The bot replies **"✅ Discord activé pour Ghost.ma !"**.
4. Back on `/account`, click **"J'ai envoyé le code"** — the account flips to
   **DM activés** (State C).
5. The worker logs a coarse, code-free line: `[dm-worker] activation attempt → activated`.
   Wrong/expired/reused codes log `→ invalid` / `→ expired` and the bot replies
   with the matching message.

## Testing order-delivery DMs

Order-delivery DMs are sent by the **web app**, not the worker — the worker only
needs to be running so the account can reach the **DM activés** state first.

1. Ensure the test account is **DM activés** (step 9 above) and, on the payment
   page, opted into **"Recevoir aussi cette commande par Discord"** (or use the
   customer-triggered send after delivery).
2. Deliver the order (admin fulfillment / normal flow).
3. The customer receives a DM: **"🎮 Votre commande Ghost.ma est prête !"** with the
   code(s) blurred as Discord spoilers.
4. This send happens on Vercel; check the Vercel logs for
   `[discord:dm-delivery]` lines, and the admin order page for the Discord
   delivery status. The Cybrancee worker is **not** involved in this step.

## Common errors and fixes

| Symptom in logs / behavior | Cause | Fix |
| --- | --- | --- |
| `Missing required env var …` then exit | An env var is unset | Set all three vars in step 7. |
| `Discord login FAILED: …` (e.g. "An invalid token was provided") | Bad/rotated `DISCORD_BOT_TOKEN` | Reset the token in the Developer Portal and update Cybrancee. |
| Bot is online but never replies to DMs | **Message Content Intent** disabled | Enable it in the Developer Portal → Bot → Privileged Gateway Intents, then restart. |
| Bot replies but code is always rejected as `error` / `activation endpoint returned 401` | `DISCORD_DM_WORKER_SECRET` differs from Vercel | Make the two values identical, redeploy both. |
| `activation endpoint returned 503` | Web app has no `DISCORD_DM_WORKER_SECRET` set | Set it in Vercel (server-only), redeploy the web app. |
| `activate request failed: fetch failed` / ECONNREFUSED | Wrong `INTERNAL_API_BASE_URL` | Use the public production origin with no trailing slash. |
| Bot replies twice to each DM | Two worker instances running | Scale to a single instance. |
| Order DM never arrives | Not a worker issue | Check account is DM activés, opt-in was set, and Vercel `[discord:dm-delivery]` logs. |

## Deployment checklist

- [ ] Discord bot token copied from the Discord Developer Portal.
- [ ] **Message Content Intent** enabled (Direct Messages intent needs no toggle).
- [ ] Vercel (web app) has `DISCORD_DM_WORKER_SECRET` set (server-only).
- [ ] Cybrancee has the **same** `DISCORD_DM_WORKER_SECRET` value.
- [ ] Ghost.ma is deployed with the `/api/discord/activate` endpoint live.
- [ ] Cybrancee env has `DISCORD_BOT_TOKEN` and `INTERNAL_API_BASE_URL` (no trailing slash).
- [ ] Service type = always-on Node.js app; build command empty; start = `npm run start:worker`.
- [ ] Exactly **one** instance running.
- [ ] Logs show `Discord login success` and `Ready to receive DMs`.
- [ ] Test account can DM the bot an activation code and gets the ✅ reply.
- [ ] Account page changes to **DM activés**.
- [ ] A delivered order can be sent to Discord (verified from the web app / Vercel logs).
```
