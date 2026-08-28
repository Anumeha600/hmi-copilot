"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Octagon, Pause, Play, RotateCcw, TriangleAlert } from "lucide-react";
import { useTelemetry } from "@/hooks/useTelemetry";
import { DEMO_PHASE_MARKERS } from "@/lib/demo";
import type { DemoPhaseName } from "@/types";

const PHASE_ACCENT: Record<DemoPhaseName, string> = {
  healthy: "text-emerald-300",
  early_warning: "text-amber-300",
  critical: "text-red-300",
  maintenance: "text-cyan-300",
  recovery: "text-emerald-300",
};

const PHASE_BAR_COLOR: Record<DemoPhaseName, string> = {
  healthy: "#10b981",
  early_warning: "#f59e0b",
  critical: "#ef4444",
  maintenance: "#22d3ee",
  recovery: "#10b981",
};

/** Compact demo transport control, meant to live in the app's top command bar. */
export function DemoControlPanel() {
  const { demo, startDemo, pauseDemo, resetDemo, emergencyStop } = useTelemetry();
  const barColor = demo.active ? PHASE_BAR_COLOR[demo.phase] : "#22d3ee";
  const [confirmOpen, setConfirmOpen] = useState(false);

  const confirmEmergencyStop = () => {
    emergencyStop();
    setConfirmOpen(false);
  };

  return (
    <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-1.5">
      <div className="flex flex-col leading-tight">
        <span className="text-[10px] font-medium uppercase tracking-wider text-slate-500">Auto Demo</span>
        <AnimatePresence mode="wait">
          <motion.span
            key={demo.active ? demo.phase : "idle"}
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            transition={{ duration: 0.2 }}
            className={`text-xs font-semibold ${demo.active ? PHASE_ACCENT[demo.phase] : "text-slate-500"}`}
          >
            {demo.active ? demo.phaseLabel : "Idle"}
          </motion.span>
        </AnimatePresence>
      </div>

      <div className="relative hidden h-1.5 w-20 overflow-hidden rounded-full bg-white/5 sm:block">
        <motion.div
          className="h-full rounded-full"
          style={{ background: barColor }}
          animate={{ width: `${demo.totalProgress * 100}%` }}
          transition={{ duration: 0.12, ease: "linear" }}
        />
        {DEMO_PHASE_MARKERS.map((pct) => (
          <span key={pct} className="absolute top-0 h-full w-px bg-[#07111f]/60" style={{ left: `${pct}%` }} />
        ))}
      </div>

      <div className="flex items-center gap-1.5">
        {demo.running ? (
          <button
            onClick={pauseDemo}
            aria-label="Pause demo"
            className="flex items-center gap-1 rounded-lg border border-amber-500/30 bg-amber-500/10 px-2.5 py-1.5 text-xs font-semibold text-amber-300 transition hover:bg-amber-500/20"
          >
            <Pause className="h-3.5 w-3.5" />
            <span className="hidden md:inline">Pause</span>
          </button>
        ) : (
          <button
            onClick={startDemo}
            aria-label="Start demo"
            className="flex items-center gap-1 rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-2.5 py-1.5 text-xs font-semibold text-cyan-300 transition hover:bg-cyan-500/20"
          >
            <Play className="h-3.5 w-3.5" />
            <span className="hidden md:inline">{demo.active ? "Resume" : "Start Demo"}</span>
          </button>
        )}
        <button
          onClick={resetDemo}
          aria-label="Reset demo"
          className="flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs font-semibold text-slate-300 transition hover:bg-white/10"
        >
          <RotateCcw className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={() => setConfirmOpen(true)}
          aria-label="Emergency stop"
          className="flex items-center gap-1 rounded-lg border border-red-500/40 bg-red-500/15 px-2.5 py-1.5 text-xs font-semibold text-red-300 transition hover:bg-red-500/25"
        >
          <Octagon className="h-3.5 w-3.5" />
          <span className="hidden md:inline">Emergency Stop</span>
        </button>
      </div>

      <AnimatePresence>
        {confirmOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4"
            onClick={() => setConfirmOpen(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 8 }}
              transition={{ duration: 0.2 }}
              onClick={(e) => e.stopPropagation()}
              className="glass-panel w-full max-w-sm rounded-2xl border border-red-500/30 p-5 glow-red"
            >
              <div className="flex items-center gap-2 text-red-300">
                <TriangleAlert className="h-5 w-5" />
                <p className="text-sm font-semibold">Confirm Emergency Stop</p>
              </div>
              <p className="mt-3 text-sm text-slate-300">
                This immediately halts telemetry, drives RPM and current to zero, sets operator
                load to Low, and puts the machine into Safe Mode. A maintenance log entry will be
                recorded.
              </p>
              <div className="mt-5 flex items-center justify-end gap-2">
                <button
                  onClick={() => setConfirmOpen(false)}
                  className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-slate-300 transition hover:bg-white/10"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmEmergencyStop}
                  className="flex items-center gap-1.5 rounded-lg border border-red-500/50 bg-red-500/20 px-3 py-2 text-xs font-semibold text-red-200 transition hover:bg-red-500/30"
                >
                  <Octagon className="h-3.5 w-3.5" />
                  Confirm Stop
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
