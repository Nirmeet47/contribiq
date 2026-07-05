import { redis } from "@/lib/redis";

export async function invalidateContributionStats(userId: string) {
  try {
    const profileKeys = await redis.keys("profile:*");
    await redis.del(`contributions:stats:${userId}`, ...profileKeys);
  } catch (error) {
    console.error("[contributions] Failed to invalidate stats cache", {
      userId,
      error,
    });
  }
}
