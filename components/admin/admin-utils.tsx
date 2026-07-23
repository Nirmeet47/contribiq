import { CheckCircle2, Clock3, CircleDashed, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export type IndexingStatus = "NOT_INDEXED" | "PENDING" | "INDEXED" | "FAILED";

const statusClasses: Record<IndexingStatus, string> = {
  INDEXED: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
  PENDING: "border-yellow-500/30 bg-yellow-500/10 text-yellow-300",
  NOT_INDEXED: "border-zinc-700 bg-zinc-900 text-zinc-300",
  FAILED: "border-red-500/30 bg-red-500/10 text-red-300",
};

const statusIcons = {
  INDEXED: CheckCircle2,
  PENDING: Clock3,
  NOT_INDEXED: CircleDashed,
  FAILED: XCircle,
};

export function formatDate(value: string | null | undefined) {
  if (!value) return "Never";
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

export function formatNumber(value: number) {
  return new Intl.NumberFormat("en").format(value);
}

export function percent(value: number) {
  return `${Math.round(value * 100)}%`;
}

export function StatusBadge({ status }: { status: IndexingStatus }) {
  const Icon = statusIcons[status];

  return (
    <Badge className={cn("gap-1.5", statusClasses[status])}>
      <Icon className="h-3.5 w-3.5" />
      {status.replace("_", " ")}
    </Badge>
  );
}

export function BoolBadge({ value }: { value: boolean }) {
  return (
    <Badge variant={value ? "success" : "secondary"}>
      {value ? "Yes" : "No"}
    </Badge>
  );
}

export function PageHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <header className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-white">{title}</h1>
        <p className="mt-2 text-sm font-medium text-zinc-300">{subtitle}</p>
      </div>
    </header>
  );
}

export function LoadingState({ label }: { label: string }) {
  return (
    <div className="rounded-sm border border-zinc-800 bg-zinc-950 p-8 text-center text-sm font-medium text-zinc-300">
      {label}
    </div>
  );
}

export function ErrorState({ label }: { label: string }) {
  return (
    <div className="rounded-sm border border-red-500/30 bg-red-500/10 p-5 text-sm font-medium text-red-300">
      {label}
    </div>
  );
}
