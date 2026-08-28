"use client";

import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export interface ChartSeries {
  key: string;
  label: string;
  color: string;
  unit?: string;
  /** Series on very different scales (e.g. current vs. RPM) should use "right" so they don't flatten. */
  axis?: "left" | "right";
}

interface LiveLineChartProps {
  data: Record<string, number>[];
  series: ChartSeries[];
  height?: number;
  domain?: [number | "auto", number | "auto"];
}

function ChartTooltip({
  active,
  payload,
  series,
}: {
  active?: boolean;
  payload?: { dataKey: string; value: number }[];
  series: ChartSeries[];
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="glass-panel rounded-lg px-3 py-2 text-xs">
      {payload.map((p) => {
        const s = series.find((x) => x.key === p.dataKey);
        return (
          <div key={p.dataKey} className="flex items-center gap-1.5" style={{ color: s?.color }}>
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: s?.color }} />
            {s?.label}: {p.value.toFixed(2)} {s?.unit ?? ""}
          </div>
        );
      })}
    </div>
  );
}

export function LiveLineChart({ data, series, height = 200, domain = ["auto", "auto"] }: LiveLineChartProps) {
  const hasRightAxis = series.some((s) => s.axis === "right");
  const axisTick = { fill: "#64748b", fontSize: 11 };

  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 8, right: hasRightAxis ? 8 : 12, bottom: 0, left: 0 }}>
        <CartesianGrid stroke="rgba(148,197,255,0.08)" vertical={false} />
        <XAxis dataKey="i" hide />
        <YAxis
          yAxisId="left"
          domain={domain}
          tick={axisTick}
          axisLine={false}
          tickLine={false}
          width={42}
        />
        {hasRightAxis && (
          <YAxis
            yAxisId="right"
            orientation="right"
            domain={["auto", "auto"]}
            tick={axisTick}
            axisLine={false}
            tickLine={false}
            width={42}
          />
        )}
        <Tooltip content={<ChartTooltip series={series} />} />
        {series.map((s) => (
          <Line
            key={s.key}
            yAxisId={s.axis === "right" ? "right" : "left"}
            type="monotone"
            dataKey={s.key}
            name={s.label}
            stroke={s.color}
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}
