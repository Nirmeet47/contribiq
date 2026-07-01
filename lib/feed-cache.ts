import { redis } from "@/lib/redis";

export async function invalidateAllFeedCaches(reason: string) {
  try {
    const feedKeys = await redis.keys("feed*");
    if (feedKeys.length > 0) {
      await redis.del(...feedKeys);
    }
  } catch (error) {
    console.error("[feed] Failed to invalidate feed cache", { reason, error });
  }
}

export async function invalidateUserFeedCaches(userId: string, reason: string) {
  try {
    const feedKeys = [
      ...(await redis.keys(`feed:${userId}:*`)),
      ...(await redis.keys(`feed:*:${userId}:*`)),
    ];
    if (feedKeys.length > 0) {
      await redis.del(...feedKeys);
    }
  } catch (error) {
    console.error("[feed] Failed to invalidate user feed cache", { userId, reason, error });
  }
}
