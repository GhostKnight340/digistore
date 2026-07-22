/**
 * Coverage notifications (Phase B) — server-only, best-effort Discord.
 *
 * The goal is to REDUCE manual work, so the admin is not pinged for every
 * customer message. `shouldNotify` gates events by the session's notify mode,
 * but URGENT events (account-security, fraud, legal, repeated failures,
 * integration loss, auto-pause, a blocked high-value case) and the coverage-END
 * handoff ALWAYS notify, overriding a "silent" mode. Never throws.
 */

import "server-only";

import { deliverToChannel } from "../discord/deliver";
import type { NotifyMode } from "./coverageConfig";

/** Event categories that map onto the notify-mode gating. */
export type NotifyCategory = "urgent" | "approval" | "periodic" | "ended";

/** Does the session's notify mode permit surfacing an event of this category? */
export function shouldNotify(mode: NotifyMode, category: NotifyCategory): boolean {
  // Urgent + the end-of-coverage handoff always notify, whatever the mode.
  if (category === "urgent" || category === "ended") return true;
  switch (mode) {
    case "urgent_only":
      return false;
    case "approvals_and_urgent":
      return category === "approval";
    case "all_escalations":
      return category === "approval";
    case "periodic_and_urgent":
      return category === "periodic";
    case "silent_until_end":
      return false;
    default:
      return false;
  }
}

export interface CoverageNotifyInput {
  notifyMode: NotifyMode;
  category: NotifyCategory;
  title: string;
  description?: string;
  fields?: { name: string; value: string }[];
}

const CATEGORY_COLOR: Record<NotifyCategory, number> = {
  urgent: 0xe74c3c,
  approval: 0xf1c40f,
  periodic: 0x3498db,
  ended: 0x2ecc71,
};

/**
 * Post a coverage notification to the support-approval channel if the mode
 * permits it. Best-effort: a missing channel / disabled Discord is a silent
 * no-op (returns false), never an error.
 */
export async function notifyCoverage(input: CoverageNotifyInput): Promise<boolean> {
  if (!shouldNotify(input.notifyMode, input.category)) return false;
  try {
    const res = await deliverToChannel(
      { purpose: "support_approval", moduleKey: "support_assistant" },
      {
        embeds: [
          {
            title: input.title.slice(0, 250),
            description: input.description?.slice(0, 1500),
            color: CATEGORY_COLOR[input.category],
            fields: input.fields?.slice(0, 10).map((f) => ({ name: f.name.slice(0, 100), value: f.value.slice(0, 500) || "—" })),
            timestamp: new Date().toISOString(),
          },
        ],
      },
      "support_assistant.coverage",
    );
    return res.ok;
  } catch {
    return false;
  }
}
