import TrackSectionView from "@/components/analytics/TrackSectionView";
import NavigatorTipCard from "@/components/trust/NavigatorTipCard";
import { selectNavigatorTips, type NavigatorTipSetting } from "@/lib/trust/content";

/**
 * Context-aware Navigator Tips. Given a set of `keywords` describing the
 * surrounding page (category slug, product name, platform, region…), it selects
 * the matching enabled tips and falls back to `general` guidance when nothing
 * more specific applies — so the Navigator feels helpful, never redundant or
 * annoying. Reusable on every page type.
 */
export default function NavigatorTips({
  tips,
  keywords,
  limit = 1,
  includeGeneral = true,
  className = "mt-8",
}: {
  tips: NavigatorTipSetting[];
  keywords: string[];
  limit?: number;
  includeGeneral?: boolean;
  className?: string;
}) {
  const selected = selectNavigatorTips(tips, keywords, { includeGeneral, limit });
  if (selected.length === 0) return null;

  return (
    <section className={className} aria-label="Conseils du Navigator">
      <TrackSectionView
        event="navigator_tip_viewed"
        params={{ tip_id: selected[0]?.id, count: selected.length }}
      />
      <div className="space-y-3">
        {selected.map((tip) => (
          <NavigatorTipCard key={tip.id} tip={tip} />
        ))}
      </div>
    </section>
  );
}
