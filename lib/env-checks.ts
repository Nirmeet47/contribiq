import { createClient } from "@supabase/supabase-js";
import Redis from "ioredis";
import { Client as PgClient } from "pg";

type EnvStatus = "ready" | "missing" | "invalid" | "skipped";

export type EnvCheck = {
  name: string;
  label: string;
  category: string;
  required: boolean;
  source: string;
  value: string;
  status: EnvStatus;
  message: string;
};

export type ServiceCheck = {
  name: string;
  status: EnvStatus;
  message: string;
};

export type EnvReport = {
  generatedAt: string;
  envChecks: EnvCheck[];
  serviceChecks: ServiceCheck[];
};

type EnvDefinition = {
  name: string;
  aliases?: string[];
  label: string;
  category: string;
  required: boolean;
  source: string;
  validate?: (value: string) => string | null;
};

const envDefinitions: EnvDefinition[] = [
  // --- Supabase Postgres ---
  {
    name: "DATABASE_URL",
    label: "Runtime Postgres URL",
    category: "Supabase Postgres",
    required: true,
    source:
      "Supabase Dashboard > Settings > Database > Connection string > Transaction pooler, port 6543",
    validate: (value) =>
      value.startsWith("postgresql://") || value.startsWith("postgres://")
        ? null
        : "Expected a postgres:// or postgresql:// connection string.",
  },
  {
    name: "DIRECT_URL",
    label: "Direct Postgres URL",
    category: "Supabase Postgres",
    required: true,
    source:
      "Supabase Dashboard > Settings > Database > Connection string > Direct connection, port 5432",
    validate: (value) =>
      value.startsWith("postgresql://") || value.startsWith("postgres://")
        ? null
        : "Expected a postgres:// or postgresql:// connection string.",
  },

  // --- Supabase Auth ---
  {
    name: "NEXT_PUBLIC_SUPABASE_URL",
    label: "Supabase project URL",
    category: "Supabase Auth",
    required: true,
    source: "Supabase Dashboard > Settings > API > Project URL",
    validate: (value) =>
      /^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(value)
        ? null
        : "Expected a URL like https://your-ref.supabase.co.",
  },
  {
    name: "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    label: "Supabase anon key",
    category: "Supabase Auth",
    required: true,
    source: "Supabase Dashboard > Settings > API > anon public key",
    validate: (value) =>
      value.startsWith("eyJ") ? null : "Expected a JWT (starts with eyJ).",
  },
  {
    name: "SUPABASE_SERVICE_ROLE_KEY",
    label: "Supabase service role key",
    category: "Supabase Auth",
    required: true,
    source: "Supabase Dashboard > Settings > API > service_role secret key",
    validate: (value) =>
      value.startsWith("eyJ") ? null : "Expected a JWT (starts with eyJ).",
  },

  // --- GitHub ---
  {
    name: "GITHUB_CLIENT_ID",
    label: "GitHub OAuth client ID",
    category: "GitHub",
    required: true,
    source:
      "GitHub > Settings > Developer settings > OAuth Apps > your app > Client ID",
  },
  {
    name: "GITHUB_CLIENT_SECRET",
    label: "GitHub OAuth client secret",
    category: "GitHub",
    required: true,
    source:
      "GitHub > Settings > Developer settings > OAuth Apps > your app > Client secrets",
  },
  {
    name: "GITHUB_WEBHOOK_SECRET",
    label: "GitHub webhook secret",
    category: "GitHub",
    required: true,
    source:
      "Any random string — paste the same value into GitHub repo Settings > Webhooks > Secret",
  },
  {
    name: "GITHUB_TOKEN_ENCRYPTION_KEY",
    aliases: ["TOKEN_ENCRYPTION_KEY"],
    label: "GitHub token encryption key",
    category: "GitHub",
    required: true,
    source:
      "Set GITHUB_TOKEN_ENCRYPTION_KEY in app secrets. TOKEN_ENCRYPTION_KEY is accepted as a legacy fallback.",
  },
  {
    name: "GITHUB_PAT",
    label: "GitHub personal access token",
    category: "GitHub",
    required: false,
    source:
      "GitHub > Settings > Developer settings > Personal access tokens — optional fallback for unauthenticated API calls",
    validate: (value) =>
      value.startsWith("ghp_") || value.startsWith("github_pat_")
        ? null
        : "Expected a token starting with ghp_ or github_pat_.",
  },

  // --- Redis ---
  {
    name: "REDIS_URL",
    label: "Redis connection URL",
    category: "Redis / Queues",
    required: true,
    source: "Upstash Console > Database > Details > Connect > ioredis",
    validate: (value) =>
      value.startsWith("redis://") || value.startsWith("rediss://")
        ? null
        : "Expected redis:// or rediss://.",
  },

  // --- AI: Groq ---
  {
    name: "GROQ_API_KEY",
    label: "Groq API key",
    category: "AI",
    required: true,
    source:
      "console.groq.com > API Keys > Create key — free, no credit card needed",
    validate: (value) =>
      value.startsWith("gsk_") ? null : "Expected a key starting with gsk_.",
  },

  // --- AI: Gemini ---
  {
    name: "GEMINI_API_KEY",
    label: "Gemini API key",
    category: "AI",
    required: true,
    source:
      "aistudio.google.com > Get API key — free, no credit card needed. Used for gemini-embedding-001 (768-dim vectors).",
    validate: (value) =>
      value.startsWith("AIza") || value.startsWith("AQ.")
        ? null
        : "Expected a Gemini API key (starts with AIza or AQ.).",
  },

  // --- App ---
  {
    name: "NEXT_PUBLIC_APP_URL",
    label: "Public app URL",
    category: "App",
    required: true,
    source: "Your local or deployed origin, e.g. http://localhost:3000",
    validate: (value) => {
      try {
        new URL(value);
        return null;
      } catch {
        return "Expected a valid URL.";
      }
    },
  },
];

