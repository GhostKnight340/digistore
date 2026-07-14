/**
 * Accessible star rating display. Renders 5 stars filled up to `value`
 * (supports halves) with a single visually-hidden label so screen readers
 * announce "4,5 sur 5" rather than five separate icons.
 */
export default function Stars({
  value,
  size = 16,
  className = "",
  label,
}: {
  value: number;
  size?: number;
  className?: string;
  label?: string;
}) {
  const rounded = Math.round(value * 2) / 2;
  return (
    <span className={`inline-flex items-center gap-0.5 ${className}`} role="img" aria-label={label ?? `${value} sur 5`}>
      {[0, 1, 2, 3, 4].map((i) => {
        const fill = Math.min(1, Math.max(0, rounded - i)); // 0, 0.5 or 1
        return <Star key={i} fill={fill} size={size} />;
      })}
    </span>
  );
}

function Star({ fill, size }: { fill: number; size: number }) {
  const gradId = `star-${Math.round(fill * 100)}`;
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      aria-hidden
      className="shrink-0"
    >
      {fill > 0 && fill < 1 && (
        <defs>
          <linearGradient id={gradId}>
            <stop offset="50%" stopColor="#f5b544" />
            <stop offset="50%" stopColor="transparent" />
          </linearGradient>
        </defs>
      )}
      <path
        d="M12 2.5l2.9 5.9 6.5.95-4.7 4.58 1.11 6.47L12 17.9 6.19 20.97 7.3 14.5 2.6 9.92l6.5-.95L12 2.5z"
        fill={fill >= 1 ? "#f5b544" : fill > 0 ? `url(#${gradId})` : "transparent"}
        stroke="#f5b544"
        strokeWidth={1.4}
        strokeLinejoin="round"
      />
    </svg>
  );
}
