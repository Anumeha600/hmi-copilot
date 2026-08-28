import type { Alert, ComponentHealth, SensorReading, TrendPrediction } from "@/types";
import { SIMULATED_SECONDS_PER_TICK, THRESHOLDS, TREND_WINDOW } from "./constants";

/** Ordinary least-squares slope of `values` against tick index. */
export function linearRegressionSlope(values: number[]): { slope: number; r2: number } {
  const n = values.length;
  if (n < 2) return { slope: 0, r2: 0 };

  const xs = values.map((_, i) => i);
  const xMean = xs.reduce((a, b) => a + b, 0) / n;
  const yMean = values.reduce((a, b) => a + b, 0) / n;

  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - xMean) * (values[i] - yMean);
    den += (xs[i] - xMean) ** 2;
  }
  const slope = den === 0 ? 0 : num / den;
  const intercept = yMean - slope * xMean;

  let ssRes = 0;
  let ssTot = 0;
  for (let i = 0; i < n; i++) {
    const predicted = slope * xs[i] + intercept;
    ssRes += (values[i] - predicted) ** 2;
    ssTot += (values[i] - yMean) ** 2;
  }
  const r2 = ssTot === 0 ? 1 : 1 - ssRes / ssTot;

  return { slope, r2 };
}

/**
 * Trend-based early warning: regresses vibration over the trailing window
 * instead of comparing a single reading against a threshold, so a rising
 * trend can be flagged before the critical value is ever crossed.
 */
export function predictVibrationTrend(history: SensorReading[]): TrendPrediction {
  const window = history.slice(-TREND_WINDOW).map((r) => r.vibration);
  const { slope, r2 } = linearRegressionSlope(window);

  const rising = slope > 0.015 && r2 > 0.5;
  const sustainedTicks = rising ? window.length : 0;
  const current = history[history.length - 1]?.vibration ?? 0;
  const remainingUnits = THRESHOLDS.vibration.critical - current;

  let timeToFailureHours: number | null = null;
  if (rising && remainingUnits > 0) {
    const ticksRemaining = remainingUnits / slope;
    const simulatedSecondsRemaining = ticksRemaining * SIMULATED_SECONDS_PER_TICK;
    timeToFailureHours = simulatedSecondsRemaining / 3600;
  } else if (current >= THRESHOLDS.vibration.critical) {
    timeToFailureHours = 0;
  }

  const confidence = rising
    ? Math.min(97, Math.round(58 + r2 * 30 + Math.min(slope * 400, 10)))
    : Math.round(Math.max(0, r2 * 40));

  return { slopePerTick: slope, rising, sustainedTicks, timeToFailureHours, confidence };
}

interface AlertRuleContext {
  history: SensorReading[];
  componentHealths: Record<string, ComponentHealth>;
  bearingPrediction: TrendPrediction;
  now: number;
  firstTriggeredAt: Map<string, number>;
}

function currentSlope(values: number[]): number {
  return linearRegressionSlope(values.slice(-TREND_WINDOW)).slope;
}

