"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Gauge, TrendingUp, Wrench, X } from "lucide-react";
import type { TwinComponentDisplay } from "@/types";
import { StatusBadge } from "@/components/cards/StatusBadge";
import { visualStatusLabel } from "@/lib/twinVisuals";

interface InspectionPanelProps {
  component: TwinComponentDisplay | null;
  onClose: () => void;
}

export function InspectionPanel({ component, onClose }: InspectionPanelProps) {
  return (
    <AnimatePresence mode="wait">
      {component && (
        <motion.div
          key={component.id}
          initial={{ opacity: 0, x: 24 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 24 }}
          transition={{ duration: 0.25, ease: "easeOut" }}
          className="glass-panel rounded-2xl p-5"
        >
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-slate-500">Inspection</p>
              <h3 className="mt-1 text-lg font-semibold text-slate-100">{component.name}</h3>
            </div>
            <button
              onClick={onClose}
              className="rounded-lg p-1.5 text-slate-500 transition hover:bg-white/5 hover:text-slate-300"
              aria-label="Close inspection panel"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-3">
            <StatusBadge status={component.status} />
            <span className="text-xs text-slate-500">
              Visual Status: <span className="font-semibold text-slate-300">{visualStatusLabel(component.status)}</span>
            </span>
            {component.simulatedTelemetry && (
              <span className="rounded-full border border-cyan-500/30 bg-cyan-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-cyan-300">
                Simulated Device Telemetry
              </span>
            )}
          </div>

          <div className="mt-5 grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-white/5 bg-white/[0.02] p-3">
              <p className="text-[10px] font-medium uppercase tracking-wider text-slate-500">Health</p>
              <p className="mt-1 font-mono text-2xl font-semibold text-slate-100">{component.health}%</p>
            </div>
            <div className="rounded-xl border border-white/5 bg-white/[0.02] p-3">
              <p className="text-[10px] font-medium uppercase tracking-wider text-slate-500">
                Failure Probability
              </p>
              <p className="mt-1 font-mono text-2xl font-semibold text-slate-100">
                {component.failureProbability}%
              </p>
            </div>
          </div>

          <div className="mt-3 flex items-center gap-2 rounded-xl border border-white/5 bg-white/[0.02] p-3">
            <Gauge className="h-4 w-4 text-cyan-400 shrink-0" />
            <div>
              <p className="text-[10px] font-medium uppercase tracking-wider text-slate-500">
                Remaining Useful Life
              </p>
              <p className="font-mono text-sm font-semibold text-slate-200">
                {component.rulLabel ?? `${component.remainingHours.toFixed(1)} hrs`}
              </p>
            </div>
          </div>

          {component.trend && (
            <div className="mt-3 flex items-center justify-between gap-2 rounded-xl border border-white/5 bg-white/[0.02] p-3">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-cyan-400 shrink-0" />
                <div>
                  <p className="text-[10px] font-medium uppercase tracking-wider text-slate-500">Trend</p>
                  <p className="text-sm font-semibold text-slate-200">{component.trend.description}</p>
                </div>
              </div>
              {component.trend.confidence > 0 && (
                <div className="text-right">
                  <p className="text-[10px] font-medium uppercase tracking-wider text-slate-500">Confidence</p>
                  <p className="font-mono text-sm font-semibold text-slate-200">{component.trend.confidence}%</p>
                </div>
              )}
            </div>
          )}

          <div className="mt-4">
            <p className="text-[10px] font-medium uppercase tracking-wider text-slate-500">
              Live Sensor Values
            </p>
            <div className="mt-2 space-y-1.5">
              {component.metrics.map((m) => (
                <div key={m.label} className="flex items-center justify-between text-sm">
                  <span className="text-slate-400">{m.label}</span>
                  <span className="font-mono text-slate-200">
                    {m.value.toFixed(m.unit === "rpm" ? 0 : m.unit === "%" ? 0 : 2)} {m.unit}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-4 flex items-start gap-2 rounded-xl border border-cyan-500/20 bg-cyan-500/5 p-3">
            <Wrench className="h-4 w-4 text-cyan-300 shrink-0 mt-0.5" />
            <p className="text-xs leading-relaxed text-cyan-100/90">{component.recommendation}</p>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
