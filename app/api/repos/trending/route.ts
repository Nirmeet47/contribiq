import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { skillIdentity } from "@/lib/skills";
import { createClient } from "@/utils/supabase/server";

export const dynamic = "force-dynamic";

// Maps normalized skill identities to the repo categories they belong to.
// repo.categories uses the broad buckets from seed_repos.py: frontend, backend, ai, devops, docs, testing, tools, mobile
const SKILL_TO_CATEGORIES: Record<string, string[]> = {
  react: ["frontend"],
  nextjs: ["frontend"],
  vuejs: ["frontend"],
  vue: ["frontend"],
  angular: ["frontend"],
  svelte: ["frontend"],
  tailwindcss: ["frontend"],
  tailwind: ["frontend"],
  css: ["frontend"],
  html: ["frontend"],
  javascript: ["frontend", "backend"],
  typescript: ["frontend", "backend"],
  flutter: ["mobile"],
  reactnative: ["mobile"],
  swift: ["mobile"],
  kotlin: ["mobile"],
  android: ["mobile"],
  ios: ["mobile"],
  fastapi: ["backend"],
  django: ["backend"],
  flask: ["backend"],
  express: ["backend"],
  expressjs: ["backend"],
  nestjs: ["backend"],
  gin: ["backend"],
  axum: ["backend"],
  rails: ["backend"],
  laravel: ["backend"],
  springboot: ["backend"],
  spring: ["backend"],
  go: ["backend"],
  rust: ["backend"],
  java: ["backend"],
  csharp: ["backend"],
  php: ["backend"],
  ruby: ["backend"],
  postgresql: ["backend"],
  mysql: ["backend"],
  mongodb: ["backend"],
  redis: ["backend"],
  prisma: ["backend"],
  graphql: ["backend"],
  pytorch: ["ai"],
  tensorflow: ["ai"],
  langchain: ["ai"],
  huggingface: ["ai"],
  openai: ["ai"],
  python: ["ai", "backend"],
  docker: ["devops"],
  kubernetes: ["devops"],
  k8s: ["devops"],
  terraform: ["devops"],
  ansible: ["devops"],
  aws: ["devops"],
  gcp: ["devops"],
  azure: ["devops"],
  githubactions: ["devops"],
  jest: ["testing"],
  vitest: ["testing"],
  cypress: ["testing"],
  playwright: ["testing"],
  pytest: ["testing"],
  mdx: ["docs"],
  docusaurus: ["docs"],
  bullmq: ["tools"],
  webpack: ["tools"],
  vite: ["tools"],
  esbuild: ["tools"],
};

async function getDbUserId() {
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
    select: { id: true },
  });

  return dbUser?.id ?? null;
}

export async function GET() {
  const userId = await getDbUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const skillProfile = await prisma.skillProfile.findUnique({
    where: { userId },
    select: {
      skills: {
        select: { name: true, level: true, confidence: true },
      },
    },
  });

  const normalizedSkills = new Set(
    (skillProfile?.skills ?? [])
      .map((skill) => skillIdentity(skill.name))
      .filter(Boolean)
  );

  if (normalizedSkills.size === 0) {
    return NextResponse.json({ repos: [] });
  }

  // Build the set of repo categories that map to this user's skills
  const matchingCategories = new Set<string>();
  for (const skill of normalizedSkills) {
    for (const category of SKILL_TO_CATEGORIES[skill] ?? []) {
      matchingCategories.add(category);
    }
  }

  const skillWeights = new Map(
    (skillProfile?.skills ?? []).map((skill) => {
      const levelBoost = skill.level === "strong" ? 1 : skill.level === "moderate" ? 0.75 : 0.45;
      return [skillIdentity(skill.name), Math.max(skill.confidence, levelBoost)];
    })
  );

  const repos = await prisma.repo.findMany({
    select: {
      id: true,
      owner: true,
      name: true,
      fullName: true,
      description: true,
      language: true,
      stars: true,
      categories: true,
      activityScore: true,
    },
    orderBy: [{ activityScore: "desc" }, { stars: "desc" }],
  });

  const rankedRepos = repos
    .map((repo) => {
      // Direct language match (e.g. repo.language = "TypeScript", user has TypeScript skill)
      const languageIdentity = repo.language ? skillIdentity(repo.language) : "";
      const languageWeight = languageIdentity ? skillWeights.get(languageIdentity) ?? 0 : 0;

      // Category match via skill-to-category mapping (e.g. user has React -> frontend category)
      const categoryWeight = repo.categories.reduce((best, category) => {
        if (!matchingCategories.has(category.toLowerCase())) return best;

        const matchingSkillWeight = [...skillWeights.entries()].reduce((skillBest, [skill, weight]) => {
          const categories = SKILL_TO_CATEGORIES[skill] ?? [];
          return categories.includes(category.toLowerCase()) ? Math.max(skillBest, weight) : skillBest;
        }, 0);

        return Math.max(best, matchingSkillWeight || 0.35);
      }, 0);

      const personalizationScore = Math.max(languageWeight, categoryWeight);

      return {
        ...repo,
        personalizationScore,
        rankingScore:
          personalizationScore * 10 +
          repo.activityScore * 2 +
          Math.log10(Math.max(repo.stars, 1)),
      };
    })
    .sort((a, b) =>
      b.rankingScore === a.rankingScore
        ? b.stars - a.stars
        : b.rankingScore - a.rankingScore
    );

  const matchingRepos = rankedRepos.filter((repo) => repo.personalizationScore > 0);
  const selectedRepos = [...matchingRepos];
  const selectedIds = new Set(selectedRepos.map((repo) => repo.id));

  for (const repo of rankedRepos) {
    if (selectedRepos.length >= 12) break;
    if (selectedIds.has(repo.id)) continue;

    selectedRepos.push(repo);
    selectedIds.add(repo.id);
  }

  const responseRepos = selectedRepos.slice(0, 12).map((repo) => ({
      id: repo.id,
      owner: repo.owner,
      name: repo.name,
      fullName: repo.fullName,
      description: repo.description,
      language: repo.language,
      stars: repo.stars,
      categories: repo.categories,
      activityScore: repo.activityScore,
    }));

  return NextResponse.json({ repos: responseRepos });
}
