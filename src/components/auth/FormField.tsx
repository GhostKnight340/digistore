"use client";

import { InputHTMLAttributes, ReactNode, useState } from "react";

type Props = {
  label: string;
  icon: ReactNode;
  error?: string;
  valid?: boolean;
  labelRight?: ReactNode;
  trailing?: ReactNode; // e.g. password toggle
} & InputHTMLAttributes<HTMLInputElement>;

export default function FormField({ label, icon, error, valid, labelRight, trailing, ...input }: Props) {
  const [focused, setFocused] = useState(false);
  const borderColor = error
    ? "#f0616d"
    : focused
    ? "#3E7BFA"
    : valid
    ? "rgba(47,191,113,0.55)"
    : "rgba(255,255,255,0.10)";

  return (
    <div className="mb-4">
      <div className="mb-2 flex items-center justify-between">
        <label style={{ fontSize: 13, fontWeight: 500, color: "#C4C9D4" }}>{label}</label>
        {labelRight}
      </div>
      <div
        className="relative flex h-[50px] items-center rounded-[12px] px-[14px]"
        style={{
          background: "#0E0F15",
          border: `1px solid ${borderColor}`,
          boxShadow: focused ? "0 0 0 3px rgba(62,123,250,0.16)" : "none",
          transition: "border-color .18s ease, box-shadow .18s ease",
        }}
      >
        <span className="flex-shrink-0">{icon}</span>
        <input
          {...input}
          onFocus={(e) => { setFocused(true); input.onFocus?.(e); }}
          onBlur={(e) => { setFocused(false); input.onBlur?.(e); }}
          className="h-full flex-1 border-none bg-transparent px-[10px] outline-none"
          style={{ color: "#F3F4F7", fontSize: 14.5 }}
        />
        {valid && !trailing && (
          <svg className="flex-shrink-0" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#2fbf71" strokeWidth={2.4}><path d="M20 6L9 17l-5-5" /></svg>
        )}
        {trailing}
      </div>
      {error && (
        <div className="mt-[7px] flex items-center gap-[6px]" style={{ fontSize: 12.5, color: "#f0616d" }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#f0616d" strokeWidth={2.4}><circle cx="12" cy="12" r="10" /><path d="M12 8v5M12 16.5v.5" /></svg>
          {error}
        </div>
      )}
    </div>
  );
}

export const MailIcon = <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#646A77" strokeWidth={2}><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 7l9 6 9-6" /></svg>;
export const LockIcon = <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#646A77" strokeWidth={2}><rect x="4" y="10" width="16" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></svg>;
export const UserIcon = <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#646A77" strokeWidth={2}><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 4-6 8-6s8 2 8 6" /></svg>;
