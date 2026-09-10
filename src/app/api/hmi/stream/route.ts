import { buildStreamPayload } from "@/lib/server/hmiEngine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Stream while the platform allows; the browser reconnects when it is cut and
// state stays coherent because the payload is a pure function of (session, now).
export const maxDuration = 60;

function sseFrame(data: unknown): string {
  return `data: ${JSON.stringify(data)}\n\n`;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const sessionStr = url.searchParams.get("s");
  const encoder = new TextEncoder();
  let ticker: ReturnType<typeof setInterval> | null = null;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const push = () => {
        try {
          controller.enqueue(encoder.encode(sseFrame(buildStreamPayload(sessionStr))));
        } catch {
          /* client disconnected */
        }
      };
      push();
      ticker = setInterval(push, 1000);
    },
    cancel() {
      if (ticker) clearInterval(ticker);
      ticker = null;
    },
  });

  request.signal.addEventListener("abort", () => {
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
