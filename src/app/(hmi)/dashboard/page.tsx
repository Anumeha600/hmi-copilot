"use client";

import { motion } from "framer-motion";
import { Activity, Gauge, Thermometer, Wrench, Zap } from "lucide-react";
import { useTelemetry } from "@/hooks/useTelemetry";
import { HealthGauge } from "@/components/cards/HealthGauge";
import { RULCard } from "@/components/cards/RULCard";
import { AlertsPanel } from "@/components/cards/AlertsPanel";
import { MetricCard } from "@/components/cards/MetricCard";
import { LiveLineChart } from "@/components/charts/LiveLineChart";
import { RULTrendChart } from "@/components/charts/RULTrendChart";
import { DEMO_PHASE_DESCRIPTIONS } from "@/lib/demo";

const PHASE_LABEL: Record<string, string> = {
  healthy: "Steady State",
  rising: "Trend Developing",
  fault: "Active Fault",
  recovery: "Recovering",
  stable: "Steady State",
};

export default function DashboardPage() {
  const { reading, health, status, history, alerts, acknowledgeAlert, componentHealths, componentRUL, operator, phase, demo } =
    useTelemetry();

  const highLoad = operator.loadLevel === "high";
  const phaseLabel = demo.active ? demo.phaseLabel : (PHASE_LABEL[phase] ?? phase);
  const phaseDescription = demo.active
    ? DEMO_PHASE_DESCRIPTIONS[demo.phase]
    : "Cycle continuously replays a healthy → trending → fault → maintenance → recovery sequence for demonstration.";
  const recent = history.slice(-60);
  const chartData = recent.map((r, i) => ({
    i,
    temperature: r.temperature,
    vibration: r.vibration,
    current: r.current,
    rpm: r.rpm,
  }));

  const sparkline = (key: keyof typeof reading) => recent.map((r) => Number(r[key]));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-100">Machine Overview</h1>
          <p className="text-sm text-slate-500">
            {phaseLabel} · {demo.active ? "auto demo telemetry" : "awaiting demo start"}
          </p>
        </div>
      </div>

      {demo.maintenanceInProgress && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-3 rounded-2xl border border-cyan-500/30 bg-cyan-500/10 px-4 py-3 text-sm text-cyan-200"
        >
          <Wrench className="h-4 w-4 shrink-0 animate-pulse-glow" />
          Maintenance action in progress — bearing inspection and lubrication underway.
        </motion.div>
      )}

      {highLoad && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="order-first"
        >
          <AlertsPanel alerts={alerts} onAcknowledge={acknowledgeAlert} />
        </motion.div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="glass-panel flex items-center justify-center rounded-2xl p-6">
          <HealthGauge health={health} status={status} />
        </div>
        <RULCard
          rul={componentRUL.bearing}
          status={componentHealths.bearing.status}
          machineStatus={status}
          maintenanceInProgress={demo.maintenanceInProgress}
        />
        {!highLoad && (
          <div className="glass-panel rounded-2xl p-5">
            <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-slate-400">
              <Activity className="h-3.5 w-3.5" />
              Demo Phase
            </div>
            <p className="mt-2 font-mono text-2xl font-semibold text-slate-200">
              {phaseLabel}
            </p>
            <p className="mt-3 text-xs text-slate-500">{phaseDescription}</p>
          </div>
        )}
      </div>

      <div
        className={`grid grid-cols-1 gap-4 sm:grid-cols-2 ${highLoad ? "lg:grid-cols-2" : "lg:grid-cols-4"}`}
      >
        <MetricCard
          label="Temperature"
          value={reading.temperature}
          unit="°C"
          icon={Thermometer}
          tone={reading.temperature > 65 ? "red" : reading.temperature > 55 ? "amber" : "cyan"}
          sparkline={sparkline("temperature")}
        />
        <MetricCard
          label="Vibration"
          value={reading.vibration}
          unit="mm/s"
          icon={Activity}
          tone={reading.vibration > 8 ? "red" : reading.vibration > 5 ? "amber" : "emerald"}
          sparkline={sparkline("vibration")}
        />
        {!highLoad && (
          <>
            <MetricCard
              label="Current"
              value={reading.current}
              unit="A"
              icon={Zap}
              tone={reading.current > 17 ? "red" : reading.current > 14 ? "amber" : "cyan"}
              sparkline={sparkline("current")}
            />
            <MetricCard
              label="RPM"
              value={reading.rpm}
              unit="rpm"
              icon={Gauge}
              precision={0}
              tone="emerald"
              sparkline={sparkline("rpm")}
            />
          </>
        )}
      </div>

      <div className={`grid grid-cols-1 gap-4 ${highLoad ? "" : "lg:grid-cols-2"}`}>
        <div className="glass-panel rounded-2xl p-5">
          <p className="text-xs font-medium uppercase tracking-wider text-slate-400">Temperature Trend</p>
          <div className="mt-2">
            <LiveLineChart
              data={chartData}
              series={[{ key: "temperature", label: "Temperature", color: "#f59e0b", unit: "°C" }]}
            />
          </div>
        </div>
        <div className="glass-panel rounded-2xl p-5">
          <p className="text-xs font-medium uppercase tracking-wider text-slate-400">
            Vibration Trend — RUL Projection
          </p>
          <div className="mt-2">
            <RULTrendChart history={history} rul={componentRUL.bearing} field="vibration" />
          </div>
        </div>
        {!highLoad && (
          <div className="glass-panel rounded-2xl p-5 lg:col-span-2">
            <p className="text-xs font-medium uppercase tracking-wider text-slate-400">
              Current &amp; RPM
            </p>
            <div className="mt-2">
              <LiveLineChart
                data={chartData}
                series={[
                  { key: "current", label: "Current", color: "#10b981", unit: "A", axis: "left" },
                  { key: "rpm", label: "RPM", color: "#a78bfa", unit: "rpm", axis: "right" },
                ]}
              />
            </div>
          </div>
        )}
      </div>

      {!highLoad && <AlertsPanel alerts={alerts} onAcknowledge={acknowledgeAlert} />}
    </div>
  );
}
