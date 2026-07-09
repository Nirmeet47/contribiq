"use client";

import type { MouseEvent } from "react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Search, X } from "lucide-react";

export type DashboardFilterOption<T extends string> = {
  value: T | "";
  label: string;
};

export function DashboardFilterSelect<T extends string>({
  label,
  value,
  options,
  onChange,
  minWidthClassName = "min-w-40",
}: {
  label?: string;
  value: T | "";
  options: Array<DashboardFilterOption<T>>;
  onChange: (value: T | "") => void;
  minWidthClassName?: string;
}) {
  const id = useId();
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const selectedOption = options.find((option) => option.value === value) ?? options[0];

  useEffect(() => {
    function closeOtherDropdowns(event: Event) {
      const current = event as CustomEvent<string>;
      if (current.detail !== id) detailsRef.current?.removeAttribute("open");
    }

    window.addEventListener("dashboard-filter-open", closeOtherDropdowns);
    return () => window.removeEventListener("dashboard-filter-open", closeOtherDropdowns);
  }, [id]);

  function selectOption(nextValue: T | "", event: MouseEvent<HTMLButtonElement>) {
    onChange(nextValue);
    detailsRef.current?.removeAttribute("open");
    event.currentTarget.blur();
  }

  return (
    <div className="relative grid shrink-0 gap-1.5 text-[11px] font-bold uppercase tracking-widest text-zinc-600">
      {label && <span>{label}</span>}
      <details
        ref={detailsRef}
        className="group"
        onToggle={(event) => {
          if (event.currentTarget.open) {
            window.dispatchEvent(new CustomEvent("dashboard-filter-open", { detail: id }));
          }
        }}
      >
        <summary
          className={`flex h-9 ${minWidthClassName} cursor-pointer list-none items-center justify-between gap-3 rounded-sm border border-zinc-800 bg-zinc-900 px-3 text-xs font-bold normal-case tracking-normal text-zinc-300 outline-none transition-colors hover:border-zinc-700 [&::-webkit-details-marker]:hidden`}
        >
          <span className="truncate">{selectedOption?.label}</span>
          <ChevronDown className="h-4 w-4 text-zinc-500 transition-transform group-open:rotate-180" />
        </summary>
        <div className="absolute left-0 z-20 mt-2 w-full min-w-48 rounded-sm border border-zinc-800 bg-zinc-950 p-2 shadow-xl shadow-black/40">
          {options.map((option) => (
            <button
              key={option.value || "all"}
              type="button"
              onClick={(event) => selectOption(option.value, event)}
              className={`flex w-full items-center rounded-sm px-2.5 py-2 text-left text-xs font-bold normal-case tracking-normal transition-colors ${
                option.value === value
                  ? "bg-emerald-500/10 text-emerald-300"
                  : "text-zinc-400 hover:bg-zinc-900 hover:text-white"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </details>
    </div>
  );
}

export function DashboardMultiSelect({
  label,
  value,
  options,
  onChange,
  placeholder = "All languages",
  searchPlaceholder = "Search language",
  emptyMessage = "No options found.",
  minWidthClassName = "min-w-52",
}: {
  label?: string;
  value: string[];
  options: string[];
  onChange: (value: string[]) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyMessage?: string;
  minWidthClassName?: string;
}) {
  const id = useId();
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const [search, setSearch] = useState("");
  const selectedSet = useMemo(() => new Set(value), [value]);
  const filteredOptions = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return options;
    return options.filter((option) => option.toLowerCase().includes(query));
  }, [options, search]);
  const buttonLabel =
    value.length === 0 ? placeholder : value.length === 1 ? value[0] : `${value.length} languages`;

  useEffect(() => {
    function closeOtherDropdowns(event: Event) {
      const current = event as CustomEvent<string>;
      if (current.detail !== id) detailsRef.current?.removeAttribute("open");
    }

    window.addEventListener("dashboard-filter-open", closeOtherDropdowns);
    return () => window.removeEventListener("dashboard-filter-open", closeOtherDropdowns);
  }, [id]);

  function toggleOption(option: string) {
    if (selectedSet.has(option)) {
      onChange(value.filter((item) => item !== option));
      return;
    }

    onChange([...value, option]);
  }

  return (
    <div className="relative grid shrink-0 gap-1.5 text-[11px] font-bold uppercase tracking-widest text-zinc-600">
      {label && <span>{label}</span>}
      <details
        ref={detailsRef}
        className="group"
        onToggle={(event) => {
          if (event.currentTarget.open) {
            window.dispatchEvent(new CustomEvent("dashboard-filter-open", { detail: id }));
          }
        }}
      >
        <summary
          className={`flex h-9 ${minWidthClassName} cursor-pointer list-none items-center justify-between gap-3 rounded-sm border border-zinc-800 bg-zinc-900 px-3 text-xs font-bold normal-case tracking-normal text-zinc-300 outline-none transition-colors hover:border-zinc-700 [&::-webkit-details-marker]:hidden`}
        >
          <span className="truncate">{buttonLabel}</span>
          <ChevronDown className="h-4 w-4 text-zinc-500 transition-transform group-open:rotate-180" />
        </summary>
        <div className="absolute left-0 z-30 mt-2 w-72 rounded-sm border border-zinc-800 bg-zinc-950 p-2 shadow-xl shadow-black/40">
          <label className="relative mb-2 block">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-600" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={searchPlaceholder}
              className="h-9 w-full rounded-sm border border-zinc-800 bg-zinc-900 pl-8 pr-3 text-xs font-medium normal-case tracking-normal text-zinc-200 outline-none transition-colors placeholder:text-zinc-600 hover:border-zinc-700 focus:border-emerald-500/60"
            />
          </label>

          <div className="relative mb-1">
            <button
              type="button"
              onClick={() => onChange([])}
              className={`flex h-8 w-full items-center rounded-sm px-2.5 text-left text-xs font-bold normal-case tracking-normal transition-colors ${
                value.length === 0
                  ? "bg-emerald-500/10 text-emerald-300"
                  : "text-zinc-400 hover:bg-zinc-900 hover:text-white"
              } ${value.length > 0 ? "pr-10" : ""}`}
            >
              {placeholder}
            </button>
            {value.length > 0 && (
              <button
                type="button"
                onClick={() => onChange([])}
                className="absolute right-0 top-0 inline-flex h-8 w-8 items-center justify-center rounded-sm border border-zinc-800 bg-zinc-900 text-zinc-500 transition-colors hover:border-zinc-700 hover:text-white"
                aria-label="Clear selected languages"
                title="Clear"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          <div className="custom-scrollbar max-h-64 overflow-y-auto">
            {filteredOptions.length === 0 ? (
              <p className="px-2.5 py-2 text-xs font-medium normal-case tracking-normal text-zinc-500">
                {emptyMessage}
              </p>
            ) : (
              filteredOptions.map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => toggleOption(option)}
                  className={`flex w-full items-center gap-2 rounded-sm px-2.5 py-2 text-left text-xs font-medium normal-case tracking-normal transition-colors ${
                    selectedSet.has(option)
                      ? "bg-emerald-500/10 text-emerald-300"
                      : "text-zinc-400 hover:bg-zinc-900 hover:text-white"
                  }`}
                  aria-pressed={selectedSet.has(option)}
                >
                  <span
                    className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-sm border transition-colors ${
                      selectedSet.has(option)
                        ? "border-emerald-400 bg-emerald-500 text-zinc-950"
                        : "border-zinc-700 bg-zinc-950 text-transparent"
                    }`}
                    aria-hidden="true"
                  >
                    <Check className="h-3 w-3" />
                  </span>
                  <span className="truncate">{option}</span>
                </button>
              ))
            )}
          </div>
        </div>
      </details>
    </div>
  );
}
