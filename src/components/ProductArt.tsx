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
      className={`relative flex items-center justify-center overflow-hidden bg-[#15171f] ${className}`}
      style={{
        backgroundImage:
          "repeating-linear-gradient(135deg,rgba(255,255,255,0.018) 0 8px,transparent 8px 16px)",
      }}
    >
      {showImage ? (
        <img
          src={imageUrl ?? ""}
          alt={label ?? code}
          className="absolute inset-0 h-full w-full object-cover"
          loading="lazy"
          decoding="async"
          onError={() => setFailed(true)}
        />
      ) : (
        <>
          <div className="absolute h-40 w-56 rounded-[30px] bg-[radial-gradient(circle,rgba(62,123,250,0.2),transparent_64%)] blur-3xl" />
          <span className="relative font-mono text-sm tracking-[0.18em] text-[#5a6070] sm:text-lg">
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
