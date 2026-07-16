import * as React from "react";
import { cn } from "@/lib/utils";

type AlertVariant = "default" | "success" | "destructive";

const variantClasses: Record<AlertVariant, string> = {
  default: "border-zinc-800 bg-zinc-950 text-zinc-300",
  success: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
  destructive: "border-red-500/30 bg-red-500/10 text-red-300",
};

export type AlertProps = React.HTMLAttributes<HTMLDivElement> & {
  variant?: AlertVariant;
};

export const Alert = React.forwardRef<HTMLDivElement, AlertProps>(
  ({ className, variant = "default", ...props }, ref) => (
    <div
      ref={ref}
      role="alert"
      className={cn("rounded-sm border p-4 text-sm font-medium", variantClasses[variant], className)}
      {...props}
    />
  )
);
Alert.displayName = "Alert";

export const AlertTitle = React.forwardRef<HTMLHeadingElement, React.HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => (
    <h5 ref={ref} className={cn("mb-1 font-bold leading-none tracking-tight", className)} {...props} />
  )
);
AlertTitle.displayName = "AlertTitle";

export const AlertDescription = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
  ({ className, ...props }, ref) => (
    <p ref={ref} className={cn("text-sm leading-6 opacity-90", className)} {...props} />
  )
);
AlertDescription.displayName = "AlertDescription";
