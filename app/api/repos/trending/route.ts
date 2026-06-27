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
        select: { name: true },
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

  const matchingRepos = repos
    .filter((repo) => {
      // Direct language match (e.g. repo.language = "TypeScript", user has TypeScript skill)
      const languageMatches =
        repo.language !== null && normalizedSkills.has(skillIdentity(repo.language));

      // Category match via skill→category mapping (e.g. user has React → frontend category)
      const categoryMatches = repo.categories.some((category) =>
        matchingCategories.has(category.toLowerCase())
      );

      return languageMatches || categoryMatches;
    })
    .slice(0, 3);

  return NextResponse.json({ repos: matchingRepos });
}