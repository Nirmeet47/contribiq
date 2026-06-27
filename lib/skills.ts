import type { SkillLevel } from "@prisma/client";

export type CanonicalSkillInput = {
  name: string;
  level?: SkillLevel;
  confidence?: number;
  repoCount?: number;
  commitCount?: number;
};

export type CanonicalSkill = {
  name: string;
  level: SkillLevel;
  confidence: number;
  repoCount: number;
  commitCount: number;
};

export const SKILL_LEVEL_ORDER: Record<SkillLevel, number> = {
  strong: 0,
  moderate: 1,
  learning: 2,
};

const SKILL_ALIASES: Record<string, string> = {
  "@prisma/client": "Prisma",
  "@supabase/ssr": "Supabase",
  "@supabase/supabase-js": "Supabase",
  angular: "Angular",
  docker: "Docker",
  express: "Express",
  fastapi: "FastAPI",
  fastify: "Fastify",
  go: "Go",
  golang: "Go",
  graphql: "GraphQL",
  javascript: "JavaScript",
  k8s: "Kubernetes",
  kubernetes: "Kubernetes",
  mongodb: "MongoDB",
  mongoose: "MongoDB",
  nest: "NestJS",
  nestjs: "NestJS",
  next: "Next.js",
  nextjs: "Next.js",
  node: "Node.js",
  nodejs: "Node.js",
  pg: "PostgreSQL",
  postgres: "PostgreSQL",
  postgresql: "PostgreSQL",
  prisma: "Prisma",
  python: "Python",
  react: "React",
  redis: "Redis",
  rust: "Rust",
  supabase: "Supabase",
  svelte: "Svelte",
  tailwind: "Tailwind CSS",
  tailwindcss: "Tailwind CSS",
  trpc: "tRPC",
  typescript: "TypeScript",
  vite: "Vite",
  vue: "Vue",
};

const ACRONYM_ALIASES: Record<string, string> = {
  api: "API",
  cli: "CLI",
  css: "CSS",
  dom: "DOM",
  html: "HTML",
  http: "HTTP",
  js: "JS",
  json: "JSON",
  sql: "SQL",
  ts: "TS",
  ui: "UI",
  url: "URL",
};

const KNOWN_LANGUAGES = new Set([
  "typescript",
  "javascript",
  "python",
  "rust",
  "go",
  "java",
  "kotlin",
  "swift",
  "c",
  "c++",
  "c#",
  "ruby",
  "php",
  "dart",
  "scala",
  "elixir",
  "haskell",
  "lua",
  "r",
  "julia",
  "zig",
  "nim",
  "ocaml",
  "clojure",
]);

function aliasKey(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/^@/, "")
    .replace(/^types\//, "")
    .replace(/^@?trpc\/.*/, "trpc")
    .replace(/^@?supabase\/.*/, "supabase")
    .replace(/^@?prisma\/.*/, "prisma")
    .replace(/\.js$/, "js")
    .replace(/[\s._-]+/g, "");
}

function packageStem(value: string) {
  return value
    .trim()
    .replace(/^@/, "")
    .split("/")
    .pop() ?? value;
}

function splitFallbackTokens(value: string) {
  return packageStem(value)
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[-_./]+/g, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean);
}

function titleToken(token: string) {
  const lower = token.toLowerCase();
  return ACRONYM_ALIASES[lower] ?? lower.charAt(0).toUpperCase() + lower.slice(1);
}

export function isLanguageSkill(name: string) {
  return KNOWN_LANGUAGES.has(name.trim().toLowerCase());
}

export function normalizeSkillName(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";

  const direct = SKILL_ALIASES[trimmed.toLowerCase()];
  if (direct) return direct;

  const canonical = SKILL_ALIASES[aliasKey(trimmed)];
  if (canonical) return canonical;

  return splitFallbackTokens(trimmed).map(titleToken).join(" ");
}

export function skillIdentity(value: string) {
  return aliasKey(normalizeSkillName(value));
}

export function canonicalizeSkills(skills: CanonicalSkillInput[]) {
  const byIdentity = new Map<string, CanonicalSkill>();

  for (const skill of skills) {
    const name = normalizeSkillName(skill.name);
    if (!name) continue;

    const identity = skillIdentity(name);
    const incoming: CanonicalSkill = {
      name,
      level: skill.level ?? "learning",
      confidence: Math.max(0, Math.min(1, skill.confidence ?? 0.5)),
      repoCount: Math.max(0, Math.trunc(skill.repoCount ?? 0)),
      commitCount: Math.max(0, Math.trunc(skill.commitCount ?? 0)),
    };
    const existing = byIdentity.get(identity);

    if (!existing) {
      byIdentity.set(identity, incoming);
      continue;
    }

    byIdentity.set(identity, {
      name: existing.name,
      level:
        SKILL_LEVEL_ORDER[incoming.level] < SKILL_LEVEL_ORDER[existing.level]
          ? incoming.level
          : existing.level,
      confidence: Math.max(existing.confidence, incoming.confidence),
      repoCount: Math.max(existing.repoCount, incoming.repoCount),
      commitCount: Math.max(existing.commitCount, incoming.commitCount),
    });
  }

  return [...byIdentity.values()].sort((a, b) => {
    const levelDelta = SKILL_LEVEL_ORDER[a.level] - SKILL_LEVEL_ORDER[b.level];
    if (levelDelta !== 0) return levelDelta;
    return a.name.localeCompare(b.name);
  });
}

export function formatSkillEmbeddingText(skills: CanonicalSkillInput[]) {
  const canonicalSkills = canonicalizeSkills(skills);
  if (canonicalSkills.length === 0) return "skills: none";

  return canonicalSkills
    .map(
      (skill) =>
        `skill:${skill.name};level:${skill.level};confidence:${skill.confidence.toFixed(2)};repos:${skill.repoCount};commits:${skill.commitCount}`
    )
    .join("\n");
}

export function formatIssueEmbeddingText(requiredSkills: string[]) {
  const canonicalNames = canonicalizeSkills(
    requiredSkills.map((name) => ({ name, level: "learning" }))
  ).map((skill) => skill.name);

  return canonicalNames.length > 0
    ? canonicalNames.map((name) => `required-skill:${name}`).join("\n")
    : "required-skills: none";
}
