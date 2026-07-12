/**
 * Navigator loading state per the brand handoff: a 48px mascot bobbing ±6px
 * inside a 92px spinner ring (2px; track #16213a, head #3b82f6; 1.1s linear).
 * The float/spin are neutralized under prefers-reduced-motion by the global
 * rule in globals.css. Carries role="status" + aria-live so the label is
 * announced; the mascot itself is decorative (alt="").
 */
export default function NavigatorLoader({
  label = "Préparation de votre commande…",
  className = "",
}: {
  label?: string;
  className?: string;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={`flex flex-col items-center justify-center gap-4 py-16 text-center ${className}`}
    >
      <span className="relative grid h-[92px] w-[92px] place-items-center">
        {/* Spinner ring: full track + a brighter head via a conic gradient mask. */}
        <span
          aria-hidden
          className="navigator-loader__ring absolute inset-0 rounded-full"
          style={{
            border: "2px solid #16213a",
            borderTopColor: "#3b82f6",
          }}
        />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/brand/navigator-icon-64.png"
          alt=""
          width={48}
          height={48}
          className="navigator-loader__mascot h-12 w-12"
        />
      </span>
      <p className="text-sm text-muted">{label}</p>
    </div>
  );
}
