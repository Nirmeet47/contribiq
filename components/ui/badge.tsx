import * as React from "react";
import { cn } from "@/lib/utils";

type BadgeVariant = "default" | "secondary" | "outline" | "success" | "destructive";

const variantClasses: Record<BadgeVariant, string> = {
  default: "border-transparent bg-zinc-800 text-zinc-200",
  secondary: "border-zinc-800 bg-zinc-900 text-zinc-400",
  outline: "border-zinc-800 text-zinc-400",
  success: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
  destructive: "border-red-500/30 bg-red-500/10 text-red-300",
};

export function Badge({
  className,
  variant = "default",
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { variant?: BadgeVariant }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-sm border px-2 py-1 text-xs font-bold",
        variantClasses[variant],
        className
      )}
      {...props}
    />
  );
}
