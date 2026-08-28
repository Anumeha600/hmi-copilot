"use client";

import { motion } from "framer-motion";
import { Check, Clock, Gauge, Microscope, Target, Wrench } from "lucide-react";
import type { Alert, ComponentRUL } from "@/types";

const SEVERITY_STYLE: Record<Alert["severity"], { border: string; badge: string; glow: string }> = {
  info: { border: "border-cyan-500/25", badge: "bg-cyan-500/10 text-cyan-300", glow: "" },
  warning: { border: "border-amber-500/30", badge: "bg-amber-500/10 text-amber-300", glow: "glow-amber" },
  critical: { border: "border-red-500/35", badge: "bg-red-500/10 text-red-300", glow: "glow-red" },
};

function formatHours(hours: number | null): string {
  if (hours === null) return "Not applicable";
  if (hours <= 0) return "Imminent";
  if (hours < 1) return `~${Math.round(hours * 60)} min`;
  return `~${hours.toFixed(1)} hrs`;
}

export function AIAlertCard({
  alert,
  onAcknowledge,
  rul,
}: {
  alert: Alert;
  onAcknowledge: (ruleId: string) => void;
  /** Regression-derived RUL for this alert's component (lib/rul.ts) — powers the engineering explanation block below. Purely presentational: no LLM involved. */
  rul?: ComponentRUL;
}) {
  const style = SEVERITY_STYLE[alert.severity];

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className={`glass-panel rounded-2xl border p-5 ${style.border} ${style.glow}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <span className={`inline-block rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${style.badge}`}>
            {alert.severity}
          </span>
          <h3 className="mt-2 text-base font-semibold text-slate-100">{alert.title}</h3>
        </div>
        <div className="text-right shrink-0">
          <p className="text-[10px] font-medium uppercase tracking-wider text-slate-500">Confidence</p>
          <p className="font-mono text-xl font-bold text-slate-100">{alert.confidence}%</p>
        </div>
      </div>

      <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-white/5">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${alert.confidence}%` }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          className={`h-full ${
            alert.severity === "critical" ? "bg-red-400" : alert.severity === "warning" ? "bg-amber-400" : "bg-cyan-400"
          }`}
        />
      </div>

      {rul && rul.dataSufficient && (
        <div className="mt-4 rounded-xl border border-white/5 bg-white/[0.02] p-3">
          <div className="mb-2 flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider text-slate-500">
            <Microscope className="h-3 w-3" />
            Engineering Explanation
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div>
              <p className="text-slate-500">Current</p>
              <p className="font-mono text-slate-200">
                {rul.current.toFixed(2)} {rul.unit}
              </p>
            </div>
            <div>
              <p className="text-slate-500">Trend</p>
              <p className="font-mono text-slate-200">
                {rul.slopePerSimulatedHour >= 0 ? "+" : ""}
                {rul.slopePerSimulatedHour.toFixed(2)} {rul.unit} per hour
              </p>
            </div>
            <div>
              <p className="text-slate-500">Critical threshold</p>
              <p className="font-mono text-slate-200">
                {rul.criticalThreshold} {rul.unit}
              </p>
            </div>
            <div>
              <p className="text-slate-500">Projected threshold crossing</p>
              <p className="font-mono text-slate-200">{rul.rulLabel}</p>
            </div>
          </div>
        </div>
      )}

      <p className="mt-4 text-sm leading-relaxed text-slate-300">
        <span className="font-medium text-slate-200">Root cause: </span>
        {alert.rootCause}
      </p>

      <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
        <div className="flex items-center gap-2 rounded-xl border border-white/5 bg-white/[0.02] px-3 py-2">
          <Clock className="h-3.5 w-3.5 text-slate-500 shrink-0" />
          <div>
            <p className="text-slate-500">Trend duration</p>
            <p className="font-mono text-slate-200">{alert.trendDurationHours.toFixed(1)} hrs</p>
          </div>
        </div>
        <div className="flex items-center gap-2 rounded-xl border border-white/5 bg-white/[0.02] px-3 py-2">
          <Gauge className="h-3.5 w-3.5 text-slate-500 shrink-0" />
          <div>
            <p className="text-slate-500">Time to failure</p>
            <p className="font-mono text-slate-200">{formatHours(alert.timeToFailureHours)}</p>
          </div>
        </div>
      </div>

      <div className="mt-4 flex items-start gap-2 rounded-xl border border-cyan-500/20 bg-cyan-500/5 p-3">
        <Wrench className="mt-0.5 h-4 w-4 shrink-0 text-cyan-300" />
        <p className="text-xs leading-relaxed text-cyan-100/90">{alert.recommendedAction}</p>
      </div>

      <div className="mt-4 flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
          <Target className="h-3 w-3" />
          Component: <span className="capitalize text-slate-400">{alert.componentId}</span>
        </div>
        {alert.acknowledged ? (
          <span className="text-xs text-slate-500">Acknowledged</span>
        ) : (
          <button
            onClick={() => onAcknowledge(alert.ruleId)}
            className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-slate-300 transition hover:bg-white/10"
          >
            <Check className="h-3.5 w-3.5" />
            Acknowledge
          </button>
        )}
      </div>
    </motion.div>
  );
}
