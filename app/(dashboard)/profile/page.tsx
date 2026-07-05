import { ExternalLink, GitPullRequest, MapPin, Star } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { getPublicProfile } from "@/lib/public-profile";
import { prisma } from "@/lib/prisma";
import { createClient } from "@/utils/supabase/server";

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

async function getCurrentUsername() {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) return null;

  const githubIdStr = user.user_metadata?.provider_id;
  if (!githubIdStr) return null;

  const dbUser = await prisma.user.findUnique({
    where: { githubId: parseInt(githubIdStr, 10) },
    select: { username: true },
  });

  return dbUser?.username ?? null;
}

export default async function DashboardProfileRoute() {
  const username = await getCurrentUsername();
  if (!username) redirect("/login");

  const profile = await getPublicProfile(username);
  if (!profile) redirect("/dashboard");

  const displayName = profile.user.name ?? profile.user.username;

  return (
    <main className="mx-auto max-w-6xl space-y-8 px-6 py-8">
      <section className="flex flex-col gap-6 border-b border-zinc-900 pb-8 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-end">
          <div
            className="h-24 w-24 rounded-sm border border-zinc-800 bg-zinc-900 bg-cover bg-center"
            style={{
              backgroundImage: profile.user.avatarUrl
                ? `url(${profile.user.avatarUrl})`
                : undefined,
            }}
          />
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-emerald-400">
              @{profile.user.username}
            </p>
            <h1 className="mt-2 text-4xl font-bold tracking-tight text-white">
              {displayName}
            </h1>
            {profile.user.bio && (
              <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-400">
                {profile.user.bio}
              </p>
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

        <Link
          href={`/${profile.user.username}`}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-sm border border-zinc-800 bg-zinc-900 px-3 text-xs font-bold text-zinc-300 transition-colors hover:border-zinc-700 hover:text-white"
        >
          Public view
          <ExternalLink className="h-4 w-4" />
        </Link>
      </section>

      <section className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-sm border border-zinc-800 bg-zinc-950 p-5">
          <p className="text-2xl font-bold text-zinc-100">{profile.stats.totalPRs}</p>
          <p className="mt-1 text-xs font-medium text-zinc-500">Merged PRs</p>
        </div>
        <div className="rounded-sm border border-zinc-800 bg-zinc-950 p-5">
          <p className="text-2xl font-bold text-zinc-100">{profile.stats.totalRepos}</p>
          <p className="mt-1 text-xs font-medium text-zinc-500">Repos contributed</p>
        </div>
        <div className="rounded-sm border border-zinc-800 bg-zinc-950 p-5">
          <p className="text-2xl font-bold text-zinc-100">
            {formatReach(profile.stats.totalReach)}
          </p>
          <p className="mt-1 text-xs font-medium text-zinc-500">Combined reach</p>
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

      <section className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="space-y-4">
          <h2 className="text-sm font-bold text-zinc-100">Top contributions</h2>
          {profile.topContributions.map((contribution) => (
            <article
              key={contribution.id}
              className="space-y-3 rounded-sm border border-zinc-800 bg-zinc-950 p-5"
            >
              <div className="flex items-start justify-between gap-4">
                <p className="text-sm font-bold text-zinc-100">
                  {contribution.repoOwner}/{contribution.repoName}
                </p>
                <p className="shrink-0 text-xs font-medium text-zinc-500">
                  {formatFullDate(contribution.mergedAt)}
                </p>
              </div>
              <h3 className="text-base font-semibold text-zinc-200">
                {contribution.prTitle}
              </h3>
              {contribution.aiDescription && (
                <p className="text-sm italic leading-6 text-zinc-400">
                  {contribution.aiDescription}
                </p>
              )}
              <a
                href={contribution.prUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex text-xs font-bold text-emerald-400 hover:text-emerald-300"
              >
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

      <footer className="border-t border-zinc-900 pt-6 text-sm text-zinc-500">
        <GitPullRequest className="mr-2 inline h-4 w-4 text-emerald-400" />
        This is the same profile shown publicly, kept inside your dashboard shell.
      </footer>
    </main>
  );
}
