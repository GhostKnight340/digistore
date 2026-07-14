import "server-only";

import { prisma, ensureDatabaseReady } from "./prisma";
import { expireWalletIfDue } from "./ghostCredit";
import { getStoreSettings } from "./catalog";
import { sendTransactionalEmail } from "@/lib/email/send-email";
import { absoluteAppUrl } from "@/lib/orderNumber";
import { formatDH } from "@/lib/format";

/**
 * Idempotent Ghost Credit maintenance job (run daily via /api/cron/ghost-credit):
 *  1. Expire wallets whose 180-day inactivity deadline has passed — appends one
 *     EXPIRATION debit per cycle (idempotent via expireWalletIfDue's per-deadline
 *     key), preserving all ledger history.
 *  2. Send the "3 days before expiry" reminder to opted-in customers — one email
 *     per expiration cycle (idempotent via Customer.expirationReminderSentFor ==
 *     the cycle's ghostCreditExpiresAt). A new qualifying reward moves the
 *     deadline, which allows a fresh reminder.
 *
 * A wallet that expires this run is skipped for reminders. Reserved credit: the
 * spend model debits credit at order creation, so the available balance never
 * contains reserved amounts — expiry only ever touches available balance.
 */
export async function runWalletExpiryAndReminders(now = new Date()): Promise<{
  expired: number;
  remindersSent: number;
  ordersExpired: number;
}> {
  await ensureDatabaseReady();
  const settings = await getStoreSettings();

  // 0. First release credit locked in abandoned unpaid orders (so the freshly
  //    restored balance is considered by the wallet-expiry pass below).
  const { expireAbandonedOrders } = await import("./orderExpiry");
  const orderExpiry = await expireAbandonedOrders(now);
  const reminderDays = settings.ghostCredit?.reminderDaysBefore ?? 3;
  const timeZone = settings.expenses?.businessTimezone ?? "Africa/Casablanca";

  // ── 1. Expire due wallets ──────────────────────────────────────────────────
  const dueForExpiry = await prisma.customer.findMany({
    where: { ghostCreditBalanceMad: { gt: 0 }, ghostCreditExpiresAt: { lt: now } },
    select: { id: true },
    take: 1000,
  });
  let expired = 0;
  for (const c of dueForExpiry) {
    try {
      const after = await prisma.$transaction((tx) => expireWalletIfDue(tx, c.id, now));
      if (after === 0) expired += 1;
    } catch (error) {
      console.error("[cron:ghost-credit] expire failed", c.id, error);
    }
  }

  // ── 2. Reminders (3 days before, opted in, not already sent this cycle) ─────
  const reminderCutoff = new Date(now.getTime() + reminderDays * 24 * 60 * 60 * 1000);
  const dueForReminder = await prisma.customer.findMany({
    where: {
      expirationReminderEnabled: true,
      walletFrozen: false,
      ghostCreditBalanceMad: { gt: 0 },
      ghostCreditExpiresAt: { gt: now, lte: reminderCutoff },
    },
    select: {
      id: true,
      name: true,
      email: true,
      ghostCreditBalanceMad: true,
      ghostCreditExpiresAt: true,
      expirationReminderSentFor: true,
    },
    take: 1000,
  });

  let remindersSent = 0;
  for (const c of dueForReminder) {
    const deadline = c.ghostCreditExpiresAt;
    if (!deadline) continue;
    // One reminder per cycle: skip if we've already sent for this exact deadline.
    if (c.expirationReminderSentFor && c.expirationReminderSentFor.getTime() === deadline.getTime()) {
      continue;
    }
    try {
      // Claim the cycle FIRST (idempotency anchor) so a concurrent/duplicate run
      // can't double-send: only the writer that flips expirationReminderSentFor
      // from the old value to this deadline proceeds.
      const claim = await prisma.customer.updateMany({
        where: {
          id: c.id,
          ghostCreditExpiresAt: deadline,
          OR: [{ expirationReminderSentFor: null }, { expirationReminderSentFor: { not: deadline } }],
        },
        data: { expirationReminderSentFor: deadline },
      });
      if (claim.count !== 1) continue;

      const daysRemaining = Math.max(0, Math.ceil((deadline.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)));
      const expiryDate = new Intl.DateTimeFormat("fr-FR", {
        day: "numeric",
        month: "long",
        year: "numeric",
        timeZone,
      }).format(deadline);

      await sendTransactionalEmail({
        to: c.email,
        customerId: c.id,
        templateKey: "ghost_credit_expiry_reminder",
        type: "ghost_credit_expiry_reminder",
        variables: {
          customer_name: c.name,
          credit_amount: formatDH(c.ghostCreditBalanceMad),
          expiry_date: expiryDate,
          days_remaining: daysRemaining,
          account_url: absoluteAppUrl("/account/wallet"),
        },
        metadata: { ghost_credit_reminder: deadline.toISOString() },
      });
      remindersSent += 1;
    } catch (error) {
      console.error("[cron:ghost-credit] reminder failed", c.id, error);
    }
  }

  console.info(
    "[cron:ghost-credit] done",
    JSON.stringify({
      expiredCandidates: dueForExpiry.length,
      expired,
      remindersSent,
      ordersExpired: orderExpiry.expired,
    }),
  );
  return { expired, remindersSent, ordersExpired: orderExpiry.expired };
}
