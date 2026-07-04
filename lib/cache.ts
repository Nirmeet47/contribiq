export async function getCachedJson<T>(cacheKey: string, label: string) {
  try {
    const { redis } = await import("@/lib/redis");
    const cached = await redis.get(cacheKey);
    return cached ? (JSON.parse(cached) as T) : null;
  } catch (error) {
    console.error(`[${label}] Failed to read cache`, { cacheKey, error });
    return null;
  }
}

export async function setCachedJson(
  cacheKey: string,
  payload: unknown,
  ttlSeconds: number,
  label: string
) {
  try {
    const { redis } = await import("@/lib/redis");
    await redis.set(cacheKey, JSON.stringify(payload), "EX", ttlSeconds);
  } catch (error) {
    console.error(`[${label}] Failed to write cache`, { cacheKey, error });
  }
}
