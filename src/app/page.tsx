"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { Activity, ArrowRight, Bot, Cpu, History, LayoutDashboard, ShieldCheck } from "lucide-react";

const features = [
  {
    icon: LayoutDashboard,
    title: "Live Dashboard",
    description: "Real-time health score, temperature, vibration, current and RPM with trend charts.",
    accent: "text-cyan-400",
  },
  {
    icon: Cpu,
    title: "Digital Twin",
    description: "Interactive 2D machine model that visually reflects component-level degradation.",
    accent: "text-emerald-400",
  },
  {
    icon: Bot,
    title: "AI Assistant",
    description: "Explainable, evidence-based fault reasoning — not a chatbot, a decision-support engine.",
    accent: "text-amber-400",
  },
  {
    icon: History,
    title: "History & Recovery",
    description: "Maintenance timeline, sensor history, and health recovery after intervention.",
    accent: "text-cyan-300",
  },
];

export default function Home() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-6 py-24 relative overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-40"
        style={{
          backgroundImage:
            "linear-gradient(rgba(34,211,238,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(34,211,238,0.06) 1px, transparent 1px)",
          backgroundSize: "44px 44px",
        }}
      />

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
        className="relative text-center max-w-3xl"
      >
        <div className="inline-flex items-center gap-2 rounded-full border border-cyan-500/30 bg-cyan-500/10 px-4 py-1.5 text-xs font-medium tracking-wide text-cyan-300 uppercase">
          <ShieldCheck className="h-3.5 w-3.5" />
          Schneider Smart HMI Innovation Marathon
        </div>

        <div className="mt-8 flex justify-center gap-4">
          <Activity className="h-9 w-9 text-cyan-400 animate-pulse-glow" />
        </div>

        <h1 className="mt-4 text-5xl sm:text-6xl font-bold tracking-tight bg-gradient-to-b from-white to-slate-400 bg-clip-text text-transparent">
          SenseGrid AI
        </h1>

        <p className="mt-5 text-slate-400 text-lg max-w-xl mx-auto leading-relaxed">
          An adaptive Human–Machine Interface that watches the machine and the operator —
          catching failure trends before thresholds are crossed, and simplifying itself when
          alert overload sets in.
        </p>

        <Link
          href="/dashboard"
          className="mt-10 inline-flex items-center gap-2 rounded-2xl bg-cyan-500 px-7 py-3.5 text-sm font-semibold text-slate-950 shadow-lg shadow-cyan-500/25 transition hover:bg-cyan-400 hover:shadow-cyan-400/40"
        >
          Enter HMI
          <ArrowRight className="h-4 w-4" />
        </Link>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.2, ease: "easeOut" }}
        className="relative mt-20 grid w-full max-w-5xl grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4"
      >
        {features.map((f) => (
          <div key={f.title} className="glass-panel rounded-2xl p-5 text-left">
            <f.icon className={`h-6 w-6 ${f.accent}`} />
            <h3 className="mt-3 font-semibold text-slate-100">{f.title}</h3>
            <p className="mt-1.5 text-sm text-slate-400 leading-relaxed">{f.description}</p>
          </div>
        ))}
      </motion.div>
    </main>
  );
}
