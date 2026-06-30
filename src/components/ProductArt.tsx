"use client";

import { useEffect, useState } from "react";

export default function ProductArt({
  category,
  imageUrl,
  label,
  className = "",
}: {
  category: string;
  imageUrl?: string | null;
  label?: string;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const code = category.split(" ")[0].toUpperCase();
  const showImage = Boolean(imageUrl && !failed);

  useEffect(() => {
    setFailed(false);
  }, [imageUrl]);

  return (
    <div
      className={`relative flex items-center justify-center overflow-hidden bg-[#09090b] ${className}`}
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_42%,rgba(62,123,250,0.22),rgba(62,123,250,0.08)_34%,rgba(9,9,11,0)_68%)]" />
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(145deg,rgba(255,255,255,0.055),rgba(255,255,255,0)_42%),repeating-linear-gradient(135deg,rgba(255,255,255,0.018)_0_8px,transparent_8px_16px)]" />
      <div className="pointer-events-none absolute inset-px rounded-[inherit] border border-white/[0.035]" />
      {showImage ? (
        <div className="absolute inset-[12%] flex items-center justify-center">
          <img
            src={imageUrl ?? ""}
            alt={label ?? code}
            className="max-h-full max-w-full object-contain drop-shadow-[0_18px_26px_rgba(0,0,0,0.28)]"
            loading="lazy"
            decoding="async"
            onError={() => setFailed(true)}
          />
        </div>
      ) : (
        <>
          <div className="absolute h-40 w-56 rounded-[30px] bg-[radial-gradient(circle,rgba(62,123,250,0.24),transparent_64%)] blur-3xl" />
          <span className="relative font-mono text-sm tracking-[0.18em] text-[#697082] sm:text-lg">
            {code}
          </span>
        </>
      )}
      {label && !showImage && (
        <span className="absolute right-3 top-2.5 font-mono text-[10px] text-faint">
          [ visuel ]
        </span>
      )}
    </div>
  );
}
