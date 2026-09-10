import { getHmiEngine } from "@/lib/server/hmiEngine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Keep the SSE connection open as long as the platform allows. The browser's
// EventSource reconnects automatically when it is cut, and the engine advances
// its simulation on read, so state stays coherent across reconnects.
export const maxDuration = 60;

function sseFrame(data: unknown): string {
  return `data: ${JSON.stringify(data)}\n\n`;
}

export async function GET(request: Request) {
  const engine = getHmiEngine();
  const encoder = new TextEncoder();
  let unsubscribe: (() => void) | null = null;
  let ticker: ReturnType<typeof setInterval> | null = null;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const push = (data: unknown) => {
        try {
          controller.enqueue(encoder.encode(sseFrame(data)));
        } catch {
          /* client disconnected */
        }
      };

      push(engine.getSnapshot());
      // Event-driven pushes (immediate reaction to control actions).
      unsubscribe = engine.subscribe(push);
      // Self-driven heartbeat: guarantees a fresh frame every second even if the
      // platform froze the engine's own timer between invocations. getSnapshot()
      // advances the simulation to "now".
      ticker = setInterval(() => push(engine.getSnapshot()), 1000);
    },
    cancel() {
      unsubscribe?.();
      unsubscribe = null;
      if (ticker) clearInterval(ticker);
      ticker = null;
    },
  });

  request.signal.addEventListener("abort", () => {
    unsubscribe?.();
    unsubscribe = null;
    if (ticker) clearInterval(ticker);
    ticker = null;
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
