import type { CollectionIconKey } from "@/lib/collections/icons";

/**
 * Renders one of the approved collection icon keys as an inline SVG (or the
 * Navigator brand mark). Never renders admin-provided markup — the key is
 * validated upstream (see src/lib/collections/icons.ts). Decorative: the card's
 * name carries meaning, so the icon is aria-hidden.
 */
export default function CollectionIcon({
  name,
  className,
}: {
  name: CollectionIconKey;
  className?: string;
}) {
  if (name === "navigator") {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src="/brand/navigator-icon-64.png"
        alt=""
        width={22}
        height={22}
        className={className}
        loading="lazy"
        decoding="async"
        aria-hidden
      />
    );
  }

  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.9}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      {ICONS[name] ?? ICONS.collection}
    </svg>
  );
}

const ICONS: Record<Exclude<CollectionIconKey, "navigator">, React.ReactNode> = {
  collection: (
    <>
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </>
  ),
  gaming: (
    <>
      <path d="M6 11h4M8 9v4" />
      <path d="M15.5 12h.01M18 10.5h.01" />
      <path d="M17.5 6h-11A4.5 4.5 0 0 0 2 10.5v3A4.5 4.5 0 0 0 6.5 18c1.6 0 2.4-.7 3.2-1.5l.6-.6h3.4l.6.6c.8.8 1.6 1.5 3.2 1.5a4.5 4.5 0 0 0 4.5-4.5v-3A4.5 4.5 0 0 0 17.5 6z" />
    </>
  ),
  gift: (
    <>
      <rect x="3" y="8" width="18" height="4" rx="1" />
      <path d="M5 12v8h14v-8" />
      <path d="M12 8v12" />
      <path d="M12 8S10.5 4 8 4a2 2 0 0 0 0 4h4zM12 8s1.5-4 4-4a2 2 0 0 1 0 4h-4z" />
    </>
  ),
  subscription: (
    <>
      <path d="M21 12a9 9 0 1 1-3-6.7" />
      <path d="M21 4v4h-4" />
    </>
  ),
  software: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M3 9h18" />
      <path d="M8 6.5h.01M11 6.5h.01" />
    </>
  ),
  sparkle: (
    <>
      <path d="M12 3l1.6 4.9L18.5 9.5l-4.9 1.6L12 16l-1.6-4.9L5.5 9.5l4.9-1.6L12 3z" />
      <path d="M18 15l.7 2.1L21 18l-2.3.7L18 21l-.7-2.3L15 18l2.3-.9L18 15z" />
    </>
  ),
  trending: (
    <>
      <path d="M3 17l6-6 4 4 7-7" />
      <path d="M14 8h6v6" />
    </>
  ),
  globe: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18" />
      <path d="M12 3a15 15 0 0 1 0 18a15 15 0 0 1 0-18z" />
    </>
  ),
};
