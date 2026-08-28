import { clearMaintenanceLogs } from "@/lib/server/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  clearMaintenanceLogs();
  return Response.json({ ok: true });
}
