import { NextResponse } from "next/server";
import { getCurrentAuthUser, getCurrentDbUser } from "@/lib/auth-user";

export async function getCurrentAdminUserId() {
  const user = await getCurrentDbUser({ id: true, role: true });
  if (!user || user.role !== "ADMIN") return null;
  return user.id;
}

export async function requireCurrentAdminUserId() {
  const authUser = await getCurrentAuthUser();
  if (!authUser) {
    return {
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  const adminUserId = await getCurrentAdminUserId();
  if (!adminUserId) {
    return {
      error: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }

  return { userId: adminUserId };
}
