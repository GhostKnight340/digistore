import { getRegion, regionNoteCopy } from "@/lib/regions";
import RegionFlag, { GlobeIcon, UnknownRegionIcon } from "./RegionFlag";

/** Region panel shown on the product detail page, above the buy button. */
export default function RegionPanel({ code }: { code?: string | null }) {
  const region = getRegion(code);
  const note = regionNoteCopy(code);

  const panelTone =
    region.kind === "unknown"
      ? "border-border bg-surface"
      : region.restricted
        ? "border-border bg-surface"
        : "border-accent/30 bg-gradient-to-b from-accent/[0.08] to-accent/[0.02]";

  const noteTone =
    region.kind === "unknown"
      ? "border-border bg-surface2 text-faint"
      : region.restricted
        ? "border-[#F7B14A]/25 bg-[#F7B14A]/[0.07] text-[#D9B27C]"
        : "border-[#2EA067]/25 bg-[#2EA067]/[0.08] text-[#8FD3AC]";

  return (
    <div className={`overflow-hidden rounded-2xl border ${panelTone}`}>
      <div className="flex items-center gap-3 px-4 py-3.5">
        <span className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-xl border border-border bg-surface2">
          {region.kind === "global" ? (
            <GlobeIcon className="h-[22px] w-[22px]" stroke="#9FB8FF" />
          ) : region.kind === "unknown" ? (
            <UnknownRegionIcon className="h-[22px] w-[22px] text-faint" />
          ) : (
            <span className="h-[19px] w-7 overflow-hidden rounded-[3px] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.22)]">
              <RegionFlag code={region.code} />
            </span>
          )}
        </span>
        <div className="min-w-0 flex-1">
          <div className="mb-0.5 text-[11px] uppercase tracking-wide text-faint">Région</div>
          <div className="flex items-center gap-2 text-base font-semibold text-text">
            {region.name}
            {region.code && (
              <span className="rounded-md border border-border bg-surface2 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-muted">
                {region.code}
              </span>
            )}
          </div>
        </div>
      </div>
      <div className={`flex items-start gap-2.5 border-t px-4 py-3.5 text-[13px] leading-relaxed ${noteTone}`}>
        {region.kind === "unknown" ? (
          <UnknownRegionIcon className="mt-0.5 h-4 w-4 shrink-0" />
        ) : region.restricted ? (
          <svg viewBox="0 0 24 24" fill="none" stroke="#F7B14A" strokeWidth={2} className="mt-0.5 h-4 w-4 shrink-0" aria-hidden>
            <path d="M12 9v4M12 17h.01" />
            <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" fill="none" stroke="#5BC98C" strokeWidth={2.2} className="mt-0.5 h-4 w-4 shrink-0" aria-hidden>
            <polyline points="20 6 9 17 4 12" />
          </svg>
        )}
        <span>{note}</span>
      </div>
    </div>
  );
}
