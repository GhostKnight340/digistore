import { getRegion } from "@/lib/regions";
import RegionFlag, { GlobeIcon, UnknownRegionIcon } from "./RegionFlag";

type Variant = "overlay" | "chip";
type Size = "default" | "micro";

export default function RegionBadge({
  code,
  variant,
  size = "default",
  className = "",
}: {
  code?: string | null;
  variant: Variant;
  size?: Size;
  className?: string;
}) {
  const region = getRegion(code);
  const micro = size === "micro";

  if (region.kind === "unknown") {
    return (
      <span
        className={`inline-flex items-center gap-1.5 rounded-lg border border-dashed border-white/25 bg-surface2 text-faint ${
          micro ? "h-[22px] px-2 text-[10px]" : "h-[26px] px-2.5 text-[11px]"
        } font-mono font-semibold tracking-wide ${className}`}
      >
        <UnknownRegionIcon className={micro ? "h-3 w-3" : "h-3.5 w-3.5"} />
        RÉGION ?
      </span>
    );
  }

  if (region.kind === "global") {
    const isOverlay = variant === "overlay";
    return (
      <span
        className={`inline-flex items-center gap-1.5 rounded-lg border border-accent/55 bg-accent/[0.18] text-[#CFE0FF] ${
          micro ? "h-[22px] px-2 text-[9.5px]" : "h-[26px] px-2.5 text-[11px]"
        } font-mono font-semibold tracking-wide ${isOverlay ? "shadow-soft backdrop-blur-md" : ""} ${className}`}
      >
        <GlobeIcon className={micro ? "h-2.5 w-2.5" : "h-3.5 w-3.5"} stroke="#BAD3FF" />
        {micro ? "GLB" : "GLOBAL"}
      </span>
    );
  }

  const isOverlay = variant === "overlay";
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-lg font-mono font-semibold tracking-wide ${
        isOverlay
          ? "border border-white/[0.14] bg-black/[0.74] text-[#EAF0FF] shadow-soft backdrop-blur-md"
          : "border border-border bg-surface2 text-[#EAF0FF]"
      } ${micro ? "h-[22px] px-1.5 text-[9.5px]" : "h-[26px] px-2.5 text-[11px]"} ${className}`}
    >
      <span
        className={`shrink-0 overflow-hidden rounded-[2px] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.18)] ${
          micro ? "h-2.5 w-3.5" : "h-3 w-[17px]"
        }`}
      >
        <RegionFlag code={region.code} />
      </span>
      {region.code}
    </span>
  );
}

/** Bold `(CODE)` suffix appended after a product title, same text node. */
export function regionTitleSuffix(code?: string | null): { label: string; className: string } {
  const region = getRegion(code);
  if (region.kind === "unknown") return { label: "", className: "" };
  const className = region.kind === "global" ? "font-bold text-accent-hover" : "font-bold text-[#8FA3C4]";
  return { label: `(${region.code})`, className };
}
