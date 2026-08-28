import { getTelemetryEngine } from "@/lib/server/telemetryEngine";
import { buildDiagnosis, buildFallbackReport } from "@/lib/server/diagnosis";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const DEFAULT_MODEL = "llama-3.3-70b-versatile";

// The model is strictly a formatter, never a diagnostician: every fact in the
// report must come verbatim from the JSON it's given — nothing computed or guessed.
const SYSTEM_PROMPT = `You are an engineering report writer for an industrial predictive-maintenance HMI.

You will be given a structured JSON "diagnosis" object. Every field in it was already
computed by a deterministic local regression/rule engine — sensor readings, component
health percentages, model-estimated failure probabilities, Remaining Useful Life (RUL)
labels, trend directions, prediction confidence, active alerts, root causes, and
time-to-failure estimates are all final, verified facts.

You must NEVER calculate, re-derive, or adjust an RUL or failure-probability value yourself
— reproduce the given rulLabel/trendDescription/predictionConfidence fields exactly as provided.

Your ONLY job is to rewrite this data into a clear, professional maintenance report for a
plant engineer. Rules:
- Do NOT diagnose, predict, or infer anything beyond what is explicitly present in the JSON.
- Do NOT invent, adjust, or round differently any number that isn't already in the input.
- Do NOT suggest a root cause or recommended action that isn't already stated in the input.
- If a field is null or the alert list is empty, say so plainly — do not fill the gap.
- Structure the report with short sections: Executive Summary, Machine Status, Component
  Health, Active Alerts & Root Cause, Recommended Actions, Operator Load.
- Write in plain, professional English. No markdown headers with "#", use plain section titles.`;

interface GroqChoice {
  message?: { content?: string };
}

interface GroqResponse {
  choices?: GroqChoice[];
}

export async function POST() {
  const payload = getTelemetryEngine().getSnapshot();
  const diagnosis = buildDiagnosis(payload);

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return Response.json({
      ok: true,
      source: "fallback" as const,
      diagnosis,
      report: buildFallbackReport(diagnosis),
      warning: "GROQ_API_KEY is not configured — showing a locally formatted report instead of an AI-generated one.",
    });
  }

  try {
    const res = await fetch(GROQ_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: process.env.GROQ_MODEL || DEFAULT_MODEL,
        temperature: 0.2,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
            content: `Structured diagnosis JSON (already computed locally — treat every value as fixed fact, do not alter it):\n\n${JSON.stringify(diagnosis, null, 2)}\n\nWrite the maintenance report now.`,
          },
        ],
      }),
    });

    if (!res.ok) {
      return Response.json({
        ok: true,
        source: "fallback" as const,
        diagnosis,
        report: buildFallbackReport(diagnosis),
        warning: `Groq API request failed (HTTP ${res.status}) — showing a locally formatted report instead.`,
      });
    }

    const json = (await res.json()) as GroqResponse;
    const report = json.choices?.[0]?.message?.content?.trim();

    if (!report) {
      return Response.json({
        ok: true,
        source: "fallback" as const,
        diagnosis,
        report: buildFallbackReport(diagnosis),
        warning: "Groq API returned an empty response — showing a locally formatted report instead.",
      });
    }

    return Response.json({ ok: true, source: "groq" as const, diagnosis, report });
  } catch {
    return Response.json({
      ok: true,
      source: "fallback" as const,
      diagnosis,
      report: buildFallbackReport(diagnosis),
      warning: "Could not reach the Groq API — showing a locally formatted report instead.",
    });
  }
}
