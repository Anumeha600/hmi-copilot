import { getTelemetryEngine } from "@/lib/server/telemetryEngine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function sseFrame(data: unknown): string {
  return `data: ${JSON.stringify(data)}\n\n`;
}

export async function GET(request: Request) {
  const engine = getTelemetryEngine();
  const encoder = new TextEncoder();
  let unsubscribe: (() => void) | null = null;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(sseFrame(engine.getSnapshot())));
      unsubscribe = engine.subscribe((payload) => {
        try {
          controller.enqueue(encoder.encode(sseFrame(payload)));
        } catch {
          // stream already closed by the client disconnecting
        }
      });
    },
    cancel() {
      unsubscribe?.();
      unsubscribe = null;
    },
  });

  request.signal.addEventListener("abort", () => {
    unsubscribe?.();
    unsubscribe = null;
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}

interface ControlBody {
  action: "start" | "pause" | "reset" | "acknowledge" | "emergency_stop";
  ruleId?: string;
}

export async function POST(request: Request) {
  const engine = getTelemetryEngine();

  let body: ControlBody;
  try {
    body = (await request.json()) as ControlBody;
  } catch {
    return Response.json({ ok: false, error: "invalid JSON body" }, { status: 400 });
  }

  switch (body.action) {
    case "start":
      engine.start();
      break;
    case "pause":
      engine.pause();
      break;
    case "reset":
      engine.reset();
      break;
    case "emergency_stop":
      engine.emergencyStop();
      break;
    case "acknowledge":
      if (!body.ruleId) {
        return Response.json({ ok: false, error: "ruleId required" }, { status: 400 });
      }
      engine.acknowledge(body.ruleId);
      break;
    default:
      return Response.json({ ok: false, error: "unknown action" }, { status: 400 });
  }

  return Response.json({ ok: true });
}
