import { NextResponse } from "next/server";
import { getCurrentDbUserId } from "@/lib/auth-user";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  const userId = await getCurrentDbUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const items = await prisma.workingOn.findMany({
    where: {
      userId,
      issue: { state: "open" },
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      createdAt: true,
      issue: {
        select: {
          id: true,
          title: true,
          aiSummary: true,
          difficulty: true,
          estimatedHours: true,
          issueType: true,
          githubUrl: true,
          requiredSkills: true,
          repo: {
            select: {
              id: true,
              owner: true,
              name: true,
              fullName: true,
              language: true,
            },
          },
        },
      },
    },
  });

  return NextResponse.json({
    count: items.length,
    items: items.map((item) => ({
      id: item.id,
      createdAt: item.createdAt,
      issue: item.issue,
    })),
  });
}
