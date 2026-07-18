export function titleCase(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function scoreTone(score: number) {
  if (score >= 0.8) return "text-emerald-300";
  if (score >= 0.6) return "text-amber-300";
  return "text-zinc-300";
}

export function percentage(value: number) {
  return Math.round(Math.max(0, Math.min(1, value)) * 100);
}

export function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}
