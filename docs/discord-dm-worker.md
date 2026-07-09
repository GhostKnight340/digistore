# Discord DM activation worker

Ghost.ma's Discord bot posts admin notifications over the Discord **REST API** and
runs happily inside Vercel's serverless functions. Receiving **customer DMs**, however,
requires a persistent **Gateway WebSocket** connection, which serverless functions cannot
hold open. The DM activation flow ("send this code to the bot") therefore needs one small
always-on worker process, deployed separately from the Next.js app.

**The web app is fully functional without the worker.** Customers can connect Discord,
generate an activation code, and set delivery preferences. Until the worker is running,
"J'ai envoyé le code" simply reports a pending state — DM delivery is never marked active
until the worker verifies a real code from a real Discord sender.

## What the worker does

1. Connects to the Discord Gateway with the same bot token the web app uses.
2. Listens for **direct messages** to the bot.
3. When a DM matches the activation-code format `GHOST-XXXXXX`, it POSTs the code plus the
   **verified Discord sender id** to the app's internal endpoint
   `POST /api/discord/activate`, signed with an HMAC-SHA256 signature.
4. Replies to the customer in the DM with the localized success / invalid / expired message.

The worker never touches the database and never needs `DATABASE_URL`. All persistence is
owned by the web app; the worker is a thin, stateless relay. `discord.js` is imported only
by `scripts/discord-dm-worker.ts` and by no application code, so it is never bundled into
the Next.js app.

## Required environment variables (on the worker host)

| Variable | Purpose |
| --- | --- |
| `DISCORD_BOT_TOKEN` | Same bot token as the web app. **Secret.** |
| `DISCORD_DM_WORKER_SECRET` | Shared HMAC secret; must exactly match the value set on the web app. **Secret.** |
| `INTERNAL_API_BASE_URL` | Base URL of the deployed web app, e.g. `https://ghost.ma` (no trailing slash). |

On the **web app** (Vercel), set the matching `DISCORD_DM_WORKER_SECRET` (server-only — do
**not** prefix with `NEXT_PUBLIC_`). If it is unset, `/api/discord/activate` fails closed
with `503` and no activation can occur.

## Discord application setup

In the [Discord Developer Portal](https://discord.com/developers/applications) → your app →
**Bot**, enable the **Message Content Intent** (privileged) so the worker can read DM text.
The `DIRECT_MESSAGES` intent is not privileged. Customers must share a server with the bot
or have DMs open; since the customer DMs the bot first, the DM channel already exists when
Ghost.ma later needs to deliver a code.

## Local run

```bash
# .env at repo root (or export in the shell):
#   DISCORD_BOT_TOKEN=...
#   DISCORD_DM_WORKER_SECRET=...
#   INTERNAL_API_BASE_URL=http://localhost:3000
npm run discord:dm-worker
```

## Deploying (Railway / Render / Fly)

The worker is a single long-running Node process — any always-on host works. Example
recipes:

### Railway / Render (buildpack)
- **Build command:** `pnpm install`
- **Start command:** `npm run discord:dm-worker`
- **Env vars:** the three above.
- No exposed HTTP port is required (the worker only makes outbound calls).

### Fly.io (Docker)
Minimal `Dockerfile`:

```dockerfile
FROM node:22-slim
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN corepack enable && pnpm install --frozen-lockfile
COPY . .
CMD ["npm", "run", "discord:dm-worker"]
```

Then `fly launch` / `fly deploy` with the three env vars set as Fly secrets. Run a single
instance — multiple instances would each reply to the same DM.

## Security notes

- The worker authenticates to the app with an HMAC signature over `${timestamp}.${body}`;
  the endpoint rejects stale timestamps (±5 min) and bad signatures.
- The Discord user id used for delivery comes from the **DM event**, never from customer
  input.
- Activation codes are single-use, expire after 15 minutes, and are stored only as hashes.
- Neither the worker nor the endpoint logs activation codes or delivered order codes.
