import type { Tone } from "@/lib/adminStatus";

const TONE_CLASSES: Record<Tone, string> = {
  accent: "bg-accent/[0.13] border-accent/30 text-[#9FB8FF]",
  success: "bg-success/[0.14] border-success/[0.28] text-success-fg",
  warning: "bg-warning/[0.14] border-warning/[0.28] text-warning",
  danger: "bg-danger/10 border-danger/[0.28] text-danger",
  neutral: "bg-white/[0.05] border-white/10 text-muted",
};

const DOT_CLASSES: Record<Tone, string> = {
  accent: "bg-accent",
  success: "bg-success-fg",
  warning: "bg-warning",
  danger: "bg-danger",
  neutral: "bg-muted",
};

export default function Badge({
  tone = "neutral",
  dot = false,
  mono = false,
  children,
  className = "",
}: {
  tone?: Tone;
  dot?: boolean;
  mono?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-chip border px-2 py-0.5 text-[11px] font-semibold ${
        mono ? "font-mono" : ""
      } ${TONE_CLASSES[tone]} ${className}`}
    >
      {dot ? <span className={`h-1.5 w-1.5 rounded-full ${DOT_CLASSES[tone]}`} /> : null}
      {children}
    </span>
  );
}
