import { getHmiEngine } from "@/lib/server/hmiEngine";
import { frameToContext, frameDiagnosis } from "@/lib/machineContext/replay";
import { buildOverviewScreen } from "@/lib/server/contextEngine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/hmi/replay          → the active device's DVR timeline (frames + events)
 * GET /api/hmi/replay?t=<ms>   → the frame at that instant + the reconstructed HMI screen
 */
export async function GET(request: Request) {
  const engine = getHmiEngine();
  const replay = engine.getReplay();
  const t = new URL(request.url).searchParams.get("t");

  if (t) {
    const target = Number(t);
    const frame = replay.frames.reduce<null | (typeof replay.frames)[number]>((acc, f) => (f.t <= target ? f : acc), replay.frames[0] ?? null);
    if (!frame) return Response.json({ ok: false, error: "no frames" }, { status: 404 });
    const spec = engine.getSpecForDevice(frame.deviceId);
    const ctx = frameToContext(frame, spec);
    const screen = buildOverviewScreen(ctx, frameDiagnosis(frame, spec), `Replay @ ${frame.clock}`);
    return Response.json({ ok: true, frame, screen });
  }

  return Response.json({ ok: true, ...replay });
}
