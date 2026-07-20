# Database backup and recovery

Ghost.ma runs on **Neon PostgreSQL**. Neon's own point-in-time recovery is the
primary mechanism; the scripts in this repo are a supplement for the cases PITR
cannot serve. Read this before touching a production database.

---

## 1. What the provider already gives you

Neon keeps a continuous **write-ahead log** and lets you restore the database to
any moment inside your plan's retention window, or branch from that moment into
a new database. This is strictly better than a nightly dump for the common
disaster (a bad migration, a mistaken `DELETE`): it is continuous rather than
daily, it does not need maintaining, and it cannot silently stop working.

**Retention depends on the plan and is not visible from this repository.**
Check it in the Neon console → project → *Settings → History retention*. Free
tier historically allows ~24 h; paid plans allow considerably more.

> ⚠️ **Confirm the actual retention window before relying on it.** A 24-hour
> window means a problem discovered on Monday morning that started on Friday is
> not recoverable by PITR. That is the single most important number in this
> document, and nobody should assume it.

**Branching is the recovery primitive worth knowing.** Rather than restoring
over production, create a branch from a past timestamp, inspect it, and copy out
what you need. Non-destructive, and the live database keeps serving.

## 2. Recommended schedule

| What | When | How |
|---|---|---|
| PITR | continuous | automatic — nothing to configure |
| **Checkpoint before any schema change** | every migration | Neon branch or restore point, taken manually |
| Logical dump | weekly, and before a risky change | `node scripts/db-backup.mjs --production` |
| **Restore rehearsal** | quarterly | §6 — into a scratch branch |

The checkpoint-before-migration step is the one most likely to be skipped,
because `prisma migrate deploy` runs automatically inside the Vercel build and
never prompts. `docs/release-process.md` lists it; nothing enforces it.

## 3. What is and is not backed up

**In a logical dump:** every table — orders, order items, customers, products,
variants, digital codes, delivered codes, payment events, payment proofs,
promo codes, wallet ledgers, supplier config, guides, settings.

**NOT in a logical dump — and not in Neon PITR either:**

| Not covered | Where it actually lives | Consequence |
|---|---|---|
| Environment variables / secrets | Vercel project settings | A restored DB without them is unusable |
| Vercel deployment history | Vercel | Roll back via Vercel, not the database |
| Discord messages and threads | Discord | Order threads are not reconstructible |
| Emails already sent | Resend | `EmailLog` records that a send happened, not its content |
| Supplier-side orders | Reloadly / FazerCards | Restoring the DB does **not** un-buy a gift card |

That last row is the one that bites. **Restoring the database to an earlier point
does not roll back money already spent with a supplier.** A restored order row
may look unfulfilled while the supplier has already been charged and the code
issued. After any production restore, reconcile `SupplierFulfillment` against the
provider dashboards before re-running fulfilment.

### Payment proofs

Payment proofs are **base64 columns in Postgres** (`PaymentProof.data`), not
Vercel Blob — despite what a reader might assume from the deployment stack.
There is no separate object store to back up, and no blob bucket to worry about.

The practical consequence is size: proofs are ~1.33× their original bytes and
live in the same table space as everything else, so dumps grow faster than order
volume alone suggests. If dump size becomes a problem, moving proofs to object
storage is the fix — not excluding them from backups.

## 4. Manual backup

```bash
export GHOST_BACKUP_PASSPHRASE='…'          # NOT stored in this repo
node scripts/db-backup.mjs                  # active db (dev)
node scripts/db-backup.mjs --production     # production (read-only)
node scripts/db-backup.mjs --out /secure/path
```

Writes `ghost-<env>-<timestamp>.sql.gz.enc`: `pg_dump` → `gzip` → AES-256-CBC
with PBKDF2 (200k iterations). The three stages are **piped**, so an unencrypted
dump never touches the disk, not even briefly.

Requires `pg_dump` and `openssl` on PATH (`brew install libpq` on macOS, then add
it to PATH — it is keg-only).

**Encryption is not optional.** A dump contains every customer name, e-mail and
address, and every delivered gift-card code. `GHOST_BACKUP_PASSPHRASE` is
mandatory and the script refuses to run without it.

**Store the passphrase somewhere other than this repository and other than the
backup.** Losing it makes every backup permanently unreadable — there is no
recovery path, by design.

`backups/`, `*.sql.gz.enc` and `*.sql.gz` are gitignored. Never commit one, even
encrypted.

## 5. Verify a backup

```bash
node scripts/db-verify-backup.mjs backups/ghost-production-….sql.gz.enc
```

