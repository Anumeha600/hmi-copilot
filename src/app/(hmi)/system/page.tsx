"use client";

import { motion } from "framer-motion";
import {
  Boxes,
  CheckCircle2,
  Database,
  GitBranch,
  LayoutTemplate,
  LineChart,
  Network,
  Radio,
  ShieldCheck,
  Wand2,
  Workflow,
} from "lucide-react";
import { useTelemetry } from "@/hooks/useTelemetry";
import { ArchitectureDiagram, ArchitectureDiagramCaption } from "@/components/system/ArchitectureDiagram";

const STACK = [
  {
    icon: LayoutTemplate,
    name: "Next.js",
    tone: "text-cyan-300",
    ring: "ring-cyan-500/25",
    description: "App Router serves every page and API route from one server-owned process.",
  },
  {
    icon: Radio,
    name: "Server-Sent Events",
    tone: "text-emerald-300",
    ring: "ring-emerald-500/25",
    description: "A single persistent stream pushes a fresh telemetry frame to every tab once a second.",
  },
  {
    icon: Database,
    name: "SQLite",
    tone: "text-amber-300",
    ring: "ring-amber-500/25",
    description: "better-sqlite3 persists every completed maintenance action to a local sensegrid.db file.",
  },
  {
    icon: LineChart,
    name: "Recharts",
    tone: "text-cyan-300",
    ring: "ring-cyan-500/25",
    description: "Drives every live trend chart — health recovery, sensor history, dual-axis dashboards.",
  },
  {
    icon: Wand2,
    name: "Framer Motion",
    tone: "text-violet-300",
    ring: "ring-violet-500/25",
    description: "Powers every transition: gauge counting, phase changes, twin-profile crossfades.",
  },
  {
    icon: Boxes,
    name: "SVG Digital Twin",
    tone: "text-emerald-300",
    ring: "ring-emerald-500/25",
    description: "Hand-drawn vector machines for both device profiles — no external image assets.",
  },
];

const DATA_FLOW_STEPS = [
  {
    title: "Generate",
    detail:
      "The server ticks a deterministic DemoController once a second, computing sensor readings, component health, and trend predictions from pure local math.",
  },
  {
    title: "Stream",
    detail:
      "Every tick is broadcast over a shared Server-Sent Events connection to all connected browser tabs simultaneously.",
  },
  {
    title: "Persist",
    detail:
      "When a repair phase completes, the resulting maintenance event is written straight to SQLite — the single source of truth for history.",
  },
  {
    title: "Visualize",
    detail:
      "Every page subscribes through one useTelemetry() hook, so the dashboard, digital twin, AI assistant, and history all render the same live state.",
  },
];

const EXPLAINABLE_PRINCIPLES = [
  {
    title: "Regression performs prediction.",
    detail:
      "Trend direction, Remaining Useful Life, and model-estimated failure probability all come from an ordinary least-squares regression over real sensor history, computed entirely in lib/prediction.ts and lib/rul.ts — never a scripted or hardcoded number.",
  },
  {
    title: "The LLM only formats reports.",
    detail:
      "Groq receives a structured, already-computed diagnosis JSON and is explicitly instructed to rewrite it into prose — it cannot add, adjust, or invent a single number.",
  },
  {
    title: "No black-box diagnosis.",
    detail:
      "Every health percentage, alert, and root cause shown anywhere in the app traces back to a deterministic function you can read yourself — nothing is inferred by a model.",
  },
];

export default function SystemArchitecturePage() {
  const { connectionStatus, alerts } = useTelemetry();

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-500/10 ring-1 ring-cyan-500/25">
          <Network className="h-5 w-5 text-cyan-300" />
        </div>
        <div>
          <h1 className="text-xl font-semibold text-slate-100">System Architecture</h1>
          <p className="text-sm text-slate-500 max-w-2xl">
            How SenseGrid AI actually works, end to end — from the server-owned simulation to the
            SVG twin on screen.
          </p>
        </div>
      </div>

      {/* 1. Live Architecture Diagram */}
      <section className="glass-panel rounded-2xl p-5">
        <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-slate-400">
          <Workflow className="h-3.5 w-3.5" />
          Live Architecture Diagram
        </div>
        <div className="mt-4 overflow-x-auto">
          <div className="min-w-[640px]">
            <ArchitectureDiagram connectionStatus={connectionStatus} liveAlertCount={alerts.length} />
          </div>
        </div>
        <ArchitectureDiagramCaption />
      </section>

      {/* 2. Technology Stack */}
      <section>
        <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-slate-400">
          <Boxes className="h-3.5 w-3.5" />
          Technology Stack
        </div>
        <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {STACK.map((item, i) => (
            <motion.div
              key={item.name}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04 }}
              className="glass-panel rounded-2xl p-5"
            >
              <div className={`flex h-10 w-10 items-center justify-center rounded-xl bg-white/5 ring-1 ${item.ring}`}>
                <item.icon className={`h-5 w-5 ${item.tone}`} />
              </div>
              <h3 className="mt-3 font-semibold text-slate-100">{item.name}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-slate-400">{item.description}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* 3. Data Flow */}
      <section className="glass-panel rounded-2xl p-5">
        <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-slate-400">
          <GitBranch className="h-3.5 w-3.5" />
          Data Flow
        </div>
        <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-4">
          {DATA_FLOW_STEPS.map((step, i) => (
            <motion.div
              key={step.title}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.06 }}
              className="relative rounded-xl border border-white/5 bg-white/[0.02] p-4"
            >
              <div className="flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-cyan-500/15 text-xs font-bold text-cyan-300">
                  {i + 1}
                </span>
                <p className="text-sm font-semibold text-slate-100">{step.title}</p>
              </div>
              <p className="mt-2 text-xs leading-relaxed text-slate-400">{step.detail}</p>
              {i < DATA_FLOW_STEPS.length - 1 && (
                <div className="pointer-events-none absolute top-1/2 -right-2.5 hidden h-px w-5 -translate-y-1/2 bg-gradient-to-r from-cyan-500/40 to-transparent md:block" />
              )}
            </motion.div>
          ))}
        </div>
      </section>

      {/* 4. Explainable AI */}
      <section className="glass-panel rounded-2xl border border-cyan-500/20 p-5">
        <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-slate-400">
          <ShieldCheck className="h-3.5 w-3.5 text-cyan-300" />
          Explainable AI
        </div>
        <div className="mt-4 space-y-4">
          {EXPLAINABLE_PRINCIPLES.map((p, i) => (
            <motion.div
              key={p.title}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.08 }}
              className="flex items-start gap-3 rounded-xl border border-cyan-500/15 bg-cyan-500/5 p-4"
            >
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-cyan-300" />
              <div>
                <p className="text-sm font-semibold text-slate-100">{p.title}</p>
                <p className="mt-1 text-xs leading-relaxed text-cyan-100/80">{p.detail}</p>
              </div>
            </motion.div>
          ))}
        </div>
      </section>
    </div>
  );
}
