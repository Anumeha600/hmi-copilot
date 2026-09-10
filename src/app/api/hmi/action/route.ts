import { applyHmiAction, type ActionRequest } from "@/lib/server/hmiEngine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VALID = new Set<ActionRequest["action"]>([
  "device_start",
  "device_stop",
  "set_mode",
  "acknowledge",
  "resolve",
  "valve",
  "emergency_stop",
  "set_screen",
  "set_device",
  "set_manual_values",
  "run_incident",
]);

export async function POST(request: Request) {
  let body: ActionRequest;
  try {
    body = (await request.json()) as ActionRequest;
  } catch {
    return Response.json({ ok: false, error: "invalid JSON body" }, { status: 400 });
  }

  if (!body.action || !VALID.has(body.action)) {
    return Response.json({ ok: false, error: "unknown action" }, { status: 400 });
  }

  const result = applyHmiAction(body);
  return Response.json(result, { status: result.ok || result.needsAuth ? 200 : 409 });
}
