import { getHmiEngine } from "@/lib/server/hmiEngine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function sseFrame(data: unknown): string {
  return `data: ${JSON.stringify(data)}\n\n`;
}

export async function GET(request: Request) {
  const engine = getHmiEngine();
  const encoder = new TextEncoder();
  let unsubscribe: (() => void) | null = null;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(sseFrame(engine.getSnapshot())));
      unsubscribe = engine.subscribe((payload) => {
        try {
          controller.enqueue(encoder.encode(sseFrame(payload)));
        } catch {
          // client disconnected
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
