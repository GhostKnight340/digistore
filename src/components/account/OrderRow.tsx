import Link from "next/link";

function platformCode(seed: string) {
  const s = seed.toLowerCase();
  if (s.includes("steam")) return "STEAM";
  if (s.includes("playstation") || s.includes("psn")) return "PSN";
  if (s.includes("xbox")) return "XBOX";
  if (s.includes("nintendo") || s.includes("eshop") || s.includes("switch")) return "NTND";
  if (s.includes("google") || s.includes("play")) return "GPLAY";
  if (s.includes("apple") || s.includes("itunes")) return "APPLE";
  if (s.includes("netflix")) return "NFLX";
  if (s.includes("spotify")) return "SPTFY";
  const letters = seed.replace(/[^a-z0-9]/gi, "").slice(0, 4).toUpperCase();
  return letters || "GHOST";
}

function frenchDate(value: Date) {
  return new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(value);
}

/**
 * Order row used in the dashboard "Commandes récentes" list and the full
 * Orders page. Matches the redesign: platform thumbnail, product name + mono
 * meta line, status pill, and mono amount. Pass `action` to append a trailing
 * button (e.g. "Voir le code") on the Orders page.
 */
export function OrderRow({
  href,
  title,
  reference,
  createdAt,
  amount,
  statusLabel,
  statusClass,
  thumbSeed,
  action,
}: {
  href: string;
  title: string;
  reference: string;
  createdAt: Date;
  amount: string;
  statusLabel: string;
  statusClass: string;
  thumbSeed: string;
  action?: React.ReactNode;
}) {
  const code = platformCode(thumbSeed);
  return (
    <Link
      href={href}
      className="flex items-center gap-3.5 rounded-[13px] border border-border bg-base/50 px-4 py-3.5 transition-all duration-150 hover:border-border-strong"
    >
      <span
        className="grid h-11 w-11 shrink-0 place-items-center rounded-[11px] font-mono text-[10px] font-medium text-faint"
        style={{
          backgroundImage:
            "repeating-linear-gradient(135deg, #14161d 0 8px, #10121a 8px 16px)",
        }}
      >
        {code}
      </span>

      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-white">{title}</span>
        <span className="mt-0.5 block truncate font-mono text-xs text-faint">
          {reference} · {frenchDate(createdAt)}
        </span>
      </span>

      <span
        className={`hidden shrink-0 rounded-full border px-2.5 py-1 text-[11.5px] font-semibold sm:inline-flex ${statusClass}`}
      >
        {statusLabel}
      </span>

      <span className="shrink-0 text-right font-mono text-sm font-semibold text-white">{amount}</span>

      {action}
    </Link>
  );
}
