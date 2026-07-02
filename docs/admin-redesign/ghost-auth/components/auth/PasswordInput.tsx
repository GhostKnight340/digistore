"use client";

import { useState } from "react";
import FormField, { LockIcon } from "./FormField";

export default function PasswordInput({
  label,
  value,
  onChange,
  onBlur,
  error,
  valid,
  placeholder = "Minimum 8 caractères",
  labelRight,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  onBlur?: () => void;
  error?: string;
  valid?: boolean;
  placeholder?: string;
  labelRight?: React.ReactNode;
}) {
  const [show, setShow] = useState(false);

  const toggle = (
    <button
      type="button"
      onClick={() => setShow((s) => !s)}
      aria-label={show ? "Masquer le mot de passe" : "Afficher le mot de passe"}
      className="flex h-[30px] w-[30px] flex-shrink-0 items-center justify-center border-none bg-transparent"
      style={{ color: "#8891a3", cursor: "pointer" }}
    >
      {show ? (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" /><circle cx="12" cy="12" r="3" /></svg>
      ) : (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M2 12s3.5-7 10-7c2.2 0 4.1.8 5.7 1.9M22 12s-3.5 7-10 7c-2.2 0-4.1-.8-5.7-1.9" /><path d="M9.5 9.5a3 3 0 0 0 4.2 4.2" /><line x1="3" y1="3" x2="21" y2="21" /></svg>
      )}
    </button>
  );

  return (
    <FormField
      label={label}
      icon={LockIcon}
      type={show ? "text" : "password"}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onBlur={onBlur}
      placeholder={placeholder}
      error={error}
      valid={valid}
      labelRight={labelRight}
      trailing={toggle}
    />
  );
}
