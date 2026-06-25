import { NextResponse } from "next/server";
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
      return NextResponse.json({ error: "User not found in database" }, { status: 404 });
    }

    // Never return the token to the client
    return NextResponse.json(omitGithubToken(dbUser));
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

    await prisma.user.update({
      where: { githubId },
      data: body,
    });

    return NextResponse.json({ success: true });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: z.treeifyError(e) }, { status: 400 });
    }

    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
