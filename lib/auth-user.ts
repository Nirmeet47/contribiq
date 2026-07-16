import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { createClient } from "@/utils/supabase/server";

export async function getCurrentDbUser<TSelect extends Prisma.UserSelect>(
  select: TSelect
) {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) return null;

  const githubIdStr = user.user_metadata?.provider_id;
  if (!githubIdStr) return null;

  return prisma.user.findUnique({
    where: { githubId: parseInt(githubIdStr, 10) },
    select,
  });
}

export async function getCurrentDbUserId() {
  const dbUser = await getCurrentDbUser({ id: true });
  return dbUser?.id ?? null;
}
