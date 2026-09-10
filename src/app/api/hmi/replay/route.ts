import { buildReplay, specForDevice } from "@/lib/server/hmiEngine";
import { resolveSession } from "@/lib/machineContext/sessionState";
import { frameToContext, frameDiagnosis, type TimelineEvent } from "@/lib/machineContext/replay";
import { buildOverviewScreen } from "@/lib/server/contextEngine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Body {
  session?: string;
  events?: TimelineEvent[];
  /** epoch ms — return the frame + reconstructed screen for this instant */
  t?: number;
}

/**
 * POST /api/hmi/replay  { session, events?, t? }
 *   → the active device's DVR timeline (frames + events), pure-reconstructed
 *   → with `t`: the frame at that instant + the dynamic HMI screen rebuilt from it
 */
export async function POST(request: Request) {
  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    body = {};
  }

  const replay = buildReplay(body.session, body.events ?? []);

  if (typeof body.t === "number") {
    const frame = replay.frames.reduce<null | (typeof replay.frames)[number]>((acc, f) => (f.t <= body.t! ? f : acc), replay.frames[0] ?? null);
    if (!frame) return Response.json({ ok: false, error: "no frames" }, { status: 404 });
    const session = resolveSession(body.session);
    const spec = specForDevice(session.activeDeviceId);
    const ctx = frameToContext(frame, spec);
    const screen = buildOverviewScreen(ctx, frameDiagnosis(frame, spec), `Replay @ ${frame.clock}`);
    return Response.json({ ok: true, frame, screen });
  }

  return Response.json({ ok: true, ...replay });
}
