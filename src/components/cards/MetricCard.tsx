"use client";

import { motion } from "framer-motion";
import type { LucideIcon } from "lucide-react";
import { Area, AreaChart, ResponsiveContainer } from "recharts";

export type MetricTone = "cyan" | "emerald" | "amber" | "red";

const TONE_STYLES: Record<MetricTone, { text: string; ring: string; stroke: string; fill: string }> = {
  cyan: { text: "text-cyan-300", ring: "ring-cyan-500/20", stroke: "#22d3ee", fill: "#22d3ee" },
  emerald: { text: "text-emerald-300", ring: "ring-emerald-500/20", stroke: "#10b981", fill: "#10b981" },
  amber: { text: "text-amber-300", ring: "ring-amber-500/20", stroke: "#f59e0b", fill: "#f59e0b" },
  red: { text: "text-red-300", ring: "ring-red-500/20", stroke: "#ef4444", fill: "#ef4444" },
};

interface MetricCardProps {
  label: string;
  value: number;
  unit: string;
  icon: LucideIcon;
  tone: MetricTone;
  sparkline: number[];
  precision?: number;
  compact?: boolean;
}

export function MetricCard({
  label,
  value,
  unit,
  icon: Icon,
  tone,
  sparkline,
  precision = 1,
  compact = false,
}: MetricCardProps) {
  const style = TONE_STYLES[tone];
  const data = sparkline.map((v, i) => ({ i, v }));

  return (
    <motion.div
      layout
      className={`glass-panel relative overflow-hidden rounded-2xl ${compact ? "p-4" : "p-5"}`}
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-slate-400">{label}</p>
          <motion.p
            key={value.toFixed(precision)}
            initial={{ opacity: 0.5, y: 2 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25 }}
            className={`mt-1.5 font-mono text-3xl font-semibold ${style.text}`}
          >
            {value.toFixed(precision)}
            <span className="ml-1 text-sm font-normal text-slate-500">{unit}</span>
          </motion.p>
        </div>
        <div className={`flex h-9 w-9 items-center justify-center rounded-xl bg-white/5 ring-1 ${style.ring}`}>
          <Icon className={`h-4.5 w-4.5 ${style.text}`} />
        </div>
      </div>

      <div className="mt-3 h-10 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id={`spark-${label}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={style.fill} stopOpacity={0.35} />
                <stop offset="100%" stopColor={style.fill} stopOpacity={0} />
              </linearGradient>
            </defs>
            <Area
              type="monotone"
              dataKey="v"
              stroke={style.stroke}
              strokeWidth={1.75}
              fill={`url(#spark-${label})`}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </motion.div>
  );
}
