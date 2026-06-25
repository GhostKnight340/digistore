import { resolvePreset } from "@/lib/presets";
import type { CategoryId } from "@/lib/types";

export default function ProductArt({
  category,
  backgroundPreset = "",
  className = "",
  label: _label,
}: {
  category: CategoryId | string;
  backgroundPreset?: string;
  className?: string;
  label?: string;
}) {
  const preset = resolvePreset(backgroundPreset, category);

  // Apply only the background preset classes — not .kbg (which forces aspect-ratio: 1/1
  // and border-radius, overriding caller-supplied Tailwind sizing classes).
  // bg-cover + bg-center ensure PNGs display correctly when the PNG file exists.
  return (
    <div
      className={`kbg-css--${preset} kbg--${preset} bg-cover bg-center ${className}`}
    />
  );
}
