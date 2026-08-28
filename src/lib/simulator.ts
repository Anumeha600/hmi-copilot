import type {
  Alert,
  ComponentId,
  DemoPhase,
  HealthPoint,
  MaintenanceLogEntry,
  OperatorState,
  SensorReading,
  SimulationSnapshot,
} from "@/types";
import { CYCLE_LENGTH, HISTORY_LENGTH, NOMINAL, PHASE_BOUNDS } from "./constants";
import { computeComponentHealths, computeOverallHealth, statusFromHealth } from "./health";
import { generateAlerts, predictVibrationTrend } from "./prediction";

function easeInOut(t: number): number {
  const c = Math.min(1, Math.max(0, t));
  return c * c * (3 - 2 * c);
}

function noise(amplitude: number): number {
  return (Math.random() - 0.5) * amplitude;
}

interface PhaseTarget {
  temperature: number;
  vibration: number;
  current: number;
  rpm: number;
}

function phaseTarget(phase: DemoPhase, localT: number): PhaseTarget {
  switch (phase) {
    case "rising": {
      const p = easeInOut(localT);
      return {
        temperature: NOMINAL.temperature + 12 * p,
        vibration: NOMINAL.vibration + 6.8 * p,
        current: NOMINAL.current,
        rpm: NOMINAL.rpm - 25 * p,
      };
    }
    case "fault": {
      const wobble = Math.sin(localT * Math.PI);
      return {
        temperature: 60 + wobble * 4,
        vibration: 9.1 + wobble * 0.5,
        current: NOMINAL.current + 0.3,
        rpm: NOMINAL.rpm - 30,
      };
    }
    case "recovery": {
      const p = 1 - easeInOut(localT);
      return {
        temperature: NOMINAL.temperature + 12 * p,
        vibration: NOMINAL.vibration + 6.8 * p,
        current: NOMINAL.current,
        rpm: NOMINAL.rpm - 25 * p,
      };
    }
    case "healthy":
    case "stable":
    default:
      return {
        temperature: NOMINAL.temperature,
        vibration: NOMINAL.vibration,
        current: NOMINAL.current,
        rpm: NOMINAL.rpm,
      };
  }
}

function phaseAt(tick: number): { phase: DemoPhase; localT: number } {
  const t = tick % CYCLE_LENGTH;
  for (const [phase, bounds] of Object.entries(PHASE_BOUNDS) as [DemoPhase, [number, number]][]) {
    const [start, end] = bounds;
    if (t >= start && t < end) return { phase, localT: (t - start) / (end - start) };
  }
  return { phase: "stable", localT: 0 };
}

const SMOOTHING = 0.15;
const IGNORED_THRESHOLD_TICKS = 8;

export class SimulationEngine {
  private elapsed = 0;
  private reading: SensorReading;
  private history: SensorReading[] = [];
  private healthHistory: HealthPoint[] = [];
  private firstTriggeredAt = new Map<string, number>();
  private acknowledgedRuleIds = new Set<string>();
  private maintenanceLog: MaintenanceLogEntry[] = [];
  private lastPhase: DemoPhase = "healthy";
  private operatorLoad = 8;
  private responseTimeMs = 650;

  constructor() {
    this.reading = {
      timestamp: Date.now(),
      temperature: NOMINAL.temperature,
      vibration: NOMINAL.vibration,
      current: NOMINAL.current,
      rpm: NOMINAL.rpm,
    };
    this.history.push(this.reading);
  }

  acknowledgeAlert(ruleId: string) {
    this.acknowledgedRuleIds.add(ruleId);
  }

  tick(): SimulationSnapshot {
    this.elapsed += 1;
    const { phase, localT } = phaseAt(this.elapsed);
    const target = phaseTarget(phase, localT);

    const next: SensorReading = {
      timestamp: Date.now(),
      temperature: this.reading.temperature + (target.temperature - this.reading.temperature) * SMOOTHING + noise(0.4),
      vibration: Math.max(
        0,
        this.reading.vibration + (target.vibration - this.reading.vibration) * SMOOTHING + noise(0.1)
      ),
      current: Math.max(
        0,
        this.reading.current + (target.current - this.reading.current) * SMOOTHING + noise(0.12)
      ),
      rpm: this.reading.rpm + (target.rpm - this.reading.rpm) * SMOOTHING + noise(3),
    };
    this.reading = next;
    this.history.push(next);
    if (this.history.length > HISTORY_LENGTH) this.history.shift();

    const componentHealths = computeComponentHealths(next);
    const health = computeOverallHealth(componentHealths);
    this.healthHistory.push({ timestamp: next.timestamp, health });
    if (this.healthHistory.length > HISTORY_LENGTH) this.healthHistory.shift();

    const status = statusFromHealth(health);
    const bearingPrediction = predictVibrationTrend(this.history);

    if (this.lastPhase === "fault" && phase === "recovery") {
      this.maintenanceLog.unshift({
        id: `maint-${this.elapsed}`,
        timestamp: next.timestamp,
        componentId: "bearing",
        action: "Bearing inspected and lubricated during scheduled maintenance window.",
        healthBefore: componentHealths.bearing.health,
        healthAfter: 96,
      });
    }
    this.lastPhase = phase;

    const rawAlerts = generateAlerts({
      history: this.history,
      componentHealths,
      bearingPrediction,
      now: this.elapsed,
      firstTriggeredAt: this.firstTriggeredAt,
    });

    const activeRuleIds = new Set(rawAlerts.map((a) => a.ruleId));
    for (const id of Array.from(this.acknowledgedRuleIds)) {
      if (!activeRuleIds.has(id)) this.acknowledgedRuleIds.delete(id);
    }

    const alerts: Alert[] = rawAlerts.map((a) => ({
      ...a,
      acknowledged: this.acknowledgedRuleIds.has(a.ruleId),
    }));

    const ignoredAlerts = alerts.filter(
      (a) => !a.acknowledged && this.elapsed - a.firstTriggeredAt > IGNORED_THRESHOLD_TICKS
    ).length;
    const alertFrequency = alerts.length;

    const targetResponseTime = 550 + alertFrequency * 220 + ignoredAlerts * 320;
    this.responseTimeMs += (targetResponseTime - this.responseTimeMs) * 0.25;

    const targetLoad = Math.min(
      100,
      alertFrequency * 17 + ignoredAlerts * 13 + Math.max(0, this.responseTimeMs - 550) / 35
    );
    this.operatorLoad += (targetLoad - this.operatorLoad) * 0.2;

    const loadLevel = this.operatorLoad < 35 ? "low" : this.operatorLoad < 70 ? "medium" : "high";

    const operator: OperatorState = {
      cognitiveLoad: Math.round(this.operatorLoad),
      loadLevel,
      responseTimeMs: Math.round(this.responseTimeMs),
      ignoredAlerts,
      alertFrequency,
    };

    return {
      reading: next,
      health,
      status,
      phase,
      componentHealths,
      alerts,
      maintenanceLog: this.maintenanceLog,
      operator,
      history: this.history,
      healthHistory: this.healthHistory,
      bearingPrediction,
    };
  }
}

export function componentIdList(): ComponentId[] {
  return ["bearing", "motor", "shaft", "fan"];
}
