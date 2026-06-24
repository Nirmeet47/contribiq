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
  label: string;
  category: string;
  required: boolean;
  source: string;
  validate?: (value: string) => string | null;
};

const envDefinitions: EnvDefinition[] = [
  {
    name: "DATABASE_URL",
    label: "Runtime Postgres URL",
    category: "Supabase Postgres",
    required: true,
    source:
      "Supabase Dashboard > Project Settings > Database > Connection string > Transaction pooler, port 6543",
    validate: (value) =>
      value.startsWith("postgresql://") || value.startsWith("postgres://")
        ? null
        : "Expected a postgres connection string.",
  },
  {
    name: "DIRECT_URL",
    label: "Direct Postgres URL",
    category: "Supabase Postgres",
    required: true,
    source:
      "Supabase Dashboard > Project Settings > Database > Connection string > Direct connection, port 5432",
    validate: (value) =>
      value.startsWith("postgresql://") || value.startsWith("postgres://")
        ? null
        : "Expected a postgres connection string.",
  },
  {
    name: "NEXT_PUBLIC_SUPABASE_URL",
    label: "Supabase project URL",
    category: "Supabase Auth",
    required: true,
    source: "Supabase Dashboard > Project Settings > API > Project URL",
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
    source: "Supabase Dashboard > Project Settings > API > anon public key",
    validate: (value) =>
      value.startsWith("eyJ") ? null : "Expected a JWT-looking key.",
  },
  {
    name: "SUPABASE_SERVICE_ROLE_KEY",
    label: "Supabase service role key",
    category: "Supabase Auth",
    required: true,
    source: "Supabase Dashboard > Project Settings > API > service_role secret key",
    validate: (value) =>
      value.startsWith("eyJ") ? null : "Expected a JWT-looking key.",
  },
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
    name: "GITHUB_PAT",
    label: "GitHub personal access token",
    category: "GitHub",
    required: false,
    source:
      "GitHub > Settings > Developer settings > Personal access tokens; used as a fallback for unauthenticated API calls",
  },
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
  {
    name: "OPENAI_API_KEY",
    label: "OpenAI API key",
    category: "AI",
    required: true,
    source:
      "OpenAI Platform > API keys; used for text-embedding-3-small vectors",
    validate: (value) =>
      value.startsWith("sk-") ? null : "Expected a key beginning with sk-.",
  },
  {
    name: "ANTHROPIC_API_KEY",
    label: "Anthropic API key",
    category: "AI",
    required: true,
    source:
      "Anthropic Console > API Keys; used for Claude issue classification and summaries",
    validate: (value) =>
      value.startsWith("sk-ant-")
        ? null
        : "Expected a key beginning with sk-ant-.",
  },
  {
    name: "NEXT_PUBLIC_APP_URL",
    label: "Public app URL",
    category: "App",
    required: true,
    source:
      "Your local or deployed app origin, for example http://localhost:3000",
    validate: (value) => {
      try {
        new URL(value);
        return null;
      } catch {
        return "Expected a valid URL.";
      }
    },
  },
  {
    name: "GITHUB_WEBHOOK_SECRET",
    label: "GitHub webhook secret",
    category: "App",
    required: true,
    source:
      "Generate a random string and paste the same value into GitHub repo webhook settings > Secret",
  },
];

function maskValue(value: string | undefined): string {
  if (!value) {
    return "";
  }

  if (value.length <= 10) {
    return `${value.slice(0, 2)}...`;
  }

  return `${value.slice(0, 6)}...${value.slice(-4)}`;
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
    const rawValue = process.env[definition.name];

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
      message: "Skipped because DATABASE_URL is missing.",
    };
  }

  const client = new PgClient({ connectionString: databaseUrl });

  try {
    await withTimeout(client.connect(), 5000);
    await withTimeout(client.query("select 1"), 5000);

    return {
      name: "Postgres",
      status: "ready",
      message: "Connected and SELECT 1 succeeded.",
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
      message: "Skipped because REDIS_URL is missing.",
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
        pong === "PONG" ? "PING returned PONG." : `Unexpected PING: ${pong}`,
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
      message:
        "Skipped because NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is missing.",
    };
  }

  try {
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    const { error } = await withTimeout(
      supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1 }),
      5000
    );

    if (error) {
      return {
        name: "Supabase Admin",
        status: "invalid",
        message: error.message,
      };
    }

    return {
      name: "Supabase Admin",
      status: "ready",
      message: "Service role key can call the Auth Admin API.",
    };
  } catch (error) {
    return {
      name: "Supabase Admin",
      status: "invalid",
      message: error instanceof Error ? error.message : "Connection failed.",
    };
  }
}

export async function getEnvReport(): Promise<EnvReport> {
  const envChecks = getEnvChecks();
  const serviceChecks = await Promise.all([
    checkPostgres(),
    checkRedis(),
    checkSupabaseAdmin(),
  ]);

  return {
    generatedAt: new Date().toISOString(),
    envChecks,
    serviceChecks,
  };
}
