# Monitoring: error tracking and uptime

Two independent things:

- **Sentry** answers *"what broke, where, with what stack trace?"* — but only
  for requests that reached our code.
- **The uptime monitor** answers *"is the site answering at all?"* — from
  outside, which is the only place that can see a total outage.

Neither costs anything at Ghost.ma's volume, and both are currently **inert**:
no Sentry DSN exists yet, and no monitor is configured. The wiring is in place
so that turning either on is a matter of setting environment variables.

---

## 1. Error monitoring (Sentry)

### Current state

`@sentry/nextjs` is installed and wired, but **no DSN is set**, so the SDK never
initialises. The app builds and runs byte-for-byte as it did before. This is
intentional and safe to leave as-is until someone creates the project.

### Where the wiring lives

| File | Role |
|---|---|
| `next.config.mjs` | `withSentryConfig` — source-map upload, `/monitoring` tunnel route |
| `src/instrumentation.ts` | server + edge init; also `onRequestError` for server-side route errors. The pre-existing env self-check is untouched and still runs. |
| `src/instrumentation-client.ts` | browser init + router transition instrumentation |
| `src/lib/monitoring/sentry.ts` | shared options and the `beforeSend` scrubber |

### What is scrubbed

`sendDefaultPii` is `false`, and `scrubEvent` strips values by **key name**
anywhere in the event tree, plus any inline `data:...;base64,` blob:

passwords, tokens, secrets, API keys, client secrets, credentials, session
identifiers, cookies, `Authorization` headers, gift-card / activation /
redemption / voucher codes, PINs, serials, card numbers, payment proofs,
receipts, attachments, e-mail addresses, phone numbers, addresses.

Key-name matching is deliberate: it fails **closed** on fields nobody has
thought of yet (anything named `*_token`, `*secret*`, `*Code`), which an
allowlist of value patterns would not. Ordinary debugging fields (`statusCode`,
`orderStatus`, `productId`) survive — see `test/ops/sentryScrub.test.ts`.

The whole `request.cookies` object is dropped outright.

Every event is tagged with `environment` (from `runtimeEnvLabel()`, so staging
and production never mix) and `release` (`VERCEL_GIT_COMMIT_SHA`).

### Turning it on

1. Create a Sentry project (Next.js platform). The free tier is sufficient.
2. Set in Vercel, **production and staging separately**:
   - `SENTRY_DSN` — server/edge errors
   - `NEXT_PUBLIC_SENTRY_DSN` — browser errors (same value; public by design,
     a DSN is a write-only ingest URL)
3. Optional, for readable stack traces — set in the **build** environment only:
   - `SENTRY_AUTH_TOKEN` (secret, never `NEXT_PUBLIC_`), `SENTRY_ORG`,
     `SENTRY_PROJECT`
   Without the token, source-map upload is skipped and the build still succeeds.
4. Redeploy. Throw a test error and confirm it appears with the right
   `environment` tag and **no** customer data attached.

`tracesSampleRate` is `0`: we want errors, not performance spans, and spans burn
quota fast. Raise it deliberately if performance data is ever wanted.

---

## 2. Uptime monitoring

### The endpoint

```
GET https://ghost.ma/api/health
```

Response body — and this is the whole body:

```json
{ "status": "healthy", "version": "a1b2c3d" }
```

- `status` — `healthy` | `warning` | `offline` | `unknown`
- `version` — short commit SHA of the running deployment, or `local`
- HTTP **200** while serving, **503** when a dependency is down, so a monitor
  can alert on the HTTP status alone without parsing the body.

**It returns nothing else, on purpose.** The rich health objects behind the
admin dashboard carry French `message` / `action` strings naming Neon, Resend
and specific environment variables. Useful to an admin; free reconnaissance to
anyone else. That is the only reason this route can safely be unauthenticated —
**do not add messages, subsystem names or counts to it.**

Its scope is also minimal: database connectivity plus the session secret, both
under the shared 2.5 s deadline. It deliberately does **not** run the e-mail,
Discord or supplier checks — a monitor polling every minute must not amplify
into repeated counting queries or provider API calls.

### Pointing a monitor at it

Any free service works. Suggested: **UptimeRobot** (50 monitors free) or
**BetterStack** free tier. No paid service is needed.

UptimeRobot setup:

1. Add New Monitor → **HTTP(s)**.
2. URL: `https://ghost.ma/api/health`
3. Interval: 5 minutes.
4. Advanced → alert when the status code is **not** 200. Optionally also add a
   keyword monitor for `"status":"healthy"` to catch a degraded-but-serving
   site.
5. Alert contacts: the ops e-mail, and/or a Discord webhook.
6. Add a second monitor for `https://staging.ghost.ma/api/health` if you want
   staging watched too — but send its alerts somewhere quieter.

Do **not** monitor `/` instead: it renders fine from cache even when the
database is unreachable, which is exactly the failure you want to be told about.

### Reading a non-healthy result

| `status` | Meaning | First move |
|---|---|---|
| `offline` (503) | the database is unreachable, or no session secret is set | check Neon status and `DATABASE_URL` / `AUTH_SECRET` |
| `warning` | serving, but degraded (e.g. slow DB) | open the admin Operations dashboard for the detail |
| `unknown` | a check timed out — the real state is genuinely not known | retry; if it persists, treat it as an outage |

`unknown` is a real answer, not a placeholder. The health checks were changed to
stop reporting `healthy` for anything they cannot actually verify — cron jobs in
particular have no last-run tracking, so they now report `unknown` rather than a
green light nobody earned.