export function generateAlerts(ctx: AlertRuleContext): Alert[] {
  const { history, componentHealths, bearingPrediction, now, firstTriggeredAt } = ctx;
  const latest = history[history.length - 1];
  if (!latest) return [];

  const alerts: Alert[] = [];
  const currentTrend = currentSlope(history.map((r) => r.current));
  const tempTrend = currentSlope(history.map((r) => r.temperature));
  const rpmTrend = currentSlope(history.map((r) => r.rpm));

  const track = (ruleId: string): number => {
    if (!firstTriggeredAt.has(ruleId)) firstTriggeredAt.set(ruleId, now);
    return firstTriggeredAt.get(ruleId)!;
  };
  const clearTrack = (ruleId: string) => firstTriggeredAt.delete(ruleId);
  const durationHours = (since: number) =>
    ((now - since) * SIMULATED_SECONDS_PER_TICK) / 3600;

  // Rule 1: Bearing wear — vibration climbing while current holds steady.
  const bearingRuleId = "bearing-wear";
  if (bearingPrediction.rising && Math.abs(currentTrend) < 0.03) {
    const since = track(bearingRuleId);
    alerts.push({
      id: bearingRuleId,
      ruleId: bearingRuleId,
      title: "Bearing Wear Detected",
      severity: latest.vibration >= THRESHOLDS.vibration.critical ? "critical" : "warning",
      confidence: bearingPrediction.confidence,
      trendDurationHours: durationHours(since),
      rootCause: "Continuous vibration increase while current remains stable.",
      timeToFailureHours: bearingPrediction.timeToFailureHours,
      recommendedAction: "Inspect and lubricate the bearing during the next maintenance window.",
      timestamp: now,
      firstTriggeredAt: since,
      componentId: "bearing",
      acknowledged: false,
    });
  } else {
    clearTrack(bearingRuleId);
  }

  // Rule 2: Overheating risk — temperature trending up toward the critical band.
  const tempRuleId = "overheat-risk";
  if (tempTrend > 0.04 && latest.temperature > THRESHOLDS.temperature.warning - 8) {
    const since = track(tempRuleId);
    const remaining = THRESHOLDS.temperature.critical - latest.temperature;
    const ttf = remaining > 0 ? (remaining / tempTrend) * SIMULATED_SECONDS_PER_TICK / 3600 : 0;
    alerts.push({
      id: tempRuleId,
      ruleId: tempRuleId,
      title: "Thermal Trend Rising",
      severity: latest.temperature >= THRESHOLDS.temperature.critical ? "critical" : "warning",
      confidence: Math.min(95, Math.round(60 + tempTrend * 300)),
      trendDurationHours: durationHours(since),
      rootCause: "Housing temperature climbing faster than cooling can compensate.",
      timeToFailureHours: ttf,
      recommendedAction: "Check cooling fan airflow and ambient ventilation.",
      timestamp: now,
      firstTriggeredAt: since,
      componentId: "fan",
      acknowledged: false,
    });
  } else {
    clearTrack(tempRuleId);
  }

  // Rule 3: Motor overload — current elevated together with an RPM drop.
  const motorRuleId = "motor-overload";
  if (latest.current > THRESHOLDS.current.warning && rpmTrend < -0.15) {
    const since = track(motorRuleId);
    alerts.push({
      id: motorRuleId,
      ruleId: motorRuleId,
      title: "Motor Overload Signature",
      severity: latest.current >= THRESHOLDS.current.critical ? "critical" : "warning",
      confidence: 80,
      trendDurationHours: durationHours(since),
      rootCause: "Rising current draw combined with falling shaft speed indicates load resistance.",
      timeToFailureHours: null,
      recommendedAction: "Verify load coupling and motor winding temperature.",
      timestamp: now,
      firstTriggeredAt: since,
      componentId: "motor",
      acknowledged: false,
    });
  } else {
    clearTrack(motorRuleId);
  }

  // Rule 4: Any component in outright critical health.
  for (const comp of Object.values(componentHealths)) {
    if (comp.status !== "critical") continue;
    const ruleId = `critical-${comp.id}`;
    const since = track(ruleId);
    if (alerts.some((a) => a.componentId === comp.id)) continue;
    alerts.push({
      id: ruleId,
      ruleId,
      title: `${comp.name} Health Critical`,
      severity: "critical",
      confidence: 90,
      trendDurationHours: durationHours(since),
      rootCause: `${comp.name} health has fallen to ${comp.health.toFixed(0)}%.`,
      timeToFailureHours: comp.remainingHours,
      recommendedAction: comp.recommendation,
      timestamp: now,
      firstTriggeredAt: since,
      componentId: comp.id,
      acknowledged: false,
    });
  }

  return alerts;
}
