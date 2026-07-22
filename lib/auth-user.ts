import { prisma } from "@/lib/prisma";
import { createClient } from "@/utils/supabase/server";

type UserFindUniqueArgs = NonNullable<Parameters<typeof prisma.user.findUnique>[0]>;
type UserSelect = UserFindUniqueArgs["select"];

export async function getCurrentAuthUser() {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) return null;
  return user;
}

export async function getCurrentDbUser<TSelect extends UserSelect>(
  select: TSelect
) {
  const user = await getCurrentAuthUser();
  if (!user) return null;

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