function maskValue(value: string | undefined): string {
  if (!value) return "";
  if (value.length <= 10) return `${value.slice(0, 2)}...`;
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

function getEnvValue(definition: EnvDefinition): string | undefined {
  return [definition.name, ...(definition.aliases ?? [])]
    .map((name) => process.env[name])
    .find((value): value is string => !!value);
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      setTimeout(() => reject(new Error(`Timed out after ${ms}ms`)), ms);
    }),
  ]);
}

function getEnvChecks(): EnvCheck[] {
  return envDefinitions.map((definition) => {
    const rawValue = getEnvValue(definition);

    if (!rawValue) {
      return {
        ...definition,
        value: "",
        status: definition.required ? "missing" : "skipped",
        message: definition.required
          ? "Missing from your environment."
          : "Optional and not configured.",
      };
    }

    const validationMessage = definition.validate?.(rawValue);

    return {
      ...definition,
      value: maskValue(rawValue),
      status: validationMessage ? "invalid" : "ready",
      message: validationMessage ?? "Configured.",
    };
  });
}

async function checkPostgres(): Promise<ServiceCheck> {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    return {
      name: "Postgres",
      status: "skipped",
      message: "Skipped — DATABASE_URL is missing.",
    };
  }

  const client = new PgClient({ connectionString: databaseUrl });

  try {
    await withTimeout(client.connect(), 5000);
    await withTimeout(client.query("select 1"), 5000);
    return {
      name: "Postgres",
      status: "ready",
      message: "Connected — SELECT 1 succeeded.",
    };
  } catch (error) {
    return {
      name: "Postgres",
      status: "invalid",
      message: error instanceof Error ? error.message : "Connection failed.",
    };
  } finally {
    await client.end().catch(() => undefined);
  }
}

