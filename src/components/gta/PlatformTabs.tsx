"use client";

import Link from "next/link";
import { trackEvent } from "@/lib/analytics";
import {
  GTA_CAMPAIGN_ID,
  GTA_PLATFORMS,
  type GtaPlatform,
  type GtaPreorderConfig,
} from "@/lib/gtaPreorder";

/**
 * Premium selectable platform cards. Selection is driven by the `?platform=`
 * query param (server-resolved), so the recommended gift cards below re-render
 * server-side and browser Back/Forward work natively — each card is a real
 * `<Link>`. The click only adds a PII-free analytics event on top of the
 * navigation.
 *
 * `selected` is the currently-active platform (or null when none is chosen).
 * Links point at `?platform=<key>#recommandations` so choosing a platform also
 * scrolls the recommendations into view on mobile.
 */
export default function PlatformTabs({
  platforms,
  selected,
}: {
  platforms: GtaPreorderConfig["platforms"];
  selected: GtaPlatform | null;
}) {
  return (
    <div
      className="grid gap-4 sm:grid-cols-2"
      role="group"
      aria-label="Choisir une plateforme"
    >
      {GTA_PLATFORMS.map((key) => {
        const platform = platforms[key];
        const active = selected === key;
        return (
          <Link
            key={key}
            href={`?platform=${key}#recommandations`}
            aria-pressed={active}
            onClick={() =>
              trackEvent("select_platform", {
                campaign: GTA_CAMPAIGN_ID,
                platform: key,
              })
            }
            className={`group relative flex flex-col rounded-[18px] border p-5 text-left transition sm:p-6 ${
              active
                ? "border-accent bg-accent/10 shadow-[inset_0_0_44px_rgba(62,123,250,0.14)]"
                : "border-border bg-surface hover:border-border-strong hover:bg-surface2"
            }`}
          >
            <span className="flex items-center justify-between gap-3">
              <span className="text-lg font-semibold text-white">
                {platform.label}
              </span>
              <span
                aria-hidden
                className={`grid h-6 w-6 shrink-0 place-items-center rounded-full border text-[13px] ${
                  active
                    ? "border-accent bg-accent text-white"
                    : "border-border-strong text-faint group-hover:text-muted"
                }`}
              >
                {active ? "✓" : ""}
              </span>
            </span>
            <span className="mt-2 text-[13.5px] leading-relaxed text-muted">
              {platform.description}
            </span>
          </Link>
        );
      })}
    </div>
  );
}
