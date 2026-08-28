"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { CheckCircle2, History as HistoryIcon, TrendingUp, Wrench } from "lucide-react";
import { useTelemetry } from "@/hooks/useTelemetry";
import { LiveLineChart } from "@/components/charts/LiveLineChart";
import type { MaintenanceLogRecord } from "@/types";

type FilterRange = "today" | "last-demo" | "all";

const FILTERS: { key: FilterRange; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "last-demo", label: "Last Demo" },
  { key: "all", label: "All" },
];

/** A gap this large between consecutive entries marks the boundary of a prior demo run. */
const DEMO_RUN_GAP_MS = 45_000;

function isToday(timestamp: number): boolean {
  const d = new Date(timestamp);
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

/** entries must already be sorted descending by timestamp. */
function lastDemoRun(entries: MaintenanceLogRecord[]): MaintenanceLogRecord[] {
  if (entries.length === 0) return [];
  const result = [entries[0]];
  for (let i = 1; i < entries.length; i++) {
    const gap = result[result.length - 1].timestamp - entries[i].timestamp;
    if (gap > DEMO_RUN_GAP_MS) break;
    result.push(entries[i]);
  }
  return result;
}

export default function HistoryPage() {
  const { healthHistory, history, demo } = useTelemetry();
  const [range, setRange] = useState<FilterRange>("today");
  const [entries, setEntries] = useState<MaintenanceLogRecord[]>([]);
  const prevPhaseRef = useRef(demo.phase);
  const prevActiveRef = useRef(demo.active);

  const fetchHistory = useCallback(async () => {
    try {
      const res = await fetch("/api/history");
      const json = (await res.json()) as { entries: MaintenanceLogRecord[] };
      setEntries(json.entries ?? []);
    } catch {
      // keep last known entries on a transient fetch failure
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial fetch on mount
    fetchHistory();
  }, [fetchHistory]);

  // Refetch exactly when the server just committed a new maintenance log, or
  // when the demo was reset (which clears history server-side).
  useEffect(() => {
    const justLoggedMaintenance = prevPhaseRef.current === "maintenance" && demo.phase === "recovery";
    const justReset = prevActiveRef.current && !demo.active;
    if (justLoggedMaintenance || justReset) fetchHistory();
    prevPhaseRef.current = demo.phase;
    prevActiveRef.current = demo.active;
  }, [demo.phase, demo.active, fetchHistory]);

  const sorted = useMemo(() => [...entries].sort((a, b) => b.timestamp - a.timestamp), [entries]);

  const filteredMaintenance = useMemo(() => {
    if (range === "today") return sorted.filter((e) => isToday(e.timestamp));
    if (range === "last-demo") return lastDemoRun(sorted);
    return sorted;
  }, [sorted, range]);

  const healthData = healthHistory.map((h, i) => ({ i, health: h.health }));
  const sensorData = history.map((r, i) => ({ i, temperature: r.temperature, vibration: r.vibration }));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-100">History</h1>
          <p className="text-sm text-slate-500">Maintenance timeline, sensor trends, and recovery.</p>
        </div>
        <div className="flex gap-1.5 rounded-xl border border-white/5 bg-white/[0.02] p-1">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setRange(f.key)}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                range === f.key ? "bg-cyan-500/15 text-cyan-300" : "text-slate-500 hover:text-slate-300"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="glass-panel rounded-2xl p-5 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 ring-1 ring-emerald-500/25">
            <CheckCircle2 className="h-5 w-5 text-emerald-300" />
          </div>
          <div>
            <p className="text-xs text-slate-500">Completed Repairs</p>
            <p className="font-mono text-2xl font-semibold text-slate-100">{filteredMaintenance.length}</p>
          </div>
        </div>
        <div className="glass-panel rounded-2xl p-5 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-500/10 ring-1 ring-cyan-500/25">
            <TrendingUp className="h-5 w-5 text-cyan-300" />
          </div>
          <div>
            <p className="text-xs text-slate-500">Current Health</p>
            <p className="font-mono text-2xl font-semibold text-slate-100">
              {healthHistory[healthHistory.length - 1]?.health ?? "—"}
            </p>
          </div>
        </div>
        <div className="glass-panel rounded-2xl p-5 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/10 ring-1 ring-amber-500/25">
            <HistoryIcon className="h-5 w-5 text-amber-300" />
          </div>
          <div>
            <p className="text-xs text-slate-500">Samples Logged</p>
            <p className="font-mono text-2xl font-semibold text-slate-100">{history.length}</p>
          </div>
        </div>
      </div>

      <div className="glass-panel rounded-2xl p-5">
        <p className="text-xs font-medium uppercase tracking-wider text-slate-400">Health Recovery</p>
        <div className="mt-2">
          <LiveLineChart
            data={healthData}
            series={[{ key: "health", label: "Health", color: "#10b981" }]}
            domain={[0, 100]}
          />
        </div>
      </div>

      <div className="glass-panel rounded-2xl p-5">
        <p className="text-xs font-medium uppercase tracking-wider text-slate-400">Sensor History</p>
        <div className="mt-2">
          <LiveLineChart
            data={sensorData}
            series={[
              { key: "temperature", label: "Temperature", color: "#f59e0b", unit: "°C", axis: "left" },
              { key: "vibration", label: "Vibration", color: "#22d3ee", unit: "mm/s", axis: "right" },
            ]}
          />
        </div>
      </div>

      <div className="glass-panel rounded-2xl p-5">
        <p className="text-xs font-medium uppercase tracking-wider text-slate-400">Maintenance Timeline</p>

        {filteredMaintenance.length === 0 ? (
          <p className="mt-4 text-sm text-slate-500">
            No maintenance actions logged in this range yet — the simulator auto-logs a repair
            once a fault cycle resolves.
          </p>
        ) : (
          <ol className="mt-4 space-y-4 border-l border-white/10 pl-5">
            {filteredMaintenance.map((entry, idx) => (
              <motion.li
                key={entry.id}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: idx * 0.03 }}
                className="relative"
              >
                <span className="absolute -left-[26px] flex h-5 w-5 items-center justify-center rounded-full bg-cyan-500/15 ring-4 ring-[#07111f]">
                  <Wrench className="h-3 w-3 text-cyan-300" />
                </span>
                <p className="text-xs text-slate-500">
                  {new Date(entry.timestamp).toLocaleString()}
                </p>
                <p className="mt-0.5 text-sm text-slate-200">{entry.action}</p>
                <p className="mt-0.5 text-xs text-slate-500">
                  <span className="capitalize text-slate-400">{entry.component}</span>
                  {" · restored to "}
                  <span className="text-emerald-300">{entry.health}%</span>
                  {" · "}
                  {entry.temperature.toFixed(1)}°C, {entry.vibration.toFixed(2)} mm/s
                </p>
                {entry.predictionConfidence !== null && (
                  <p className="mt-0.5 text-xs text-slate-600">
                    RUL at time of log:{" "}
                    <span className="text-cyan-300">{entry.rul !== null ? `${entry.rul.toFixed(1)} hrs` : "> 24 hrs"}</span>
                    {" · Confidence "}
                    {entry.predictionConfidence}%
                    {entry.trend ? ` · ${entry.trend}` : ""}
                  </p>
                )}
              </motion.li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}
