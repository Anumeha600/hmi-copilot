"use client";

import { AnimatePresence } from "framer-motion";
import { Bot, ShieldCheck } from "lucide-react";
import { useTelemetry } from "@/hooks/useTelemetry";
import { AIAlertCard } from "@/components/ai/AIAlertCard";
import { EngineeringReportPanel } from "@/components/ai/EngineeringReportPanel";
import { ExportReportButton } from "@/components/ai/ExportReportButton";

const SEVERITY_RANK = { critical: 0, warning: 1, info: 2 };

export default function AssistantPage() {
  const { alerts, acknowledgeAlert, componentRUL } = useTelemetry();
  const sorted = [...alerts].sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-500/10 ring-1 ring-cyan-500/25">
            <Bot className="h-5 w-5 text-cyan-300" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-slate-100">AI Assistant</h1>
            <p className="text-sm text-slate-500 max-w-xl">
              Explainable decision support — every card below is generated from live trend
              regression over sensor history, not a scripted chat response.
            </p>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-start gap-3">
        <EngineeringReportPanel />
        <ExportReportButton />
      </div>

      <AnimatePresence mode="popLayout">
        {sorted.length === 0 ? (
          <div className="glass-panel flex items-center gap-3 rounded-2xl p-6 text-emerald-300">
            <ShieldCheck className="h-5 w-5" />
            No anomalies detected. All components are trending within nominal bounds.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {sorted.map((alert) => (
              <AIAlertCard
                key={alert.id}
                alert={alert}
                onAcknowledge={acknowledgeAlert}
                rul={componentRUL[alert.componentId]}
              />
            ))}
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
