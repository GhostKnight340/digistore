"use client";

import type { InputHTMLAttributes, ReactNode } from "react";

type CheckboxProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & {
  label: ReactNode;
  wrapperClassName?: string;
};

export default function Checkbox({
  label,
  wrapperClassName = "",
  className = "",
  ...props
}: CheckboxProps) {
  return (
    <label
      className={`group inline-flex cursor-pointer select-none items-center gap-2 text-sm text-muted ${wrapperClassName}`}
    >
      <input type="checkbox" className={`peer sr-only ${className}`} {...props} />
      <span
        aria-hidden
        className="grid h-[18px] w-[18px] shrink-0 place-items-center rounded-md border border-white/25 bg-white/[0.04] text-transparent transition-colors group-hover:border-accent/70 peer-checked:border-accent peer-checked:bg-accent peer-checked:text-white peer-focus-visible:border-accent peer-focus-visible:ring-2 peer-focus-visible:ring-accent/40"
      >
        <CheckIcon />
      </span>
      <span>{label}</span>
    </label>
  );
}

function CheckIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={3}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-3 w-3"
      aria-hidden
    >
      <path d="m5 12.5 4.5 4.5L19 7" />
    </svg>
  );
}
