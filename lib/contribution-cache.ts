export async function invalidateContributionStats(userId: string) {
  try {
    const { getRedis } = await import("@/lib/redis");
    const { prisma } = await import("@/lib/prisma");
    const { getProfileCacheKey } = await import("@/lib/public-profile");

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { username: true },
    });

    const keys = [`contributions:stats:${userId}`];
    if (user) keys.push(getProfileCacheKey(user.username));

    await getRedis().del(...keys);
  } catch (error) {
    console.error("[contributions] Failed to invalidate stats cache", {
      userId,
      error,
    });
  }
}