Decrypts and decompresses **in a stream** — nothing written to disk, no database
touched — and asserts the output is a real `pg_dump` containing `Order`,
`OrderItem`, `Customer`, `Product` and `DigitalCode`.

**An unverified backup is a guess.** Run this immediately after every backup; the
backup script prints the exact command.

Note what this does *not* prove: that a restore will succeed. It proves the file
is readable and structurally plausible. For real confidence, rehearse a restore.

## 6. Restore into a test database (rehearsal)

```bash
# 1. Create a scratch Neon branch in the console, copy its connection string.
export GHOST_BACKUP_PASSPHRASE='…'
export GHOST_RESTORE_TARGET_URL='postgresql://…scratch…'
CONFIRM_RESTORE=true node scripts/db-restore.mjs backups/ghost-production-….sql.gz.enc

# 2. Sanity-check before trusting it.
psql "$GHOST_RESTORE_TARGET_URL" -c 'SELECT count(*) FROM "Order";'
```

Then **delete the scratch branch** — it is a full copy of customer data.

Safety properties, all verified:

- The target comes from `GHOST_RESTORE_TARGET_URL` **only**, never from
  `DATABASE_URL`, so a restore cannot inherit the app's database.
- It **refuses** if the target host matches `.env.production.local`.
- It **refuses** if the environment is marked production (`GHOST_DB_ENV`).
- It refuses without `CONFIRM_RESTORE=true`.
- `psql --set ON_ERROR_STOP=1`, so a failure aborts loudly rather than leaving a
  half-restored database that looks fine.

**There is no `--force`, and adding one would be a mistake.** See below.

## 7. Restoring production

`scripts/db-restore.mjs` will not do this. Use Neon.

1. **Stop the bleeding.** Turn the ordering kill switch OFF in admin so no new
   orders enter a broken system.
2. **Do not restore over production first.** Create a Neon branch from the
   timestamp just before the incident and inspect it.
3. **Decide the scope.** Usually only a few rows are wrong. Copying those back is
   far safer than replacing the whole database and losing every legitimate order
   placed since.
4. **If a full restore is genuinely required**, do it through Neon's console so
   the operation is atomic and auditable, then redeploy so Prisma reconnects.
5. **Reconcile suppliers** (§3) — restoring the DB does not un-spend money.
6. **Re-enable ordering** only after checking recent orders look right.

A logical dump is the *last* resort here: it is necessarily staler than PITR and
restoring it discards everything since.

## 8. Required permissions

| Task | Needs |
|---|---|
| PITR / branching | Neon console access to the project |
| Logical backup | A role with read on all tables (the app role suffices) |
| Restore into scratch | Owner on the scratch branch |
| Production restore | Neon project owner |

The backup uses `--no-owner --no-privileges`, so a dump can be restored by a role
that differs from the one that created it.

## 9. Retention

- **Encrypted dumps:** keep 4 weekly + 3 monthly. Beyond that, the data is stale
  enough to be a liability rather than an asset.
- **Delete scratch branches after a rehearsal.** A forgotten branch is a full
  unmonitored copy of customer data.
- Under GDPR / loi 09-08, a deletion request must reach backups too. In practice:
  keep the window short, and record any deletion request so it can be re-applied
  if an older backup is ever restored.

## 10. Production safety warnings

- **`prisma migrate deploy` runs inside the Vercel build**, so every production
  deploy can change the schema with no prompt and no checkpoint. Take the
  checkpoint yourself.
- **A dump is not a rollback for a destructive migration.** Restoring loses every
  order placed since the dump. PITR is the correct tool.
- **Never restore into production to "test" something.**
- **Never commit a backup**, even encrypted.
- **Never put the passphrase in Vercel env vars** alongside the database URL —
  one compromise should not yield both.

## 11. Encryption and access

- AES-256-CBC, PBKDF2, 200,000 iterations, random salt per file.
- Passphrase supplied via environment, never as a CLI argument (arguments are
  visible in `ps` and land in shell history).
- The unencrypted dump exists only in a pipe — never on disk.
- Treat a backup file as equivalent to full database access, because it is.

## 12. Known gaps

- **The dump/restore path is unverified end-to-end in this environment**, because
  `pg_dump` is not installed on the machine where the scripts were written. The
  argument handling and every safety guard were tested; the actual dump was not.
  **Run §4 and §5 once against dev before trusting these scripts in an incident.**
- No automated scheduled backup. Deliberate: a cron that dumps the whole database
  on Vercel would need somewhere to put a large encrypted file and a secret to
  encrypt it with, and both are decisions with cost and security implications
  that should be made explicitly rather than inherited from a default.
- Neon retention is not asserted anywhere in code — §1 depends on a human
  checking the console.
