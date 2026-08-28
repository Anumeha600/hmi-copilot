"use client";

import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, Check, ShieldAlert, ShieldCheck } from "lucide-react";
import type { Alert } from "@/types";

const SEVERITY_STYLE: Record<Alert["severity"], string> = {
  info: "border-cyan-500/30 bg-cyan-500/5 text-cyan-300",
  warning: "border-amber-500/30 bg-amber-500/5 text-amber-300",
  critical: "border-red-500/30 bg-red-500/5 text-red-300",
};

export function AlertsPanel({
  alerts,
  onAcknowledge,
}: {
  alerts: Alert[];
  onAcknowledge: (ruleId: string) => void;
}) {
  return (
    <div className="glass-panel rounded-2xl p-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-slate-400">
          <ShieldAlert className="h-3.5 w-3.5" />
          Active Alerts
        </div>
        <span className="rounded-full bg-white/5 px-2 py-0.5 text-xs font-mono text-slate-400">
          {alerts.length}
        </span>
      </div>

      <div className="mt-3 space-y-2">
        <AnimatePresence initial={false}>
          {alerts.length === 0 && (
            <motion.div
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex items-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-3 py-3 text-sm text-emerald-300"
            >
              <ShieldCheck className="h-4 w-4" />
              No active alerts — all systems nominal.
            </motion.div>
          )}

          {alerts.map((alert) => (
            <motion.div
              key={alert.id}
              layout
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 8 }}
              className={`flex items-start justify-between gap-3 rounded-xl border px-3 py-2.5 text-sm ${SEVERITY_STYLE[alert.severity]}`}
            >
              <div className="flex items-start gap-2 min-w-0">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <div className="min-w-0">
                  <p className="font-medium truncate">{alert.title}</p>
                  <p className="text-xs text-slate-400 truncate">{alert.rootCause}</p>
                </div>
              </div>
              {alert.acknowledged ? (
                <span className="shrink-0 text-xs text-slate-500">Ack&apos;d</span>
              ) : (
                <button
                  onClick={() => onAcknowledge(alert.ruleId)}
                  className="shrink-0 flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-xs text-slate-300 transition hover:bg-white/10"
                >
                  <Check className="h-3 w-3" />
                  Ack
                </button>
              )}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}
