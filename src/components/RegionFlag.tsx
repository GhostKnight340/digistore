// Hand-drawn flag SVGs (viewBox 0 0 60 40) — simplified but recognizable.
// Deliberately not emoji flags: emoji flag glyphs render inconsistently
// across OS/browsers (Windows/Chrome shows them as bare letter codes).

function starPoints(cx: number, cy: number, outer: number, inner: number, rot = 0) {
  const pts: string[] = [];
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = (Math.PI / 5) * i - Math.PI / 2 + rot;
    pts.push(`${(cx + r * Math.cos(a)).toFixed(2)},${(cy + r * Math.sin(a)).toFixed(2)}`);
  }
  return pts.join(" ");
}

function FlagShape({ code }: { code: string }) {
  switch (code) {
    case "FR":
      return (
        <>
          <rect width={60} height={40} fill="#fff" />
          <rect width={20} height={40} fill="#0055A4" />
          <rect x={40} width={20} height={40} fill="#EF4135" />
        </>
      );
    case "MA":
      return (
        <>
          <rect width={60} height={40} fill="#C1272D" />
          <polygon points={starPoints(30, 21, 12, 4.9)} fill="#006233" />
        </>
      );
    case "US": {
      const h = 40 / 13;
      const stripes = [];
      for (let i = 0; i < 13; i += 2) {
        stripes.push(<rect key={`r${i}`} y={i * h} width={60} height={h} fill="#B22234" />);
      }
      const stars = [];
      let n = 0;
      for (let r = 0; r < 4; r++) {
        for (let c = 0; c < 5; c++) {
          stars.push(<circle key={`s${n++}`} cx={3 + c * 5} cy={3 + r * 5} r={1.05} fill="#fff" />);
        }
      }
      return (
        <>
          <rect width={60} height={40} fill="#fff" />
          {stripes}
          <rect width={26} height={7 * h} fill="#3C3B6E" />
          {stars}
        </>
      );
    }
    case "UK":
      return (
        <>
          <rect width={60} height={40} fill="#012169" />
          <path d="M0,0 60,40 M60,0 0,40" stroke="#fff" strokeWidth={8} fill="none" />
          <path d="M0,0 60,40 M60,0 0,40" stroke="#C8102E" strokeWidth={3.2} fill="none" />
          <rect x={25} width={10} height={40} fill="#fff" />
          <rect y={15} width={60} height={10} fill="#fff" />
          <rect x={27} width={6} height={40} fill="#C8102E" />
          <rect y={17} width={60} height={6} fill="#C8102E" />
        </>
      );
    case "TR":
      return (
        <>
          <rect width={60} height={40} fill="#E30A17" />
          <circle cx={27} cy={20} r={10} fill="#fff" />
          <circle cx={31} cy={20} r={8} fill="#E30A17" />
          <polygon points={starPoints(41, 20, 4.4, 1.8)} fill="#fff" />
        </>
      );
    case "SA":
      return (
        <>
          <rect width={60} height={40} fill="#006C35" />
          <rect x={14} y={25} width={34} height={2.4} rx={1.2} fill="#fff" />
          <rect x={13.4} y={23.8} width={4} height={4.8} rx={1} fill="#fff" />
          <rect x={16} y={13.5} width={28} height={5.4} rx={2.7} fill="#fff" />
        </>
      );
    case "UAE":
      return (
        <>
          <rect width={60} height={40} fill="#00732F" />
          <rect y={13.33} width={60} height={13.33} fill="#fff" />
          <rect y={26.66} width={60} height={13.34} fill="#000" />
          <rect width={16} height={40} fill="#FF0000" />
        </>
      );
    case "EU": {
      const stars = [];
      for (let i = 0; i < 12; i++) {
        const a = (Math.PI / 6) * i - Math.PI / 2;
        stars.push(
          <polygon
            key={`e${i}`}
            points={starPoints(30 + 13 * Math.cos(a), 20 + 13 * Math.sin(a), 2.6, 1.05)}
            fill="#FFCC00"
          />,
        );
      }
      return (
        <>
          <rect width={60} height={40} fill="#003399" />
          {stars}
        </>
      );
    }
    default:
      return <rect width={60} height={40} fill="#20242E" />;
  }
}

export default function RegionFlag({ code, className }: { code: string; className?: string }) {
  return (
    <svg
      viewBox="0 0 60 40"
      width="100%"
      height="100%"
      preserveAspectRatio="none"
      className={className}
      style={{ display: "block" }}
      aria-hidden
    >
      <FlagShape code={code} />
    </svg>
  );
}

export function GlobeIcon({ className, stroke = "currentColor" }: { className?: string; stroke?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth={1.9} className={className} aria-hidden>
      <circle cx={12} cy={12} r={9} />
      <path d="M3 12h18" />
      <path d="M12 3a15 15 0 0 1 0 18 15 15 0 0 1 0-18" />
    </svg>
  );
}

export function UnknownRegionIcon({ className, stroke = "currentColor" }: { className?: string; stroke?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth={2} className={className} aria-hidden>
      <circle cx={12} cy={12} r={9} />
      <path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 2.5-3 2.5M12 17h.01" />
    </svg>
  );
}
