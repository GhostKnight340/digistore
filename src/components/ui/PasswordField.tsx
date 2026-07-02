"use client";

import { useId, useState } from "react";

type PasswordFieldProps = {
  name: string;
  placeholder?: string;
  autoComplete?: string;
  className?: string;
  label?: string;
  inputClassName?: string;
};

export default function PasswordField({
  name,
  placeholder,
  autoComplete,
  className = "",
  label,
  inputClassName = "input",
}: PasswordFieldProps) {
  const [visible, setVisible] = useState(false);
  const toggleLabel = visible ? "Masquer le mot de passe" : "Afficher le mot de passe";
  const id = useId();

  return (
    <div className={className}>
      {label ? (
        <label htmlFor={id} className="acct-label">
          {label}
        </label>
      ) : null}
      <div className="relative">
        <input
          id={id}
          className={`${inputClassName} pr-12`}
          name={name}
          type={visible ? "text" : "password"}
          placeholder={placeholder}
          autoComplete={autoComplete}
        />
        <button
          type="button"
          aria-label={toggleLabel}
          title={toggleLabel}
          onClick={() => setVisible((value) => !value)}
          className="absolute right-2 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-lg text-muted transition hover:bg-surface2 hover:text-white"
        >
          {visible ? <EyeOffIcon /> : <EyeIcon />}
        </button>
      </div>
    </div>
  );
}

function EyeIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="h-5 w-5" aria-hidden>
      <path d="M2.25 12s3.5-6.25 9.75-6.25S21.75 12 21.75 12 18.25 18.25 12 18.25 2.25 12 2.25 12Z" />
      <circle cx="12" cy="12" r="2.75" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="h-5 w-5" aria-hidden>
      <path d="m3 3 18 18" />
      <path d="M10.58 10.58A2.75 2.75 0 0 0 12 14.75c.73 0 1.43-.29 1.94-.81" />
      <path d="M8.17 5.95A10.9 10.9 0 0 1 12 5.75C18.25 5.75 21.75 12 21.75 12a18.3 18.3 0 0 1-3.37 4.11" />
      <path d="M15.5 18.02a10.3 10.3 0 0 1-3.5.23C5.75 18.25 2.25 12 2.25 12a18.8 18.8 0 0 1 4.5-4.87" />
    </svg>
  );
}
