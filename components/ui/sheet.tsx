"use client";

import * as React from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export function Sheet({ open, children }: { open: boolean; children: React.ReactNode }) {
  return (
    <div
      className={cn(
        "fixed inset-0 z-50 transition-all duration-200",
        open ? "pointer-events-auto visible" : "pointer-events-none invisible"
      )}
      aria-hidden={!open}
    >
      {children}
    </div>
  );
}

export function SheetOverlay({
  open,
  onClick,
  className,
}: {
  open: boolean;
  onClick?: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      aria-label="Close panel"
      onClick={onClick}
      className={cn(
        "hidden",
        open ? "opacity-100" : "opacity-0",
        className
      )}
    />
  );
}

export function SheetContent({
  open,
  children,
  className,
}: {
  open: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <aside
      role="dialog"
      aria-modal="false"
      className={cn(
        "absolute bottom-4 right-4 flex h-[min(680px,calc(100vh-2rem))] w-[calc(100vw-2rem)] max-w-[440px] flex-col overflow-hidden rounded-sm border border-zinc-800 bg-zinc-950 shadow-2xl shadow-black/60 transition-transform duration-200",
        open ? "translate-x-0" : "translate-x-[calc(100%+1.25rem)]",
        className
      )}
    >
      {children}
    </aside>
  );
}

export function SheetHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("border-b border-zinc-800 p-5", className)} {...props} />;
}

export function SheetTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h2 className={cn("text-lg font-bold tracking-tight text-white", className)} {...props} />;
}

export function SheetDescription({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("mt-1 text-sm leading-6 text-zinc-400", className)} {...props} />;
}

export function SheetClose({ onClick }: { onClick: () => void }) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      onClick={onClick}
      aria-label="Close panel"
      title="Close"
      className="text-zinc-400"
    >
      <X className="h-4 w-4" />
    </Button>
  );
}
