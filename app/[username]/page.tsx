import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Activity, GitPullRequest, MapPin, Star } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { getPublicProfile } from "@/lib/public-profile";

type PageProps = {
  params: Promise<{ username: string }>;
};

function formatDate(value: string | Date) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

function formatFullDate(value: string | Date) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

function formatReach(value: number) {
  if (value >= 1000) return `${(value / 1000).toFixed(1)}k`;
  return value.toString();
}

function dateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function heatColor(count: number | undefined) {
  if (!count) return "bg-zinc-800";
  if (count <= 1) return "bg-emerald-950";
  if (count <= 3) return "bg-emerald-800";
  if (count <= 6) return "bg-emerald-600";
  return "bg-emerald-400";
}

function ProfileHeatmap({
  heatmap,
}: {
  heatmap: Array<{ date: string; count: number; snippet: string | null }>;
}) {
  const heatmapByDate = new Map(heatmap.map((cell) => [cell.date, cell]));
  const today = new Date();
  const start = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  start.setUTCDate(start.getUTCDate() - 363);
  const weeks = Array.from({ length: 52 }, (_, weekIndex) =>
    Array.from({ length: 7 }, (_, dayIndex) => {
      const date = addDays(start, weekIndex * 7 + dayIndex);
      const key = dateKey(date);
      return { date: key, cell: heatmapByDate.get(key) };
    })
  );

  return (
    <div className="custom-scrollbar overflow-x-auto rounded-sm border border-zinc-800 bg-zinc-950 p-4">
      <div className="flex min-w-max gap-[3px]">
        {weeks.map((week, weekIndex) => (
          <div key={weekIndex} className="flex flex-col gap-[3px]">
            {week.map(({ date, cell }) => (
              <div
                key={date}
                className={`h-3 w-3 rounded-sm ${heatColor(cell?.count)}`}
                title={
                  cell
                    ? `${cell.count} contribution(s) on ${date}\n${cell.snippet ?? ""}`
                    : `0 contribution(s) on ${date}`
                }
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { username } = await params;
  const profile = await getPublicProfile(decodeURIComponent(username));

  if (!profile) {
    return {
      title: "ContribIQ profile",
      description: "Public open-source contributor profile.",
    };
  }

  const displayName = profile.user.name ?? profile.user.username;
  const description =
    profile.user.bio ??
    `${displayName} has ${profile.stats.totalPRs} merged PRs across ${profile.stats.totalRepos} repositories on ContribIQ.`;

  return {
    title: `${displayName} | ContribIQ`,
    description,
    openGraph: {
      title: `${displayName} | ContribIQ`,
      description,
      images: profile.user.avatarUrl ? [{ url: profile.user.avatarUrl }] : undefined,
    },
    twitter: {
      card: "summary_large_image",
      title: `${displayName} | ContribIQ`,
      description,
      images: profile.user.avatarUrl ? [profile.user.avatarUrl] : undefined,
    },
  };
}

export default async function PublicProfilePage({ params }: PageProps) {
  const { username } = await params;
  const profile = await getPublicProfile(decodeURIComponent(username));

  if (!profile) notFound();

  const displayName = profile.user.name ?? profile.user.username;

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-50">
      <div className="mx-auto max-w-6xl space-y-8 px-6 py-10">
        <section className="flex flex-col gap-6 border-b border-zinc-900 pb-8 md:flex-row md:items-end md:justify-between">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-end">
            <div
              className="h-24 w-24 rounded-sm border border-zinc-800 bg-zinc-900 bg-cover bg-center"
              style={{ backgroundImage: profile.user.avatarUrl ? `url(${profile.user.avatarUrl})` : undefined }}
            />
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-emerald-400">
                @{profile.user.username}
              </p>
              <h1 className="mt-2 text-4xl font-bold tracking-tight text-white">{displayName}</h1>
              {profile.user.bio && (
                <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-400">{profile.user.bio}</p>
              )}
              <div className="mt-4 flex flex-wrap gap-3 text-xs font-medium text-zinc-500">
                {profile.user.location && (
                  <span className="inline-flex items-center gap-1">
                    <MapPin className="h-3.5 w-3.5" />
                    {profile.user.location}
                  </span>
                )}
                <span>Joined {formatDate(profile.user.createdAt)}</span>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2 sm:w-80">
            <div className="rounded-sm border border-zinc-800 bg-zinc-950 p-3">
              <p className="text-xl font-bold">{profile.stats.totalPRs}</p>
              <p className="text-[11px] text-zinc-500">PRs</p>
            </div>
            <div className="rounded-sm border border-zinc-800 bg-zinc-950 p-3">
              <p className="text-xl font-bold">{profile.stats.totalRepos}</p>
              <p className="text-[11px] text-zinc-500">Repos</p>
            </div>
            <div className="rounded-sm border border-zinc-800 bg-zinc-950 p-3">
              <p className="text-xl font-bold">{formatReach(profile.stats.totalReach)}</p>
              <p className="text-[11px] text-zinc-500">Reach</p>
            </div>
          </div>
        </section>

        <section className="space-y-4">
          <h2 className="text-sm font-bold text-zinc-100">Verified skills</h2>
          <div className="flex flex-wrap gap-2">
            {profile.topSkills.map((skill) => (
              <span
                key={skill.id}
                title={`${Math.round(skill.confidence * 100)}% confidence, ${skill.repoCount} repos, ${skill.commitCount} commits`}
              >
                <Badge variant="secondary">
                  {skill.name} - {skill.level}
                </Badge>
              </span>
            ))}
          </div>
        </section>

        <section className="space-y-4">
          <h2 className="text-sm font-bold text-zinc-100">Contribution heatmap</h2>
          <ProfileHeatmap heatmap={profile.heatmap} />
        </section>

        <section className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="space-y-4">
            <h2 className="text-sm font-bold text-zinc-100">Top contributions</h2>
            {profile.topContributions.map((contribution) => (
              <article key={contribution.id} className="space-y-3 rounded-sm border border-zinc-800 bg-zinc-950 p-5">
                <div className="flex items-start justify-between gap-4">
                  <p className="text-sm font-bold text-zinc-100">
                    {contribution.repoOwner}/{contribution.repoName}
                  </p>
                  <p className="shrink-0 text-xs font-medium text-zinc-500">
                    {formatFullDate(contribution.mergedAt)}
                  </p>
                </div>
                <h3 className="text-base font-semibold text-zinc-200">{contribution.prTitle}</h3>
                {contribution.aiDescription && (
                  <p className="text-sm italic leading-6 text-zinc-400">{contribution.aiDescription}</p>
                )}
                <div className="flex flex-wrap gap-2">
                  {contribution.skillsDemonstrated.map((skill) => (
                    <span key={skill} className="rounded-sm border border-emerald-800 bg-emerald-900/40 px-2 py-0.5 text-[11px] font-medium text-emerald-400">
                      {skill}
                    </span>
                  ))}
                </div>
                <a href={contribution.prUrl} target="_blank" rel="noreferrer" className="inline-flex text-xs font-bold text-emerald-400 hover:text-emerald-300">
                  View PR
                </a>
              </article>
            ))}
          </div>

          <aside className="space-y-4">
            <h2 className="text-sm font-bold text-zinc-100">Repos contributed to</h2>
            <div className="grid grid-cols-2 gap-3">
              {profile.contributedRepos.map((repo) => (
                <a
                  key={repo.fullName}
                  href={`https://github.com/${repo.fullName}`}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-sm border border-zinc-800 bg-zinc-950 p-4 transition-colors hover:border-zinc-700"
                >
                  <div
                    className="mb-3 h-10 w-10 rounded-sm bg-zinc-900 bg-cover bg-center"
                    style={{ backgroundImage: `url(https://github.com/${repo.owner}.png)` }}
                  />
                  <p className="truncate text-sm font-bold text-zinc-100">{repo.name}</p>
                  <p className="mt-1 flex items-center gap-1 text-xs text-zinc-500">
                    <Star className="h-3 w-3 text-amber-300" />
                    {repo.stars.toLocaleString()}
                  </p>
                </a>
              ))}
            </div>
          </aside>
        </section>

        <footer className="grid gap-4 border-t border-zinc-900 pt-6 sm:grid-cols-3">
          <div className="flex items-center gap-3 text-sm text-zinc-400">
            <GitPullRequest className="h-4 w-4 text-emerald-400" />
            {profile.stats.totalPRs} merged pull requests
          </div>
          <div className="flex items-center gap-3 text-sm text-zinc-400">
            <Activity className="h-4 w-4 text-sky-400" />
            {profile.stats.totalRepos} repositories
          </div>
          <div className="flex items-center gap-3 text-sm text-zinc-400">
            <Star className="h-4 w-4 text-amber-300" />
            {formatReach(profile.stats.totalReach)} combined stars
          </div>
        </footer>
      </div>
    </main>
  );
}
