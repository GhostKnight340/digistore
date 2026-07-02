import { forwardRef } from "react";

export const adminFieldClass =
  "h-[38px] w-full rounded-control border border-white/10 bg-admin-input px-[13px] text-[13.5px] text-text placeholder:text-faint outline-none transition-colors focus:border-accent/30 focus:ring-2 focus:ring-accent/20";

export const AdminInput = forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(function AdminInput({ className = "", ...rest }, ref) {
  return <input ref={ref} className={`${adminFieldClass} ${className}`} {...rest} />;
});

export const AdminSelect = forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement>
>(function AdminSelect({ className = "", ...rest }, ref) {
  return <select ref={ref} className={`${adminFieldClass} ${className}`} {...rest} />;
});

export const AdminTextarea = forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(function AdminTextarea({ className = "", ...rest }, ref) {
  return (
    <textarea
      ref={ref}
      className={`min-h-24 w-full rounded-control border border-white/10 bg-admin-input px-[13px] py-2.5 text-[13.5px] text-text placeholder:text-faint outline-none transition-colors focus:border-accent/30 focus:ring-2 focus:ring-accent/20 ${className}`}
      {...rest}
    />
  );
});

export function FieldLabel({
  children,
  htmlFor,
}: {
  children: React.ReactNode;
  htmlFor?: string;
}) {
  return (
    <label htmlFor={htmlFor} className="mb-1.5 block text-xs text-muted">
      {children}
    </label>
  );
}
