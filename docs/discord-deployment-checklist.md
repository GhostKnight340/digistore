# Discord feature — admin / deployment checklist

Concise steps to take the Discord auth + DM-delivery feature live. Matches the
current implementation (custom cookie-session auth, REST bot on Vercel, DM
listener as a separate worker).

## 1. Vercel env vars (web app)

Server-only (do **not** prefix with `NEXT_PUBLIC_`):

| Var | Purpose |
| --- | --- |
| `DISCORD_CLIENT_ID` | OAuth client id (also used to build the "Ouvrir Discord" deep link). |
| `DISCORD_CLIENT_SECRET` | OAuth token exchange. |
| `DISCORD_DM_WORKER_SECRET` | Shared HMAC secret for `/api/discord/activate`. Must equal the worker's value. If unset, activation fails closed (503). |
| `DISCORD_APPLICATION_ID` | Optional — deep link to the bot's DM. Falls back to `DISCORD_CLIENT_ID` (same value for Discord apps). |

Already present for the existing bot notifications (leave as-is): `DISCORD_BOT_TOKEN`,
`DISCORD_GUILD_ID`, `DISCORD_INTEGRATION_ENABLED=true`.

Also ensure `NEXT_PUBLIC_SITE_URL` (or `SITE_URL`) is the production origin so the
OAuth `redirect_uri` is built correctly.

## 2. Worker env vars (separate always-on host, not Vercel)

Set on Railway / Render / Fly (see `docs/discord-dm-worker.md`):

| Var | Purpose |
| --- | --- |
| `DISCORD_BOT_TOKEN` | Same bot token as the web app. |
| `DISCORD_DM_WORKER_SECRET` | **Same** value as on Vercel. |
| `INTERNAL_API_BASE_URL` | Production web origin, e.g. `https://ghost.ma` (no trailing slash). |

Start command: `npm run discord:dm-worker`. Run exactly **one** instance.

## 3. Discord Developer Portal settings

In [discord.com/developers/applications](https://discord.com/developers/applications) → your app:

- **OAuth2 → Redirects:** add the redirect URL below.
- **Bot → Privileged Gateway Intents:** enable **Message Content Intent** (required
  so the worker can read DM text). `Direct Messages` is not privileged.
- Keep the bot invited to your guild (existing setup).

## 4. OAuth redirect URL to configure

```
https://<your-domain>/auth/discord/callback
```

Add both production and any preview/localhost origins you use, e.g.
`http://localhost:3000/auth/discord/callback` for local testing. The value must
match the origin the app computes from `NEXT_PUBLIC_SITE_URL` / request host.

## 5. Verify Discord login

1. Log out. Go to `/login` → click **"Continuer avec Discord"**.
2. Authorize on Discord → you should land on `/account/orders` (or `/account`
   for register mode) logged in.
3. From a logged-in account, `/account` → **"Connecter Discord"** links an existing
   account; linking an already-used Discord id shows `discord_already_linked`.
4. Regression: email/password and Google login still work unchanged.
5. Config check: if `DISCORD_CLIENT_ID` is missing, the button redirects to
   `/login?error=discord_config` ("La connexion Discord n'est pas configurée").

## 6. Verify activation code flow

1. `/account` → **"Activer les messages Discord"** → a `GHOST-XXXXXX` code appears.
2. With the **worker running**, DM that code to the bot on Discord → the bot replies
   "✅ Discord activé…" and clicking **"J'ai envoyé le code"** flips the account to
   **State C — Discord activé**.
3. Expected rejections (bot replies accordingly): expired code (>15 min), unknown
   code, reused code, and any code superseded by generating a new one.
4. Endpoint sanity (no bot needed): `POST /api/discord/activate` with a wrong/absent
   signature returns 401; with `DISCORD_DM_WORKER_SECRET` unset it returns 503.

## 7. What will NOT work until the worker is deployed

- Sending the code to the bot does nothing — **no account ever becomes DM-activated**.
- "J'ai envoyé le code" always shows *"Code non reçu pour le moment…"* (pending), by design.
- Because activation never completes, **no order is ever delivered via Discord DM**
  (delivery requires a verified `discordDmUserId`). Orders still deliver normally on
  the website and by email — Discord never blocks checkout, payment, or fulfillment.
- The account **State C** (preference toggle, "Désactiver") and the payment-page
  "Recevoir aussi cette commande par Discord" checkbox only appear **after** activation.

## Deferred (not yet implemented)

Admin **"Renvoyer par Discord"** manual retry. The admin order page shows Discord
connection + delivery status read-only; the retry seam is marked in `DiscordCard`
(`src/components/admin/orders/OrderDetailPage.tsx`).
