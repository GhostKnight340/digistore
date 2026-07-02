"use client";

export default function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div className="inline-flex items-center gap-0.5 rounded-lg border border-white/[0.08] bg-admin-input p-0.5">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 ${
            option.value === value
              ? "bg-accent/[0.13] font-semibold text-[#EAF0FF] ring-1 ring-inset ring-accent/20"
              : "text-muted hover:text-text"
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
