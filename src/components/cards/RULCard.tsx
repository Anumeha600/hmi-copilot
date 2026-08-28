"use client";

import { motion } from "framer-motion";
import { Clock, ShieldOff, TrendingUp, Wrench } from "lucide-react";
import type { ComponentRUL, MachineStatus } from "@/types";

const STATUS_TEXT: Record<MachineStatus, string> = {
  normal: "text-emerald-300",
  warning: "text-amber-300",
  critical: "text-red-300",
  safe_mode: "text-slate-300",
};

const STATUS_GLOW: Record<MachineStatus, string> = {
  normal: "",
  warning: "glow-amber border-amber-500/30",
  critical: "glow-red border-red-500/30",
  safe_mode: "border-slate-500/30",
};

interface RULCardProps {
  rul: ComponentRUL;
  status: MachineStatus;
  machineStatus: MachineStatus;
  maintenanceInProgress: boolean;
}

/** Dashboard's first-class Remaining Useful Life card — every value here comes straight from the live regression-based RUL engine (lib/rul.ts), never a hardcoded demo number. */
export function RULCard({ rul, status, machineStatus, maintenanceInProgress }: RULCardProps) {
  const safeMode = machineStatus === "safe_mode";
  const showConfidence = status !== "normal" && rul.dataSufficient;

  if (safeMode) {
    return (
      <div className="glass-panel rounded-2xl border-slate-500/30 p-5">
        <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-slate-400">
          <ShieldOff className="h-3.5 w-3.5" />
          Remaining Useful Life
        </div>
        <p className="mt-2 font-mono text-2xl font-semibold text-slate-300">SAFE MODE</p>
        <div className="mt-3 flex items-center gap-1.5 text-xs text-slate-500">
          Prediction paused — frozen at {rul.rulLabel}
        </div>
      </div>
    );
  }

  return (
    <div className={`glass-panel rounded-2xl p-5 ${STATUS_GLOW[status]}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-slate-400">
          <Clock className="h-3.5 w-3.5" />
          Remaining Useful Life
        </div>
        {showConfidence && (
          <span className="font-mono text-xs text-slate-500">Confidence {rul.confidence}%</span>
        )}
      </div>

      <motion.p
        key={rul.rulLabel}
        initial={{ opacity: 0.4 }}
        animate={{ opacity: 1 }}
        className={`mt-2 font-mono text-3xl font-semibold ${STATUS_TEXT[status]}`}
      >
        {rul.rulLabel}
      </motion.p>

      <div className="mt-3 flex items-center gap-1.5 text-xs text-slate-500">
        <TrendingUp className={`h-3.5 w-3.5 shrink-0 ${status !== "normal" ? STATUS_TEXT[status] : "text-slate-600"}`} />
        {rul.direction === "indeterminate"
          ? (rul.rulReason ?? "Indeterminate — insufficient trend signal.")
          : rul.direction === "stable"
            ? "No sustained degrading trend"
            : rul.rulLabel === "> 24 hrs"
              ? `${rul.metricLabel} trend increasing — projected crossing beyond 24 hrs`
              : rul.rulHours !== null && rul.rulHours <= 0.15
                ? "Projected critical threshold"
                : rul.trendDescription}
      </div>

      {maintenanceInProgress && (
        <div className="mt-2 flex items-center gap-1.5 text-xs text-cyan-300">
          <Wrench className="h-3.5 w-3.5 shrink-0" />
          Maintenance in progress — prediction transitional
        </div>
      )}
    </div>
  );
}
