"use client";

import { useEffect } from "react";

export default function Drawer({
  open,
  onClose,
  children,
  widthClassName = "w-full max-w-[900px]",
}: {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  widthClassName?: string;
}) {
  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button
        type="button"
        aria-label="Fermer"
        onClick={onClose}
        className="absolute inset-0 bg-black/60 backdrop-blur-[1px]"
      />
      <div
        role="dialog"
        aria-modal="true"
        className={`relative flex h-full flex-col border-l border-border bg-base shadow-[0_0_80px_rgba(0,0,0,0.6)] ${widthClassName}`}
      >
        {children}
      </div>
    </div>
  );
}
