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
  hcl: "HCL",
  javascript: "JavaScript",
  js: "JavaScript",
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
  ts: "TypeScript",
  vite: "Vite",
  vue: "Vue",
  batch: "Batchfile",
  batchfile: "Batchfile",
  cplusplus: "C++",
  cpp: "C++",
  csharp: "C#",
  dockerfile: "Dockerfile",
  jupyter: "Jupyter Notebook",
  jupyternotebook: "Jupyter Notebook",
  make: "Makefile",
  makefile: "Makefile",
  matlab: "MATLAB",
  objectivec: "Objective-C",
  objc: "Objective-C",
  plpgsql: "PLpgSQL",
  protobuf: "Protocol Buffer",
  protocolbuffer: "Protocol Buffer",
  powershell: "PowerShell",
  sass: "Sass",
  scss: "SCSS",
  shell: "Shell",
  terraform: "HCL",
  vimscript: "Vim Script",
  wasm: "WebAssembly",
  webassembly: "WebAssembly",
  yaml: "YAML",
  yml: "YAML",
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

export const GITHUB_LANGUAGE_GROUPS = [
  {
    label: "General purpose",
    languages: [
      "JavaScript",
      "TypeScript",
      "Python",
      "Java",
      "C",
      "C++",
      "C#",
      "Go",
      "Rust",
      "Ruby",
      "PHP",
      "Swift",
      "Kotlin",
      "Scala",
      "Dart",
      "Objective-C",
      "Elixir",
      "Erlang",
      "Clojure",
      "Haskell",
      "Lua",
      "Perl",
      "R",
      "Julia",
      "F#",
      "OCaml",
      "Groovy",
      "Zig",
      "Nim",
      "Crystal",
      "V",
    ],
  },
  {
    label: "Web front-end",
    languages: ["HTML", "CSS", "SCSS", "Sass", "Less", "Vue", "Svelte"],
  },
  {
    label: "Shell and scripting",
    languages: ["Shell", "PowerShell", "Batchfile", "AWK", "Tcl"],
  },
  {
    label: "Data, ML, and scientific",
    languages: ["Jupyter Notebook", "R", "MATLAB", "SQL", "PLpgSQL", "SAS", "Stata"],
  },
  {
    label: "Systems and low-level",
    languages: ["Assembly", "WebAssembly", "Fortran", "Ada", "COBOL", "VHDL", "Verilog"],
  },
  {
    label: "Mobile-specific",
    languages: ["Swift", "Kotlin", "Dart", "Objective-C", "Java"],
  },
  {
    label: "Config, markup, and infra-as-code",
    languages: ["Dockerfile", "Makefile", "YAML", "TOML", "HCL", "Nix", "Vim Script"],
  },
  {
    label: "Niche but common on GitHub",
    languages: [
      "Solidity",
      "GraphQL",
      "Protocol Buffer",
      "Elm",
      "Emacs Lisp",
      "Racket",
      "Scheme",
      "Prolog",
      "ABAP",
      "Vala",
    ],
  },
] as const;

export const GITHUB_LANGUAGE_SKILLS = Array.from(
  new Set(GITHUB_LANGUAGE_GROUPS.flatMap((group) => group.languages))
).sort((a, b) => a.localeCompare(b));

const KNOWN_LANGUAGES = new Set(GITHUB_LANGUAGE_SKILLS.map((language) => language.toLowerCase()));

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
