"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { FileText, Loader2, TriangleAlert, X } from "lucide-react";

interface ReportResponse {
  ok: boolean;
  source: "groq" | "fallback";
  report: string;
  warning?: string;
}

type PanelState = "idle" | "loading" | "done" | "error";

export function EngineeringReportPanel() {
  const [state, setState] = useState<PanelState>("idle");
  const [result, setResult] = useState<ReportResponse | null>(null);

  const generate = async () => {
    setState("loading");
    try {
      const res = await fetch("/api/report", { method: "POST" });
      if (!res.ok) throw new Error("request failed");
      const json = (await res.json()) as ReportResponse;
      setResult(json);
      setState("done");
    } catch {
      setState("error");
    }
  };

  return (
    <div>
      <button
        onClick={generate}
        disabled={state === "loading"}
        className="flex items-center gap-2 rounded-xl border border-cyan-500/30 bg-cyan-500/10 px-4 py-2 text-sm font-semibold text-cyan-300 transition hover:bg-cyan-500/20 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {state === "loading" ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <FileText className="h-4 w-4" />
        )}
        {state === "loading" ? "Generating…" : "Generate Engineering Report"}
      </button>

      {state === "error" && (
        <p className="mt-2 text-xs text-red-300">Could not generate the report. Please try again.</p>
      )}

      <AnimatePresence>
        {state === "done" && result && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.3, ease: "easeOut" }}
            className="mt-4 overflow-hidden"
          >
            <div className="glass-panel rounded-2xl p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-cyan-300" />
                  <p className="text-sm font-semibold text-slate-100">Engineering Maintenance Report</p>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
                      result.source === "groq"
                        ? "bg-emerald-500/10 text-emerald-300"
                        : "bg-amber-500/10 text-amber-300"
                    }`}
                  >
                    {result.source === "groq" ? "AI Generated" : "Local Fallback"}
                  </span>
                </div>
                <button
                  onClick={() => setState("idle")}
                  className="rounded-lg p-1 text-slate-500 transition hover:bg-white/5 hover:text-slate-300"
                  aria-label="Close report"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {result.warning && (
                <div className="mt-3 flex items-start gap-2 rounded-xl border border-amber-500/25 bg-amber-500/5 p-3 text-xs text-amber-200">
                  <TriangleAlert className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                  {result.warning}
                </div>
              )}

              <pre className="mt-4 whitespace-pre-wrap font-sans text-sm leading-relaxed text-slate-300">
                {result.report}
              </pre>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
