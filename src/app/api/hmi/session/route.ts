import { newSessionEncoded } from "@/lib/server/hmiEngine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Mints a fresh demo session (all five devices seeded with their incident). */
export function POST() {
  return Response.json({ ok: true, session: newSessionEncoded() });
}
