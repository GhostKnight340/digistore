import { forwardRef } from "react";

export type AdminButtonVariant =
  | "primary"
  | "secondary"
  | "danger"
  | "success"
  | "ghost";

const VARIANT_CLASSES: Record<AdminButtonVariant, string> = {
  primary:
    "bg-accent text-white font-semibold shadow-primary-glow hover:bg-accent-hover",
  secondary:
    "bg-admin-input border border-white/[0.12] text-text font-medium hover:bg-admin-elevated",
  danger:
    "bg-danger/[0.08] border border-danger/30 text-danger font-semibold hover:bg-danger/[0.16]",
  success:
    "bg-success text-white font-semibold shadow-success-glow hover:brightness-110",
  ghost: "text-muted hover:text-text hover:bg-white/[0.04]",
};

const SIZE_CLASSES = {
  md: "h-[38px] px-4 text-[13px] rounded-control gap-[7px]",
  sm: "h-[30px] px-3 text-xs rounded-lg gap-1.5",
};

type Props = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: AdminButtonVariant;
  size?: keyof typeof SIZE_CLASSES;
};

const AdminButton = forwardRef<HTMLButtonElement, Props>(function AdminButton(
  { variant = "secondary", size = "md", className = "", type = "button", ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={`inline-flex items-center justify-center whitespace-nowrap transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 disabled:cursor-not-allowed disabled:opacity-55 disabled:shadow-none ${VARIANT_CLASSES[variant]} ${SIZE_CLASSES[size]} ${className}`}
      {...rest}
    />
  );
});

export default AdminButton;
