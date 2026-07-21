export type RateLimitResult = {
  allowed: boolean;
  count: number;
  limit: number;
  remaining: number;
  retryAfterSeconds: number;
};

type RateLimitOptions = {
  key: string;
  limit: number;
  windowSeconds: number;
};

function buildRateLimitKey(key: string) {
  return `ratelimit:${key}`;
}

function normalizeTtl(ttlSeconds: number, fallbackSeconds: number) {
  return ttlSeconds > 0 ? ttlSeconds : fallbackSeconds;
}

export async function checkRateLimit({
  key,
  limit,
  windowSeconds,
}: RateLimitOptions): Promise<RateLimitResult> {
  const redisKey = buildRateLimitKey(key);

  try {
    const { redis } = await import("@/lib/redis");
    const count = await redis.incr(redisKey);
    if (count === 1) {
      await redis.expire(redisKey, windowSeconds);
    }
    const retryAfterSeconds = normalizeTtl(await redis.ttl(redisKey), windowSeconds);

    return {
      allowed: count <= limit,
      count,
      limit,
      remaining: Math.max(limit - count, 0),
      retryAfterSeconds,
    };
  } catch (error) {
    console.error("[rate-limit] Redis check failed; allowing request", { key, error });
    return {
      allowed: true,
      count: 0,
      limit,
      remaining: limit,
      retryAfterSeconds: 0,
    };
  }
}

export async function getRateLimitStatus({
  key,
  limit,
  windowSeconds,
}: RateLimitOptions): Promise<RateLimitResult> {
  const redisKey = buildRateLimitKey(key);

  try {
    const { redis } = await import("@/lib/redis");
    const rawCount = await redis.get(redisKey);
    const retryAfterSeconds = normalizeTtl(await redis.ttl(redisKey), windowSeconds);
    const count = rawCount ? Number.parseInt(rawCount, 10) : 0;
    const safeCount = Number.isFinite(count) ? count : 0;

    return {
      allowed: safeCount < limit,
      count: safeCount,
      limit,
      remaining: Math.max(limit - safeCount, 0),
      retryAfterSeconds,
    };
  } catch (error) {
    console.error("[rate-limit] Redis status check failed; reporting full quota", { key, error });
    return {
      allowed: true,
      count: 0,
      limit,
      remaining: limit,
      retryAfterSeconds: 0,
    };
  }
}

export function rateLimitHeaders(result: RateLimitResult) {
  return {
    "Retry-After": String(result.retryAfterSeconds),
    "X-RateLimit-Limit": String(result.limit),
    "X-RateLimit-Remaining": String(result.remaining),
    "X-RateLimit-Reset": String(result.retryAfterSeconds),
  };
}

export function scopedRateLimitHeaders(scope: string, result: RateLimitResult) {
  return {
    [`X-RateLimit-${scope}-Limit`]: String(result.limit),
    [`X-RateLimit-${scope}-Remaining`]: String(result.remaining),
    [`X-RateLimit-${scope}-Reset`]: String(result.retryAfterSeconds),
  };
}
