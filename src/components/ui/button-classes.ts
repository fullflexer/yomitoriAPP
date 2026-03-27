import { cn } from "@/lib/utils";

export type ButtonVariant = "default" | "secondary" | "outline" | "ghost" | "link";
export type ButtonSize = "default" | "sm" | "lg" | "icon";

const variantClasses: Record<ButtonVariant, string> = {
  default:
    "bg-slate-900 text-slate-50 shadow-sm hover:bg-slate-800 focus-visible:ring-slate-900",
  secondary:
    "bg-slate-100 text-slate-900 hover:bg-slate-200 focus-visible:ring-slate-400",
  outline:
    "border border-slate-200 bg-white text-slate-900 hover:bg-slate-50 focus-visible:ring-slate-400",
  ghost:
    "text-slate-700 hover:bg-slate-100 hover:text-slate-900 focus-visible:ring-slate-400",
  link: "px-0 text-slate-900 underline-offset-4 hover:underline focus-visible:ring-slate-400"
};

const sizeClasses: Record<ButtonSize, string> = {
  default: "h-10 px-4 py-2",
  sm: "h-9 rounded-md px-3 text-sm",
  lg: "h-11 rounded-lg px-6 text-base",
  icon: "h-10 w-10"
};

export function buttonVariants({
  variant = "default",
  size = "default"
}: {
  variant?: ButtonVariant;
  size?: ButtonSize;
} = {}) {
  return cn(
    "inline-flex items-center justify-center gap-2 rounded-lg text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
    variantClasses[variant],
    sizeClasses[size]
  );
}
