"use client";

type ToggleSwitchProps = {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  checkedLabel?: string;
  uncheckedLabel?: string;
  disabled?: boolean;
  size?: "sm" | "md";
  small?: boolean;
  showState?: boolean;
  className?: string;
};

export default function ToggleSwitch({
  checked,
  onChange,
  label,
  checkedLabel = "Activé",
  uncheckedLabel = "Désactivé",
  disabled = false,
  size = "md",
  small = false,
  showState = true,
  className = "",
}: ToggleSwitchProps) {
  const stateLabel = checked ? checkedLabel : uncheckedLabel;
  const isSmall = small || size === "sm";

  return (
    <div className={`inline-flex items-center gap-2.5 ${className}`}>
      {label && (
        <span className="text-sm font-medium text-muted">
          {label}
        </span>
      )}
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label ? `${label}: ${stateLabel}` : stateLabel}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative shrink-0 rounded-full border transition-colors duration-200 outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50 ${
          isSmall ? "h-5 w-9" : "h-6 w-11"
        } ${
          checked
            ? "border-accent bg-accent"
            : "border-border-strong bg-surface2"
        }`}
      >
        <span
          className={`absolute left-0.5 top-0.5 rounded-full bg-white shadow-sm transition-transform duration-200 ${
            isSmall ? "h-4 w-4" : "h-5 w-5"
          } ${checked ? (isSmall ? "translate-x-4" : "translate-x-5") : "translate-x-0"}`}
        />
      </button>
      {showState && (
        <span
          className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${
            checked
              ? "border-accent/30 bg-accent/10 text-accent"
              : "border-border bg-surface text-muted"
          }`}
        >
          {stateLabel}
        </span>
      )}
    </div>
  );
}
