"use client";

import { animate, motion, useMotionValue, useTransform } from "framer-motion";
import { useEffect, useState } from "react";
import type { MachineStatus } from "@/types";

const STATUS_COLOR: Record<MachineStatus, string> = {
  normal: "#10b981",
  warning: "#f59e0b",
  critical: "#ef4444",
  safe_mode: "#94a3b8",
};

export function HealthGauge({ health, status }: { health: number; status: MachineStatus }) {
  const radius = 64;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - health / 100);
  const color = STATUS_COLOR[status];

  const motionHealth = useMotionValue(health);
  const roundedHealth = useTransform(motionHealth, (v) => Math.round(v));
  const [display, setDisplay] = useState(Math.round(health));

  useEffect(() => {
    const controls = animate(motionHealth, health, { duration: 0.6, ease: "easeOut" });
    const unsubscribe = roundedHealth.on("change", (v) => setDisplay(v));
    return () => {
      controls.stop();
      unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [health]);

  return (
    <div className="relative flex h-40 w-40 items-center justify-center">
      <svg viewBox="0 0 160 160" className="h-full w-full -rotate-90">
        <circle cx="80" cy="80" r={radius} fill="none" stroke="rgba(148,197,255,0.1)" strokeWidth="10" />
        <motion.circle
          cx="80"
          cy="80"
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={false}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          style={{ filter: `drop-shadow(0 0 8px ${color}80)` }}
        />
      </svg>
      <div className="absolute flex flex-col items-center">
        <span className="font-mono text-4xl font-bold text-slate-100">{display}</span>
        <span className="text-[10px] font-medium uppercase tracking-widest text-slate-500">
          Health Score
        </span>
      </div>
    </div>
  );
}
