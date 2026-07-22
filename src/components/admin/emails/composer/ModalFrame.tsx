"use client";

import type { ReactNode } from "react";

/**
 * Centered overlay on desktop, bottom sheet on mobile (`sheet`). Scoped to the
 * nearest positioned ancestor so it respects the admin shell frame. Click-outside
 * closes unless `dismissable` is false (e.g. while sending).
 */
export default function ModalFrame({
  title,
  sheet,
  dismissable = true,
  onClose,
  children,
  footer,
}: {
  title: string;
  sheet: boolean;
  dismissable?: boolean;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div
      className={`absolute inset-0 z-50 flex bg-black/60 ${sheet ? "flex-col" : "items-center justify-center p-4"}`}
      onClick={() => dismissable && onClose()}
    >
      <div
        className={`flex max-h-full flex-col overflow-hidden border-border bg-[#0C0D11] ${
          sheet ? "mt-auto max-h-[85vh] rounded-t-2xl border-t" : "w-full max-w-lg rounded-2xl border"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {sheet && <div className="mx-auto mt-3 h-1 w-10 rounded-full bg-border-strong" />}
        <div className="flex items-center justify-between border-b border-border p-4">
          <h2 className="text-base font-semibold text-text">{title}</h2>
          {dismissable && (
            <button type="button" onClick={onClose} aria-label="Fermer" className="text-muted hover:text-text">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
            </button>
          )}
        </div>
        <div className="flex-1 overflow-y-auto p-4">{children}</div>
        {footer && <div className="border-t border-border p-4">{footer}</div>}
      </div>
    </div>
  );
}
