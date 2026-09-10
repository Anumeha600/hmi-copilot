import { getHmiEngine } from "@/lib/server/hmiEngine";
import { runCopilot, type CopilotRequest } from "@/lib/server/copilotReasoner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VALID_INTENTS = new Set([
  "explain_event",
  "ask",
  "generate_screen",
  "show_root_cause",
  "open_sop",
  "propose_control_action",
  "shift_handover",
  "replay_event",
  "golden_path",
  "time_travel",
  "explain_component",
]);

export async function POST(request: Request) {
  let body: CopilotRequest;
  try {
    body = (await request.json()) as CopilotRequest;
  } catch {
    return Response.json({ ok: false, error: "invalid JSON body" }, { status: 400 });
  }

  if (!body.intent || !VALID_INTENTS.has(body.intent)) {
    return Response.json({ ok: false, error: "unknown intent" }, { status: 400 });
  }

  const engine = getHmiEngine();
  const ctx = engine.getContext();
  const response = await runCopilot(body, ctx);

  const payload: Record<string, unknown> = { ok: true, ...response };
  if (response.openTimeTravel) payload.replay = engine.getReplay();

  return Response.json(payload);
}
