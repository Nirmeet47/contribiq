import { getCachedJson, setCachedJson } from "@/lib/cache";
import { prisma } from "@/lib/prisma";

const REPO_LANGUAGE_CATALOG_CACHE_KEY = "repo-languages:v1";
const REPO_LANGUAGE_CATALOG_TTL_SECONDS = 60 * 60;

export async function getRepoLanguageCatalog() {
  const cached = await getCachedJson<string[]>(
    REPO_LANGUAGE_CATALOG_CACHE_KEY,
    "repo-languages"
  );
  if (cached) return cached;

  const languages = await prisma.repo.findMany({
    where: { language: { not: null } },
    distinct: ["language"],
    orderBy: { language: "asc" },
    select: { language: true },
  });

  const payload = languages
    .map((repo) => repo.language)
    .filter((value): value is string => Boolean(value));

  await setCachedJson(
    REPO_LANGUAGE_CATALOG_CACHE_KEY,
    payload,
    REPO_LANGUAGE_CATALOG_TTL_SECONDS,
    "repo-languages"
  );

  return payload;
}
