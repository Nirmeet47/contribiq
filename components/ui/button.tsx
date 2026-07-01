import * as React from "react";
import { cn } from "@/lib/utils";

type ButtonVariant = "default" | "secondary" | "outline" | "ghost" | "destructive";
type ButtonSize = "default" | "sm" | "icon";

const variantClasses: Record<ButtonVariant, string> = {
  default: "bg-emerald-500 text-zinc-950 shadow-sm shadow-emerald-950/40 hover:bg-emerald-400",
  secondary: "bg-zinc-900 text-zinc-100 hover:bg-zinc-800",
  outline: "border border-zinc-800 bg-zinc-950 text-zinc-300 hover:border-zinc-700 hover:text-white",
  ghost: "text-zinc-400 hover:bg-zinc-900 hover:text-white",
  destructive: "bg-red-500/15 text-red-300 hover:bg-red-500/25",
};

const sizeClasses: Record<ButtonSize, string> = {
  default: "h-10 px-4 py-2",
  sm: "h-8 px-3 text-xs",
  icon: "h-9 w-9",
};

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "default", size = "default", ...props }, ref) => (
    <button
      ref={ref}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-sm text-sm font-bold transition-colors disabled:pointer-events-none disabled:opacity-50",
        variantClasses[variant],
        sizeClasses[size],
        className
      )}
      {...props}
    />
  )
);
Button.displayName = "Button";
