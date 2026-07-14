"use client";

import NavigatorTip from "@/components/category/NavigatorTip";
import { useTrackOnView } from "@/hooks/useTrackOnView";
import {
  contextTipToNavigatorTip,
  resolveContextTips,
  TRUST_EVENTS,
  type ContextTip,
} from "@/lib/trust/content";

/**
 * Context-aware Navigator tips. Given a free-form `context` (a category slug or
 * name, a product name, campaign keyword…), it selects the relevant tip(s) and
 * renders them with the SAME visual idiom as category pages (the existing
 * `NavigatorTip` component) — helpful, never noisy.
 *
 * When nothing matches and `fallback` is true (default), the safe general tip is
 * shown so the Navigator is always present but restrained. `max` caps how many
 * tips render (default 1) to avoid stacking.
 *
 * ADMIN-READY: the tip catalogue lives in `src/lib/trust/content.ts` and can be
 * swapped for an admin-editable source without touching this component.
 */
export default function NavigatorTips({
  context,
  fallback = true,
  max = 1,
  className = "",
}: {
  context?: string | Array<string | null | undefined>;
  fallback?: boolean;
  max?: number;
  className?: string;
}) {
  const tips = resolveContextTips(context, { fallback }).slice(0, Math.max(1, max));
  if (tips.length === 0) return null;

  return (
    <div className={className}>
      {tips.map((tip) => (
        <TrackedTip key={tip.id} tip={tip} />
      ))}
    </div>
  );
}

function TrackedTip({ tip }: { tip: ContextTip }) {
  const ref = useTrackOnView<HTMLDivElement>(TRUST_EVENTS.tipViewed, {
    tip_id: tip.id,
    tip_type: tip.type,
  });
  return (
    <div ref={ref}>
      <NavigatorTip tip={contextTipToNavigatorTip(tip)} />
    </div>
  );
}
