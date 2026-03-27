import type { HTMLAttributes, ReactNode } from "react";

import { cn } from "@/lib/utils";

type BadgeVariant = "default" | "secondary" | "outline" | "success" | "warning";

const variantClasses: Record<BadgeVariant, string> = {
  default: "bg-slate-900 text-slate-50",
  secondary: "bg-slate-100 text-slate-700",
  outline: "border border-slate-200 text-slate-700",
  success: "bg-emerald-100 text-emerald-800",
  warning: "bg-amber-100 text-amber-800"
};

export function badgeVariants({
  variant = "default"
}: {
  variant?: BadgeVariant;
} = {}) {
  return cn(
    "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium",
    variantClasses[variant]
  );
}

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
  children: ReactNode;
}

export function Badge({
  className,
  variant = "default",
  children,
  ...props
}: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ variant }), className)} {...props}>
      {children}
    </span>
  );
}
