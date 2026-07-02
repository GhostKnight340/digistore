"use client";

import { useEffect, useRef } from "react";

export default function Modal({
  title,
  description,
  onClose,
  children,
  wide = false,
}: {
  title: string;
  description?: string;
  onClose: () => void;
  children: React.ReactNode;
  wide?: boolean;
}) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      previous?.focus();
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/60 px-4 py-8 backdrop-blur-[2px]"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`max-h-[90vh] w-full overflow-y-auto rounded-xl border border-white/10 bg-admin-elevated p-4 shadow-modal outline-none ${
          wide ? "max-w-2xl" : "max-w-[440px]"
        }`}
      >
        <div className="mb-3">
          <h2 className="text-[13.5px] font-semibold text-text">{title}</h2>
          {description ? <p className="mt-1 text-xs text-muted">{description}</p> : null}
        </div>
        {children}
      </div>
    </div>
  );
}
