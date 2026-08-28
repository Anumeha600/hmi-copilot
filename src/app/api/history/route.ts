import { listMaintenanceLogs } from "@/lib/server/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({ entries: listMaintenanceLogs() });
}
