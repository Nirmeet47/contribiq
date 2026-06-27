import { NextResponse } from "next/server";
import { encryptGithubToken } from "@/lib/github-token";
import { matchScoringQueue } from "@/lib/queues";
import { canonicalizeSkills } from "@/lib/skills";
import { createClient } from "@/utils/supabase/server";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

export const dynamic = "force-dynamic";

const updateMeSchema = z.object({
  interests: z.array(z.string()).optional(),
  timeCommitment: z.number().int().min(0).optional(),
  onboarded: z.boolean().optional(),
});

function omitGithubToken<T extends { githubToken?: string | null }>(user: T) {
  const safeUser = { ...user };
  delete safeUser.githubToken;
  return safeUser;
}

function formatSafeUser<T extends { githubToken?: string | null; skillProfile?: { skills?: any[] } | null }>(
  dbUser: T
) {
  return omitGithubToken({
    ...dbUser,
    skillProfile: dbUser.skillProfile
      ? {
          ...dbUser.skillProfile,
          skills: canonicalizeSkills(dbUser.skillProfile.skills ?? []),
        }
      : null,
  });
}

async function recoverDbUserFromSession(
  supabase: Awaited<ReturnType<typeof createClient>>,
  user: { user_metadata?: Record<string, any>; email?: string }
) {
  const githubIdStr = user.user_metadata?.provider_id;
  const githubId = githubIdStr ? Number.parseInt(githubIdStr, 10) : null;

  if (!githubId || Number.isNaN(githubId)) {
    return {
      error: NextResponse.json(
        {
          error:
            "No GitHub ID found on session. Please sign out and reconnect GitHub to repair your account.",
        },
        { status: 409 }
      ),
    };
  }

  const usernameBase =
    user.user_metadata?.user_name ||
    user.user_metadata?.preferred_username ||
    user.email?.split("@")[0] ||
    `user_${githubId}`;
  const username = String(usernameBase).trim() || `user_${githubId}`;
  const existingUsernameOwner = await prisma.user.findUnique({
    where: { username },
    select: { githubId: true },
  });
  const safeUsername =
    existingUsernameOwner && existingUsernameOwner.githubId !== githubId
      ? `${username}_${githubId}`
      : username;
  const { data: sessionData } = await supabase.auth.getSession();
  const githubToken = encryptGithubToken(sessionData.session?.provider_token ?? null);

  console.warn("[api/me] Recovering missing Prisma user from Supabase session", {
    githubId,
    username: safeUsername,
  });

  const recoveredUser = await prisma.user.upsert({
    where: { githubId },
    update: {
      username: safeUsername,
      name: user.user_metadata?.full_name || null,
      avatarUrl: user.user_metadata?.avatar_url || null,
      ...(githubToken ? { githubToken } : {}),
    },
    create: {
      githubId,
      username: safeUsername,
      name: user.user_metadata?.full_name || null,
      avatarUrl: user.user_metadata?.avatar_url || null,
      githubToken,
      onboarded: false,
      profileAnalyzed: false,
      skillProfile: { create: {} },
    },
    include: {
      skillProfile: {
        include: { skills: true },
      },
    },
  });

  if (!recoveredUser.skillProfile) {
    await prisma.skillProfile.create({ data: { userId: recoveredUser.id } });
    return prisma.user.findUniqueOrThrow({
      where: { id: recoveredUser.id },
      include: {
        skillProfile: {
          include: { skills: true },
        },
      },
    });
  }

  return recoveredUser;
}

export async function GET() {
  try {
    const supabase = await createClient();
    
    // Get the authenticated user from Supabase
    const { data: { user }, error } = await supabase.auth.getUser();

    if (error || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Extract github ID
    const githubIdStr = user.user_metadata?.provider_id;
    if (!githubIdStr) {
      return NextResponse.json({ error: "No GitHub ID found on session" }, { status: 400 });
    }

    const githubId = parseInt(githubIdStr, 10);

    // Get the user from our Prisma DB
    const dbUser = await prisma.user.findUnique({
      where: { githubId },
      include: {
        skillProfile: {
          include: { skills: true }
        }
      }
    });

    if (!dbUser) {
      const recovered = await recoverDbUserFromSession(supabase, user);
      if ("error" in recovered) return recovered.error;

      return NextResponse.json(formatSafeUser(recovered));
    }

    // Never return the token to the client
    return NextResponse.json(formatSafeUser(dbUser));
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();

    if (error || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const githubIdStr = user.user_metadata?.provider_id;
    if (!githubIdStr) {
      return NextResponse.json({ error: "No GitHub ID found on session" }, { status: 400 });
    }

    const body = updateMeSchema.parse(await request.json());
    const githubId = parseInt(githubIdStr, 10);

    let existingUser = await prisma.user.findUnique({
      where: { githubId },
      select: {
        id: true,
        interests: true,
        timeCommitment: true,
        profileAnalyzed: true,
        onboarded: true,
      },
    });

    if (!existingUser) {
      const recovered = await recoverDbUserFromSession(supabase, user);
      if ("error" in recovered) return recovered.error;

      existingUser = await prisma.user.findUnique({
        where: { githubId },
        select: {
          id: true,
          interests: true,
          timeCommitment: true,
          profileAnalyzed: true,
          onboarded: true,
        },
      });

      if (!existingUser) {
        return NextResponse.json(
          { error: "Account recovery failed. Please sign out and reconnect GitHub." },
          { status: 500 }
        );
      }
    }

    if (body.onboarded === true) {
      const nextInterests = body.interests ?? existingUser.interests;
      const nextTimeCommitment = body.timeCommitment ?? existingUser.timeCommitment;

      if (!existingUser.profileAnalyzed) {
        return NextResponse.json(
          { error: "Profile analysis must complete before onboarding can finish" },
          { status: 400 }
        );
      }

      if (nextInterests.length === 0 || nextTimeCommitment <= 0) {
        return NextResponse.json(
          { error: "Interests and time commitment are required to finish onboarding" },
          { status: 400 }
        );
      }
    }

    const updatedUser = await prisma.user.update({
      where: { githubId },
      data: body,
      select: { id: true, onboarded: true },
    });

    if (body.onboarded === true && !existingUser.onboarded && updatedUser.onboarded) {
      try {
        await matchScoringQueue.add("score-matches", { userId: updatedUser.id });
      } catch (error) {
        console.error("[api/me] Failed to enqueue match scoring after onboarding", {
          userId: updatedUser.id,
          error,
        });
      }
    }

    return NextResponse.json({ success: true });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: z.treeifyError(e) }, { status: 400 });
    }

    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