async function checkRedis(): Promise<ServiceCheck> {
  const redisUrl = process.env.REDIS_URL;

  if (!redisUrl) {
    return {
      name: "Redis",
      status: "skipped",
      message: "Skipped — REDIS_URL is missing.",
    };
  }

  const redis = new Redis(redisUrl, {
    connectTimeout: 5000,
    enableReadyCheck: false,
    lazyConnect: true,
    maxRetriesPerRequest: null,
  });

  redis.on("error", () => undefined);

  try {
    await withTimeout(redis.connect(), 5000);
    const pong = await withTimeout(redis.ping(), 5000);
    return {
      name: "Redis",
      status: pong === "PONG" ? "ready" : "invalid",
      message:
        pong === "PONG" ? "PING returned PONG." : `Unexpected response: ${pong}`,
    };
  } catch (error) {
    return {
      name: "Redis",
      status: "invalid",
      message: error instanceof Error ? error.message : "Connection failed.",
    };
  } finally {
    redis.disconnect();
  }
}

async function checkSupabaseAdmin(): Promise<ServiceCheck> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return {
      name: "Supabase Admin",
      status: "skipped",
      message: "Skipped — NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is missing.",
    };
  }

  try {
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { error } = await withTimeout(
      supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1 }),
      5000
    );

    if (error) {
      return { name: "Supabase Admin", status: "invalid", message: error.message };
    }

    return {
      name: "Supabase Admin",
      status: "ready",
      message: "Service role key can reach the Auth Admin API.",
    };
  } catch (error) {
    return {
      name: "Supabase Admin",
      status: "invalid",
      message: error instanceof Error ? error.message : "Connection failed.",
    };
  }
}

async function checkGroq(): Promise<ServiceCheck> {
  const apiKey = process.env.GROQ_API_KEY;

  if (!apiKey) {
    return {
      name: "Groq",
      status: "skipped",
      message: "Skipped — GROQ_API_KEY is missing.",
    };
  }

  try {
    const res = await withTimeout(
      fetch("https://api.groq.com/openai/v1/models", {
        headers: { Authorization: `Bearer ${apiKey}` },
      }),
      5000
    );

    if (res.status === 401) {
      return { name: "Groq", status: "invalid", message: "API key rejected (401)." };
    }

    if (!res.ok) {
      return { name: "Groq", status: "invalid", message: `Unexpected status ${res.status}.` };
    }

    return {
      name: "Groq",
      status: "ready",
      message: "API key accepted — models endpoint reachable.",
    };
  } catch (error) {
    return {
      name: "Groq",
      status: "invalid",
      message: error instanceof Error ? error.message : "Request failed.",
    };
  }
}

async function checkGemini(): Promise<ServiceCheck> {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return {
      name: "Gemini",
      status: "skipped",
      message: "Skipped — GEMINI_API_KEY is missing.",
    };
  }

  try {
    // try v1beta first, fall back to v1 (newer AQ. keys may use either)
    const endpoints = [
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001?key=${apiKey}`,
      `https://generativelanguage.googleapis.com/v1/models/gemini-embedding-001?key=${apiKey}`,
    ];

    let lastStatus = 0;
    for (const url of endpoints) {
      const res = await withTimeout(fetch(url), 5000);
      if (res.ok) {
        return {
          name: "Gemini",
          status: "ready",
          message: "API key accepted — gemini-embedding-001 is reachable.",
        };
      }
      lastStatus = res.status;
    }

    if (lastStatus === 400 || lastStatus === 401 || lastStatus === 403) {
      return { name: "Gemini", status: "invalid", message: `API key rejected (${lastStatus}).` };
    }

    return { name: "Gemini", status: "invalid", message: `Unexpected status ${lastStatus}.` };
  } catch (error) {
    return {
      name: "Gemini",
      status: "invalid",
      message: error instanceof Error ? error.message : "Request failed.",
    };
  }
}

export async function getEnvReport(): Promise<EnvReport> {
  const envChecks = getEnvChecks();
  const serviceChecks = await Promise.all([
    checkPostgres(),
    checkSupabaseAdmin(),
    checkRedis(),
    checkGroq(),
    checkGemini(),
  ]);

  return {
    generatedAt: new Date().toISOString(),
    envChecks,
    serviceChecks,
  };
}
