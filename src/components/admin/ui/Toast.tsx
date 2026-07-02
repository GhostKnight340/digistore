"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";
import { CheckCircle2, AlertTriangle, XCircle, Info, X } from "lucide-react";
import type { Tone } from "@/lib/adminStatus";

type ToastItem = {
  id: number;
  tone: Tone;
  title: string;
  description?: string;
};

const ToastContext = createContext<{
  toast: (tone: Tone, title: string, description?: string) => void;
} | null>(null);

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error("useToast must be used inside <ToastProvider>");
  return context.toast;
}

const TONE_ICON: Record<string, React.ComponentType<{ className?: string; strokeWidth?: number }>> = {
  success: CheckCircle2,
  warning: AlertTriangle,
  danger: XCircle,
  accent: Info,
  neutral: Info,
};

const TONE_TEXT: Record<string, string> = {
  success: "text-success-fg",
  warning: "text-warning",
  danger: "text-danger",
  accent: "text-accent-strong",
  neutral: "text-muted",
};

export default function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const toast = useCallback(
    (tone: Tone, title: string, description?: string) => {
      const id = nextId.current++;
      setToasts((current) => [...current.slice(-3), { id, tone, title, description }]);
      window.setTimeout(() => dismiss(id), 4200);
    },
    [dismiss],
  );

  const value = useMemo(() => ({ toast }), [toast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed bottom-5 right-5 z-[60] flex w-80 flex-col gap-2">
        {toasts.map((item) => {
          const Icon = TONE_ICON[item.tone] ?? Info;
          return (
            <div
              key={item.id}
              className="pointer-events-auto flex items-start gap-2.5 rounded-[11px] border border-white/10 bg-admin-elevated p-3 shadow-toast"
            >
              <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${TONE_TEXT[item.tone]}`} strokeWidth={1.8} />
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-semibold text-text">{item.title}</p>
                {item.description ? (
                  <p className="mt-0.5 break-words text-xs text-muted">{item.description}</p>
                ) : null}
              </div>
              <button
                type="button"
                onClick={() => dismiss(item.id)}
                className="text-faint hover:text-text"
                aria-label="Dismiss"
              >
                <X className="h-3.5 w-3.5" strokeWidth={1.8} />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}
