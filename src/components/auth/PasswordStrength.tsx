export function scorePassword(p: string): number {
  if (!p) return 0;
  let s = 0;
  if (p.length >= 8) s++;
  if (/[A-Za-z]/.test(p) && /\d/.test(p)) s++;
  if (/[^A-Za-z0-9]/.test(p)) s++;
  if (p.length >= 12) s++;
  return Math.min(s, 4);
}

const MAP: Record<number, { c: string; l: string }> = {
  1: { c: "#f0616d", l: "Faible" },
  2: { c: "#f5a524", l: "Moyen" },
  3: { c: "#5E92FF", l: "Bon" },
  4: { c: "#2fbf71", l: "Excellent" },
};

export default function PasswordStrength({ password }: { password: string }) {
  if (!password) return null;
  const score = scorePassword(password);
  const meta = MAP[score] ?? { c: "#8891a3", l: "—" };

  return (
    <div className="-mt-1 mb-4">
      <div className="mb-[7px] flex gap-[5px]">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-1 flex-1 rounded-full" style={{ background: score >= i ? meta.c : "rgba(255,255,255,0.09)", transition: "background .25s ease" }} />
        ))}
      </div>
      <div className="flex items-center justify-between" style={{ fontSize: 12 }}>
        <span style={{ color: "#8891a3" }}>Sécurité du mot de passe</span>
        <span style={{ color: meta.c, fontWeight: 600 }}>{meta.l}</span>
      </div>
    </div>
  );
}
