import { getCategory } from "@/lib/products";
import type { CategoryId } from "@/lib/types";
/**
 * Placeholder product/category artwork. Phase 1 ships no real images, so we
 * render a premium branded placeholder tile.
 */
export default function ProductArt({
  category,
  label,
  className = "",
}: {
  category: CategoryId;
  label?: string;
  className?: string;
}) {
  const cat = getCategory(category);
  const code = (cat?.name ?? category).split(" ")[0].toUpperCase();

  return (
    <div
      className={`relative flex items-center justify-center overflow-hidden bg-[#15171f] ${className}`}
      style={{
        backgroundImage:
          "repeating-linear-gradient(135deg,rgba(255,255,255,0.018) 0 8px,transparent 8px 16px)",
      }}
    >
      <div className="absolute h-40 w-56 rounded-[30px] bg-[radial-gradient(circle,rgba(62,123,250,0.2),transparent_64%)] blur-3xl" />
      <span className="relative font-mono text-sm tracking-[0.18em] text-[#5a6070] sm:text-lg">
        {code}
      </span>
      {label && (
        <span className="absolute right-3 top-2.5 font-mono text-[10px] text-faint">
          [ visuel ]
        </span>
      )}
    </div>
  );
}
