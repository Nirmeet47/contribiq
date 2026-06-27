import { redis } from "@/lib/redis";

export async function invalidateContributionStats(userId: string) {
  try {
    await redis.del(`contributions:stats:${userId}`);
  } catch (error) {
    console.error("[contributions] Failed to invalidate stats cache", {
      userId,
      error,
    });
  }
}
