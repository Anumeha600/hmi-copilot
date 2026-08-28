"use client";

import { motion } from "framer-motion";
import { OctagonAlert, WifiOff } from "lucide-react";
import type { ReactNode } from "react";
import { useTelemetry } from "@/hooks/useTelemetry";
import { StatusBadge } from "@/components/cards/StatusBadge";
import { DemoControlPanel } from "@/components/controls/DemoControlPanel";
import { MobileNav } from "./MobileNav";
import { OperatorLoadMeter } from "./OperatorLoadMeter";
import { Sidebar } from "./Sidebar";

export function AppShell({ children }: { children: ReactNode }) {
  const { status, operator, alerts, acknowledgeAlert, connectionStatus } = useTelemetry();
  const highLoad = operator.loadLevel === "high";
  const unacknowledged = alerts.filter((a) => !a.acknowledged);

  return (
    <div
      className={`flex min-h-screen w-full ${highLoad ? "contrast-[1.08] saturate-[1.15]" : ""}`}
    >
      <Sidebar />

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex flex-wrap items-center justify-between gap-3 border-b border-white/5 bg-[#07111f]/85 px-5 py-3 backdrop-blur">
          <div className="flex items-center gap-3">
            <StatusBadge status={status} large />
            {connectionStatus === "disconnected" && (
              <motion.span
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                className="inline-flex items-center gap-2 rounded-full border border-red-500/40 bg-red-500/10 px-3 py-1.5 text-xs font-semibold text-red-300"
              >
                <WifiOff className="h-3.5 w-3.5" />
                Disconnected — retrying…
              </motion.span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <DemoControlPanel />
            <OperatorLoadMeter operator={operator} />

            <motion.button
              type="button"
              onClick={() => unacknowledged.forEach((a) => acknowledgeAlert(a.ruleId))}
              animate={
                highLoad
                  ? { scale: 1.08, paddingLeft: 20, paddingRight: 20 }
                  : { scale: 1, paddingLeft: 14, paddingRight: 14 }
              }
              transition={{ duration: 0.3 }}
              className={`flex items-center gap-2 rounded-xl border py-2 text-xs font-semibold transition-colors ${
                highLoad
                  ? "border-red-500/50 bg-red-500/15 text-red-200 glow-red"
                  : "border-white/10 bg-white/5 text-slate-300 hover:bg-white/10"
              }`}
            >
              <OctagonAlert className={highLoad ? "h-5 w-5" : "h-3.5 w-3.5"} />
              {highLoad ? "ACKNOWLEDGE ALL" : "Ack all"}
              {unacknowledged.length > 0 && (
                <span className="rounded-full bg-white/10 px-1.5 font-mono">
                  {unacknowledged.length}
                </span>
              )}
            </motion.button>
          </div>
        </header>

        <main className="flex-1 px-5 py-6 pb-24 lg:pb-6">{children}</main>
      </div>

      <MobileNav />
    </div>
  );
}
