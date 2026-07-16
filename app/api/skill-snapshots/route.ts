import { NextResponse } from "next/server";
import { getCurrentDbUserId } from "@/lib/auth-user";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  const userId = await getCurrentDbUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const snapshots = await prisma.skillSnapshot.findMany({
    where: { userId },
    orderBy: { takenAt: "asc" },
    select: {
      id: true,
      snapshot: true,
      takenAt: true,
    },
  });

  return NextResponse.json({ snapshots });
}
