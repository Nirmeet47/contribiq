import { getEnvReport } from "@/lib/env-checks";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const report = await getEnvReport();

  return Response.json(report);
}
