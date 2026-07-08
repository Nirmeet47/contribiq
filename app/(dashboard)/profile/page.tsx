import { ExternalLink, MapPin } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ContributionsPage } from "@/components/dashboard/ContributionsPage";
import { ProfileReposSection } from "@/components/dashboard/ProfileReposSection";
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

function isSameMonth(value: string | Date, month: Date) {
  const date = new Date(value);
  return date.getFullYear() === month.getFullYear() && date.getMonth() === month.getMonth();
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
  const initialContributions = profile.topContributions.map((contribution) => ({
    ...contribution,
    mergedAt: new Date(contribution.mergedAt).toISOString(),
  }));
  const currentMonth = new Date();
  const monthlyRepoFullNames = initialContributions
    .filter((contribution) => isSameMonth(contribution.mergedAt, currentMonth))
    .map((contribution) => `${contribution.repoOwner}/${contribution.repoName}`);

  return (
    <main className="mx-auto max-w-7xl space-y-10 px-6 py-8">
      <section className="rounded-sm border border-zinc-800 bg-zinc-950 p-6">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
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
        </div>
      </section>

      <ContributionsPage embedded mode="summary" initialContributions={initialContributions} />

      <section className="space-y-4">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-zinc-100">Verified skills</h2>
          <p className="mt-1 text-sm text-zinc-500">
            Skills inferred from contribution history and profile analysis.
          </p>
        </div>
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

      <ProfileReposSection
        repos={profile.contributedRepos}
        monthlyRepoFullNames={monthlyRepoFullNames}
      />

      <ContributionsPage embedded mode="details" initialContributions={initialContributions} />
    </main>
  );
}
