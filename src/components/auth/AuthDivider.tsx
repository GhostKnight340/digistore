export default function AuthDivider({ label = "Ou continuer avec votre e-mail" }: { label?: string }) {
  return (
    <div className="my-[22px] flex items-center gap-[14px]">
      <div className="h-px flex-1" style={{ background: "rgba(255,255,255,0.09)" }} />
      <span className="whitespace-nowrap" style={{ fontSize: 12.5, color: "#646A77" }}>{label}</span>
      <div className="h-px flex-1" style={{ background: "rgba(255,255,255,0.09)" }} />
    </div>
  );
}
