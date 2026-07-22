"use client";

import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type PaginationControlsProps = {
  page: number;
  totalPages?: number;
  hasPreviousPage: boolean;
  hasNextPage: boolean;
  onPageChange: (page: number) => void;
  label?: string;
};

function visiblePages(page: number, totalPages: number) {
  const pageWindowSize = 5;
  const windowStart = Math.floor((page - 1) / pageWindowSize) * pageWindowSize + 1;
  const windowEnd = Math.min(totalPages, windowStart + pageWindowSize - 1);

  return Array.from({ length: windowEnd - windowStart + 1 }, (_, index) => windowStart + index);
}

function IconButton({
  children,
  disabled,
  onClick,
  label,
}: {
  children: ReactNode;
  disabled: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="inline-flex h-10 w-10 items-center justify-center rounded-sm border border-zinc-800 bg-zinc-950 text-white transition-colors hover:border-emerald-500/70 hover:text-emerald-200 disabled:cursor-not-allowed disabled:text-zinc-600 disabled:hover:border-zinc-800"
    >
      {children}
    </button>
  );
}

export function PaginationControls({
  page,
  totalPages,
  hasPreviousPage,
  hasNextPage,
  onPageChange,
  label,
}: PaginationControlsProps) {
  const boundedTotalPages = totalPages ? Math.max(1, totalPages) : undefined;
  const pages = boundedTotalPages ? visiblePages(page, boundedTotalPages) : [];

  return (
    <div className="flex w-full flex-col items-center justify-center gap-4 border-t border-zinc-900 pt-5 text-center">
      <p className="text-sm font-bold text-white">
        {label ?? "Page"} {page}
        {boundedTotalPages ? <span className="text-zinc-400"> of {boundedTotalPages}</span> : null}
      </p>

      {boundedTotalPages ? (
        <div className="mx-auto flex w-fit items-center justify-center gap-2 rounded-sm border border-zinc-800 bg-zinc-950 p-2 shadow-sm shadow-black/20">
          <IconButton
            label="First page"
            disabled={!hasPreviousPage}
            onClick={() => onPageChange(1)}
          >
            <ChevronsLeft className="h-4 w-4" />
          </IconButton>
          <IconButton
            label="Previous page"
            disabled={!hasPreviousPage}
            onClick={() => onPageChange(Math.max(1, page - 1))}
          >
            <ChevronLeft className="h-4 w-4" />
          </IconButton>

          {pages.map((item) => (
            <button
              key={item}
              type="button"
              aria-current={item === page ? "page" : undefined}
              onClick={() => onPageChange(item)}
              className={cn(
                "inline-flex h-10 w-10 items-center justify-center rounded-sm border text-sm font-bold tabular-nums transition-colors",
                item === page
                  ? "border-emerald-400 bg-emerald-500 text-zinc-950 shadow-sm shadow-emerald-950/40"
                  : "border-zinc-800 bg-zinc-950 text-white hover:border-emerald-500/70 hover:text-emerald-200",
              )}
            >
              {item}
            </button>
          ))}

          <IconButton
            label="Next page"
            disabled={!hasNextPage}
            onClick={() => onPageChange(page + 1)}
          >
            <ChevronRight className="h-4 w-4" />
          </IconButton>
          <IconButton
            label="Last page"
            disabled={!hasNextPage}
            onClick={() => onPageChange(boundedTotalPages)}
          >
            <ChevronsRight className="h-4 w-4" />
          </IconButton>
        </div>
      ) : (
        <div className="flex justify-center gap-3">
          <button
            type="button"
            disabled={!hasPreviousPage}
            onClick={() => onPageChange(Math.max(1, page - 1))}
            className="h-10 rounded-sm border border-zinc-800 bg-zinc-950 px-4 text-sm font-bold text-white transition-colors hover:border-emerald-500/70 hover:text-emerald-200 disabled:cursor-not-allowed disabled:text-zinc-600 disabled:hover:border-zinc-800"
          >
            Previous
          </button>
          <button
            type="button"
            disabled={!hasNextPage}
            onClick={() => onPageChange(page + 1)}
            className="h-10 rounded-sm border border-zinc-800 bg-zinc-950 px-4 text-sm font-bold text-white transition-colors hover:border-emerald-500/70 hover:text-emerald-200 disabled:cursor-not-allowed disabled:text-zinc-600 disabled:hover:border-zinc-800"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
