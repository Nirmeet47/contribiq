const TECH_NAME_LOOKUP: Record<string, string> = {
  "@supabase/supabase-js": "Supabase",
  angular: "Angular",
  docker: "Docker",
  express: "Express",
  fastify: "Fastify",
  go: "Go",
  golang: "Go",
  graphql: "GraphQL",
  javascript: "JavaScript",
  k8s: "Kubernetes",
  kubernetes: "Kubernetes",
  mongodb: "MongoDB",
  nestjs: "NestJS",
  next: "Next.js",
  nextjs: "Next.js",
  node: "Node.js",
  nodejs: "Node.js",
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

const ACRONYM_LOOKUP: Record<string, string> = {
  api: "API",
  cli: "CLI",
  css: "CSS",
  html: "HTML",
  http: "HTTP",
  js: "JS",
  json: "JSON",
  sql: "SQL",
  ts: "TS",
  ui: "UI",
  url: "URL",
};

function canonicalKey(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/^@/, "")
    .replace(/^types\//, "")
    .replace(/^trpc\/.*/, "trpc")
    .replace(/^supabase\/.*/, "supabase")
    .replace(/^@?trpc\/.*/, "trpc")
    .replace(/^@?supabase\/.*/, "supabase")
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
  return ACRONYM_LOOKUP[lower] ?? lower.charAt(0).toUpperCase() + lower.slice(1);
}

export function normalizeTechName(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";

  const direct = TECH_NAME_LOOKUP[trimmed.toLowerCase()];
  if (direct) return direct;

  const canonical = TECH_NAME_LOOKUP[canonicalKey(trimmed)];
  if (canonical) return canonical;

  return splitFallbackTokens(trimmed).map(titleToken).join(" ");
}
