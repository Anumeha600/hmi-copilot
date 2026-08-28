import type { ComponentHealth, ComponentId, ComponentRUL, SensorReading, TrendDirection, TrendPrediction } from "@/types";
import { linearRegressionSlope } from "./prediction";
import { NOMINAL, SIMULATED_SECONDS_PER_TICK, THRESHOLDS, TREND_WINDOW } from "./constants";

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

type BadDirection = "rising" | "falling";

interface ProjectConfig {
  componentId: ComponentId;
  metricLabel: string;
  unit: string;
  field: keyof Pick<SensorReading, "temperature" | "vibration" | "current" | "rpm">;
  badDirection: BadDirection;
  warning: number;
  critical: number;
  nominal: number;
}

/** Minimum |slope| (relative to the warning-to-critical span) to call a trend meaningful, generalizing the fixed 0.015 vibration-specific gate in predictVibrationTrend to any sensor scale. */
const MEANINGFUL_SLOPE_FRACTION = 0.0025;
const MIN_R2 = 0.5;
const MAX_DISPLAY_HOURS = 24;

function formatHoursLabel(hours: number): string {
  const h = Math.max(0, hours);
  if (h < 0.1) return "< 0.1 hrs";
  if (h < 1) return `${Math.round(h * 60)} min`;
  return `${h.toFixed(1)} hrs`;
}

function projectComponentRUL(
  history: SensorReading[],
  failureProbability: number,
  config: ProjectConfig
): ComponentRUL {
  const window = history.slice(-TREND_WINDOW).map((r) => r[config.field]);
  const { slope, r2 } = linearRegressionSlope(window);
  const current = history.length ? history[history.length - 1][config.field] : config.nominal;
  const span = Math.abs(config.critical - config.nominal);
  const slopeGate = span > 0 ? span * MEANINGFUL_SLOPE_FRACTION : 0.01;

  // "Badness" is the slope in the direction that moves toward the critical threshold.
  const badSlope = config.badDirection === "rising" ? slope : -slope;
  const degrading = badSlope > slopeGate;
  const improving = badSlope < -slopeGate;
  const dataSufficient = history.length >= 2;

  const slopePerSimulatedHour = slope * (3600 / SIMULATED_SECONDS_PER_TICK);

  const alreadyCritical =
    config.badDirection === "rising" ? current >= config.critical : current <= config.critical;

  let direction: TrendDirection;
  const degradingArrow = config.badDirection === "rising" ? "↑" : "↓";
  const improvingArrow = config.badDirection === "rising" ? "↓" : "↑";
  if (!dataSufficient) {
    direction = "indeterminate";
  } else if (degrading) {
    direction = config.badDirection === "rising" ? "increasing" : "decreasing";
  } else if (improving) {
    direction = "improving";
  } else {
    direction = "stable";
  }

  const trendDescription =
    direction === "indeterminate"
      ? "Indeterminate"
      : direction === "increasing"
        ? `${degradingArrow} Increasing ${config.metricLabel.toLowerCase()}`
        : direction === "decreasing"
          ? `${degradingArrow} Decreasing ${config.metricLabel.toLowerCase()}`
          : direction === "improving"
            ? `${improvingArrow} Improving`
            : "→ Stable";

  let rulHours: number | null = null;
  let rulLabel: string;
  let rulReason: string | null = null;

  if (alreadyCritical) {
    rulHours = 0;
    rulLabel = "Critical now";
  } else if (!dataSufficient) {
    rulLabel = "Indeterminate";
    rulReason = "Not enough telemetry history yet to compute a trend.";
  } else if (degrading && r2 >= MIN_R2) {
    const remaining = config.badDirection === "rising" ? config.critical - current : current - config.critical;
    const ticksRemaining = remaining / Math.abs(slope);
    const hours = clamp((ticksRemaining * SIMULATED_SECONDS_PER_TICK) / 3600, 0, Number.MAX_SAFE_INTEGER);
    rulHours = hours;
    rulLabel = hours > MAX_DISPLAY_HOURS ? "> 24 hrs" : formatHoursLabel(hours);
  } else if (degrading && r2 < MIN_R2) {
    rulLabel = "Indeterminate";
    rulReason = `Trend appears to be degrading but the fit is too noisy to trust (R²=${r2.toFixed(2)}).`;
  } else {
    rulLabel = "> 24 hrs";
  }

  const confidence = degrading
    ? clamp(Math.round(58 + r2 * 30 + Math.min((Math.abs(slope) / Math.max(slopeGate, 1e-9)) * 10, 10)), 0, 97)
    : clamp(Math.round(Math.max(0, r2 * 40)), 0, 100);

  return {
    componentId: config.componentId,
    metricLabel: config.metricLabel,
    unit: config.unit,
    current,
    slopePerTick: slope,
    slopePerSimulatedHour,
    r2,
    warningThreshold: config.warning,
    criticalThreshold: config.critical,
    degrading: degrading || alreadyCritical,
    direction,
    trendDescription,
    rulHours,
    rulLabel,
    rulReason,
    failureProbability,
    confidence,
    dataSufficient,
  };
}

const CONFIGS: Record<ComponentId, ProjectConfig> = {
  bearing: {
    componentId: "bearing",
    metricLabel: "Vibration",
    unit: "mm/s",
    field: "vibration",
    badDirection: "rising",
    warning: THRESHOLDS.vibration.warning,
    critical: THRESHOLDS.vibration.critical,
    nominal: NOMINAL.vibration,
  },
  shaft: {
    componentId: "shaft",
    metricLabel: "RPM",
    unit: "rpm",
    field: "rpm",
    badDirection: "falling",
    warning: THRESHOLDS.rpm.warningLow,
    critical: THRESHOLDS.rpm.criticalLow,
    nominal: NOMINAL.rpm,
  },
  fan: {
    componentId: "fan",
    metricLabel: "Temperature",
    unit: "°C",
    field: "temperature",
    badDirection: "rising",
    warning: THRESHOLDS.temperature.warning,
    critical: THRESHOLDS.temperature.critical,
    nominal: NOMINAL.temperature,
  },
  motor: {
    componentId: "motor",
    metricLabel: "Current",
    unit: "A",
    field: "current",
    badDirection: "rising",
    warning: THRESHOLDS.current.warning,
    critical: THRESHOLDS.current.critical,
    nominal: NOMINAL.current,
  },
};

/** Computes a real, regression-derived RUL for all four Industrial Motor components from the live sensor history. */
export function computeAllComponentRUL(
  history: SensorReading[],
  componentHealths: Record<ComponentId, ComponentHealth>
): Record<ComponentId, ComponentRUL> {
  const out = {} as Record<ComponentId, ComponentRUL>;
  for (const id of Object.keys(CONFIGS) as ComponentId[]) {
    out[id] = projectComponentRUL(history, componentHealths[id].failureProbability, CONFIGS[id]);
  }
  return out;
}

/** Adapts a bearing ComponentRUL back into the existing TrendPrediction shape so current consumers (diagnosis.ts, AlertsPanel) need no type changes. */
export function toTrendPrediction(rul: ComponentRUL): TrendPrediction {
  return {
    slopePerTick: rul.slopePerTick,
    rising: rul.degrading,
    sustainedTicks: rul.dataSufficient && rul.degrading ? TREND_WINDOW : 0,
    timeToFailureHours: rul.rulHours,
    confidence: rul.confidence,
  };
}

