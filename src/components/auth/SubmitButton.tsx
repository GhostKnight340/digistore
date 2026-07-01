"use client";

export default function SubmitButton({
  loading,
  children,
}: {
  loading?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="submit"
      disabled={loading}
      className="flex h-[52px] w-full items-center justify-center gap-[10px] rounded-[12px] font-semibold text-white transition-transform duration-150 hover:-translate-y-px disabled:cursor-progress disabled:opacity-75"
      style={{
        fontSize: 15,
        background: "linear-gradient(180deg,#4d86ff,#3E7BFA)",
        boxShadow: "0 8px 24px -6px rgba(62,123,250,0.55)",
      }}
    >
      {loading && (
        <span
          className="inline-block h-[17px] w-[17px] animate-spin rounded-full"
          style={{ border: "2.4px solid rgba(255,255,255,0.35)", borderTopColor: "#fff" }}
        />
      )}
      {children}
    </button>
  );
}
