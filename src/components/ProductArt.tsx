"use client";

import Image from "next/image";
import { useEffect, useState } from "react";

export default function ProductArt({
  category,
  imageUrl,
  label,
  accent,
  className = "",
}: {
  category: string;
  imageUrl?: string | null;
  label?: string;
  /** Brand accent color for the placeholder glow. Defaults to the store blue. */
  accent?: string | null;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const code = category.split(" ")[0].toUpperCase();
  const showImage = Boolean(imageUrl && !failed);
  const glow = accent || "#3e7bfa";

  // Optimize through next/image only for our own Blob store and same-origin
  // sources (the `/api/product-image` byte route, `/uploads` in dev). Anything
  // else — a legacy base64 `data:` URI or an admin-pasted external URL — is
  // passed through untouched so it neither errors on remotePatterns nor needs
  // one. All migrated customer media is a Blob URL and IS optimized.
  const src = imageUrl ?? "";
  const isBlob = /^https:\/\/[^/]+\.public\.blob\.vercel-storage\.com\//.test(src);
  const isSameOrigin = src.startsWith("/");
  const unoptimized = !isBlob && !isSameOrigin;

  useEffect(() => {
    setFailed(false);
  }, [imageUrl]);

  return (
    <div
      className={`relative flex items-center justify-center overflow-hidden bg-[#09090b] ${className}`}
    >
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage: `radial-gradient(circle at 50% 42%, color-mix(in srgb, ${glow} 22%, transparent), color-mix(in srgb, ${glow} 8%, transparent) 34%, rgba(9,9,11,0) 68%)`,
        }}
      />
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(145deg,rgba(255,255,255,0.055),rgba(255,255,255,0)_42%),repeating-linear-gradient(135deg,rgba(255,255,255,0.018)_0_8px,transparent_8px_16px)]" />
      <div className="pointer-events-none absolute inset-px rounded-[inherit] border border-white/[0.035]" />
      {showImage ? (
        <div className="absolute inset-[12%]">
          <Image
            src={src}
            alt={label ?? code}
            fill
            // Product art is displayed in a small, contained box; this keeps
            // next/image from requesting a needlessly large candidate.
            sizes="(max-width: 640px) 45vw, 260px"
            className="object-contain drop-shadow-[0_18px_26px_rgba(0,0,0,0.28)]"
            unoptimized={unoptimized}
            onError={() => setFailed(true)}
          />
        </div>
      ) : (
        <>
          <div
            className="absolute h-40 w-56 rounded-[30px] blur-3xl"
            style={{
              backgroundImage: `radial-gradient(circle, color-mix(in srgb, ${glow} 24%, transparent), transparent 64%)`,
            }}
          />
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
