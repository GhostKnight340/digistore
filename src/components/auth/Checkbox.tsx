"use client";

export default function Checkbox({
  checked,
  onChange,
  children,
  align = "center",
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  children: React.ReactNode;
  align?: "center" | "start";
}) {
  return (
    <label className={`inline-flex ${align === "start" ? "items-start" : "items-center"} cursor-pointer select-none gap-[9px]`}>
      <span
        onClick={() => onChange(!checked)}
        className="mt-px flex h-[19px] w-[19px] flex-shrink-0 items-center justify-center rounded-[6px]"
        style={{
          background: checked ? "#3E7BFA" : "#0E0F15",
          border: checked ? "1px solid #3E7BFA" : "1px solid rgba(255,255,255,0.16)",
          transition: "all .16s ease",
        }}
      >
        {checked && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={3}><path d="M20 6L9 17l-5-5" /></svg>}
      </span>
      <span>{children}</span>
    </label>
  );
}
