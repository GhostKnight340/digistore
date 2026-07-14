"use client";

import { useState } from "react";
import { setExpiryReminderAction } from "@/app/actions/promo";
import { trackEvent } from "@/lib/analytics";

/** Customer opt-in for the "3 days before expiry" reminder email. */
export default function WalletReminderToggle({ initialEnabled }: { initialEnabled: boolean }) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [saving, setSaving] = useState(false);

  async function toggle(next: boolean) {
    setSaving(true);
    setEnabled(next); // optimistic
    try {
      const result = await setExpiryReminderAction(next);
      if (!result.ok) setEnabled(!next);
      else trackEvent(next ? "wallet_expiry_reminder_enabled" : "wallet_expiry_reminder_disabled", {});
    } catch {
      setEnabled(!next);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex items-center justify-between gap-3 rounded-[13px] border border-border bg-canvas px-4 py-3">
      <span id="wallet-reminder-label" className="text-[12.5px] leading-snug text-muted">
        Me prévenir par e-mail 3 jours avant l&apos;expiration de mon crédit Ghost
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        aria-labelledby="wallet-reminder-label"
        disabled={saving}
        onClick={() => toggle(!enabled)}
        className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 ${
          enabled ? "border-accent bg-accent" : "border-border-strong bg-surface2"
        } ${saving ? "opacity-60" : ""}`}
      >
        <span
          className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
            enabled ? "translate-x-6" : "translate-x-1"
          }`}
        />
      </button>
    </div>
  );
}
