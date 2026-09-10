export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Lightweight health probe for the hosting platform. Exposes no secrets,
 * environment variables, or implementation details.
 */
export function GET() {
  return Response.json({ ok: true, service: "HMI COPILOT" });
}
