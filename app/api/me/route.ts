import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

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
    const { githubToken, ...safeUser } = dbUser;

    return NextResponse.json(safeUser);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
