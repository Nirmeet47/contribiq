import { getRedis } from "@/lib/redis";

export async function invalidateContributionStats(userId: string) {
  try {
    const profileKeys = await getRedis().keys("profile:*");
    await getRedis().del(`contributions:stats:${userId}`, ...profileKeys);
  } catch (error) {
    console.error("[contributions] Failed to invalidate stats cache", {
      userId,
      error,
    });
  }
}
