export default function Skeleton({ className = "" }: { className?: string }) {
  return (
    <div
      className={`animate-pulse2 rounded-lg bg-white/[0.05] ${className}`}
      aria-hidden
    />
  );
}
