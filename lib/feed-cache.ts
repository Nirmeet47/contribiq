import { redis } from "@/lib/redis";

export const FEED_CACHE_VERSION = "v5";
export const FEED_CACHE_TTL_SECONDS = 300;

async function keysByPattern(pattern: string) {
  const keys: string[] = [];
  let cursor = "0";

  do {
    const [nextCursor, batch] = await redis.scan(cursor, "MATCH", pattern, "COUNT", 100);
    cursor = nextCursor;
    keys.push(...batch);
  } while (cursor !== "0");

  return keys;
}

async function deleteKeys(keys: string[]) {
  for (let index = 0; index < keys.length; index += 100) {
    const batch = keys.slice(index, index + 100);
    if (batch.length > 0) {
      await redis.del(...batch);
    }
  }
}

export async function invalidateAllFeedCaches(reason: string) {
  try {
    const feedKeys = await keysByPattern("feed*");
    await deleteKeys(feedKeys);
  } catch (error) {
    console.error("[feed] Failed to invalidate feed cache", { reason, error });
  }
}

export async function invalidateUserFeedCaches(userId: string, reason: string) {
  try {
    const feedKeys = [
      ...(await keysByPattern(`feed:${userId}:*`)),
      ...(await keysByPattern(`feed:*:${userId}:*`)),
    ];
    await deleteKeys([...new Set(feedKeys)]);
  } catch (error) {
    console.error("[feed] Failed to invalidate user feed cache", { userId, reason, error });
  }
}
