"use client";

import { CartesianGrid, Line, LineChart, ReferenceDot, ReferenceLine, ResponsiveContainer, XAxis, YAxis } from "recharts";
import type { ComponentRUL, SensorReading } from "@/types";

interface RULTrendChartProps {
  history: SensorReading[];
  rul: ComponentRUL;
  field: keyof Pick<SensorReading, "temperature" | "vibration" | "current" | "rpm">;
  height?: number;
}

/** Compact current-value vs. warning/critical-threshold visualization backing the dashboard's RUL card. */
export function RULTrendChart({ history, rul, field, height = 150 }: RULTrendChartProps) {
  const recent = history.slice(-40);
  const data = recent.map((r, i) => ({ i, value: r[field] }));
  const lastIndex = data.length - 1;
  const markerColor = !rul.degrading ? "#10b981" : rul.rulLabel === "> 24 hrs" ? "#f59e0b" : "#ef4444";
  const axisTick = { fill: "#64748b", fontSize: 11 };

  return (
    <div>
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
          <CartesianGrid stroke="rgba(148,197,255,0.08)" vertical={false} />
          <XAxis dataKey="i" hide />
          <YAxis tick={axisTick} axisLine={false} tickLine={false} width={36} domain={["auto", "auto"]} />
          <ReferenceLine
            y={rul.warningThreshold}
            stroke="#f59e0b"
            strokeDasharray="4 4"
            label={{ value: "Warning", position: "insideTopRight", fill: "#f59e0b", fontSize: 10 }}
          />
          <ReferenceLine
            y={rul.criticalThreshold}
            stroke="#ef4444"
            strokeDasharray="4 4"
            label={{ value: "Critical", position: "insideTopRight", fill: "#ef4444", fontSize: 10 }}
          />
          <Line type="monotone" dataKey="value" stroke="#22d3ee" strokeWidth={2} dot={false} isAnimationActive={false} />
          {lastIndex >= 0 && (
            <ReferenceDot x={lastIndex} y={data[lastIndex].value} r={5} fill={markerColor} stroke="#07111f" strokeWidth={2} />
          )}
        </LineChart>
      </ResponsiveContainer>
      <div className="mt-1.5 flex items-center justify-between text-[11px] text-slate-500">
        <span>
          Current: <span className="text-slate-300">{rul.current.toFixed(2)} {rul.unit}</span>
        </span>
        <span>
          Projected RUL: <span className="font-semibold text-slate-300">{rul.rulLabel}</span>
        </span>
      </div>
    </div>
  );
}
