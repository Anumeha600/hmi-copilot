import { buildComponentHealth, statusFromHealth } from "./health";
import { HISTORY_LENGTH } from "./constants";
import type {
  Alert,
  ComponentHealth,
  ComponentId,
  DemoPhaseName,
  DemoStatus,
  HealthPoint,
  LoadLevel,
  MaintenanceLogEntry,
  MachineStatus,
  OperatorState,
  SensorReading,
  SimulationSnapshot,
  TrendPrediction,
} from "@/types";

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

function easeInOut(t: number): number {
  const c = clamp01(t);
  return c * c * (3 - 2 * c);
}

interface PhaseCurve {
  temperature: [number, number];
  vibration: [number, number];
  current: [number, number];
  rpm: [number, number];
  health: [number, number];
  operatorLoad: [number, number];
  responseTimeMs: [number, number];
  bearingHealth: [number, number];
  motorHealth: [number, number];
  shaftHealth: [number, number];
  fanHealth: [number, number];
}

function phaseValue(curve: [number, number], t: number): number {
  return lerp(curve[0], curve[1], t);
}

const PHASE_ORDER: DemoPhaseName[] = ["healthy", "early_warning", "critical", "maintenance", "recovery"];

const PHASE_DURATIONS_MS: Record<DemoPhaseName, number> = {
  healthy: 6000,
  early_warning: 8000,
  critical: 8000,
  maintenance: 4000,
  recovery: 4000,
};

export const DEMO_PHASE_LABELS: Record<DemoPhaseName, string> = {
  healthy: "Healthy",
  early_warning: "Early Warning",
  critical: "Critical",
  maintenance: "Maintenance",
  recovery: "Recovering",
};

export const DEMO_PHASE_DESCRIPTIONS: Record<DemoPhaseName, string> = {
  healthy: "All systems nominal — establishing baseline readings.",
  early_warning: "Vibration trend rising — predicted bearing degradation.",
  critical: "Bearing health critical — immediate attention required.",
  maintenance: "Maintenance crew dispatched — bearing inspection underway.",
  recovery: "Repair complete — health recovering to nominal.",
};

const CURVES: Record<DemoPhaseName, PhaseCurve> = {
  healthy: {
    temperature: [52, 52],
    vibration: [1.8, 1.8],
    current: [5.2, 5.2],
    rpm: [1500, 1500],
    health: [98, 98],
    operatorLoad: [8, 8],
    responseTimeMs: [500, 500],
    bearingHealth: [99, 99],
    motorHealth: [98, 98],
    shaftHealth: [97, 97],
    fanHealth: [97, 97],
  },
  early_warning: {
    temperature: [52, 60],
    vibration: [1.8, 6.5],
    current: [5.2, 5.4],
    rpm: [1500, 1470],
    health: [98, 76],
    operatorLoad: [8, 40],
    responseTimeMs: [500, 900],
    bearingHealth: [99, 55],
    motorHealth: [98, 94],
    shaftHealth: [97, 80],
    fanHealth: [97, 88],
  },
  critical: {
    temperature: [60, 68],
    vibration: [6.5, 9.5],
    current: [5.4, 5.3],
    rpm: [1470, 1450],
    health: [76, 45],
    operatorLoad: [40, 85],
    responseTimeMs: [900, 1600],
    bearingHealth: [55, 12],
    motorHealth: [94, 88],
    shaftHealth: [80, 58],
    fanHealth: [88, 75],
  },
  maintenance: {
    temperature: [68, 58],
    vibration: [9.5, 4.0],
    current: [5.3, 5.2],
    rpm: [1450, 1480],
    health: [45, 60],
    operatorLoad: [85, 55],
    responseTimeMs: [1600, 1100],
    bearingHealth: [12, 40],
    motorHealth: [88, 92],
    shaftHealth: [58, 70],
    fanHealth: [75, 82],
  },
  recovery: {
    temperature: [58, 52],
    vibration: [4.0, 1.8],
    current: [5.2, 5.2],
    rpm: [1480, 1500],
    health: [60, 95],
    operatorLoad: [55, 10],
    responseTimeMs: [1100, 500],
    bearingHealth: [40, 97],
    motorHealth: [92, 98],
    shaftHealth: [70, 96],
    fanHealth: [82, 96],
  },
};

interface PhaseBound {
  name: DemoPhaseName;
  startMs: number;
  endMs: number;
  durationMs: number;
}

const PHASE_BOUNDS: PhaseBound[] = (() => {
  let acc = 0;
  return PHASE_ORDER.map((name) => {
    const durationMs = PHASE_DURATIONS_MS[name];
    const bound: PhaseBound = { name, startMs: acc, endMs: acc + durationMs, durationMs };
    acc += durationMs;
    return bound;
  });
})();

export const DEMO_TOTAL_MS = PHASE_BOUNDS.reduce((sum, b) => sum + b.durationMs, 0);
export const DEMO_TICK_MS = 100;

/** Percent-of-loop markers for each phase boundary (excluding 0), for progress-bar ticks. */
export const DEMO_PHASE_MARKERS = PHASE_BOUNDS.slice(1).map((b) => (b.startMs / DEMO_TOTAL_MS) * 100);

export const INITIAL_DEMO_STATUS: DemoStatus = {
  active: false,
  running: false,
  phase: "healthy",
  phaseLabel: DEMO_PHASE_LABELS.healthy,
  phaseProgress: 0,
  totalProgress: 0,
  loopCount: 0,
  maintenanceInProgress: false,
};

function phaseAt(elapsedMs: number): PhaseBound {
  const wrapped = ((elapsedMs % DEMO_TOTAL_MS) + DEMO_TOTAL_MS) % DEMO_TOTAL_MS;
  for (const bound of PHASE_BOUNDS) {
    if (wrapped >= bound.startMs && wrapped < bound.endMs) return bound;
  }
  return PHASE_BOUNDS[PHASE_BOUNDS.length - 1];
}

/** Time-to-failure decreases continuously (8hr → 0.8hr) across early_warning + critical combined. */
function timeToFailureAt(elapsedMs: number, phase: DemoPhaseName): number | null {
  if (phase !== "early_warning" && phase !== "critical") return null;
  const start = PHASE_BOUNDS[1].startMs; // early_warning start
  const end = PHASE_BOUNDS[2].endMs; // critical end
  const t = clamp01((elapsedMs - start) / (end - start));
  return lerp(8, 0.8, t);
}

const BEARING_RULE_ID = "demo-bearing-wear";

function buildAlert(
  phase: DemoPhaseName,
  localT: number,
  elapsedMs: number,
  firstTriggeredAt: number,
  acknowledged: boolean
): Alert | null {
  if (phase === "healthy" || phase === "recovery") return null;

  const timeToFailureHours = timeToFailureAt(elapsedMs, phase);
  const trendDurationHours = Math.max(0, (elapsedMs - firstTriggeredAt) / 6000);
  const now = Date.now();

  if (phase === "early_warning") {
    return {
      id: BEARING_RULE_ID,
      ruleId: BEARING_RULE_ID,
      title: "Early Warning",
      severity: "warning",
      confidence: Math.round(lerp(60, 88, localT)),
      trendDurationHours,
      rootCause: "Predicted bearing degradation",
      timeToFailureHours,
      recommendedAction: "Schedule bearing inspection before the maintenance window closes.",
      timestamp: now,
      firstTriggeredAt,
      componentId: "bearing",
      acknowledged,
    };
  }

  if (phase === "critical") {
    return {
      id: BEARING_RULE_ID,
      ruleId: BEARING_RULE_ID,
      title: "Bearing Wear Critical",
      severity: "critical",
      confidence: Math.round(lerp(88, 97, localT)),
      trendDurationHours,
      rootCause: "Vibration trending critical while current remains stable.",
      timeToFailureHours,
      recommendedAction: "Inspect and lubricate the bearing immediately — failure imminent.",
      timestamp: now,
      firstTriggeredAt,
      componentId: "bearing",
      acknowledged,
    };
  }

  // maintenance
  return {
    id: BEARING_RULE_ID,
    ruleId: BEARING_RULE_ID,
    title: "Bearing Maintenance In Progress",
    severity: "warning",
    confidence: 90,
    trendDurationHours,
    rootCause: "Scheduled maintenance underway to correct bearing wear.",
    timeToFailureHours: null,
    recommendedAction: "Maintenance crew dispatched — repair in progress.",
    timestamp: now,
    firstTriggeredAt,
    componentId: "bearing",
    acknowledged,
  };
}

function loadLevelFromScore(score: number): LoadLevel {
  return score < 35 ? "low" : score < 70 ? "medium" : "high";
}

/**
 * The frozen, deterministic "nothing has happened yet" state — used both as the
 * app's initial render and as what Reset restores. Mirrors CURVES.healthy exactly,
 * so the static idle view and the demo's own healthy phase never disagree.
 */
export function buildStaticHealthySnapshot(): SimulationSnapshot {
  const curve = CURVES.healthy;
  const reading: SensorReading = {
    timestamp: 0,
    temperature: curve.temperature[0],
    vibration: curve.vibration[0],
    current: curve.current[0],
    rpm: curve.rpm[0],
  };
  const health = Math.round(curve.health[0]);
  const operatorLoadScore = curve.operatorLoad[0];

  const componentHealths: Record<ComponentId, ComponentHealth> = {
    bearing: buildComponentHealth(
      "bearing",
      curve.bearingHealth[0],
      "Inspect and lubricate bearing; schedule replacement if vibration persists.",
      "No action needed — operating within nominal range."
    ),
    motor: buildComponentHealth(
      "motor",
      curve.motorHealth[0],
      "Check winding temperature and load coupling.",
      "No action needed — current draw nominal."
    ),
    shaft: buildComponentHealth(
      "shaft",
      curve.shaftHealth[0],
      "Inspect shaft alignment and coupling for excess play.",
      "No action needed — rotational stability nominal."
    ),
    fan: buildComponentHealth(
      "fan",
      curve.fanHealth[0],
      "Clear airflow path and verify fan speed against setpoint.",
      "No action needed — thermal management nominal."
    ),
  };

  return {
    reading,
    health,
    status: statusFromHealth(health),
    phase: "healthy",
    componentHealths,
    alerts: [],
    maintenanceLog: [],
    operator: {
      cognitiveLoad: Math.round(operatorLoadScore),
      loadLevel: loadLevelFromScore(operatorLoadScore),
      responseTimeMs: Math.round(curve.responseTimeMs[0]),
      ignoredAlerts: 0,
      alertFrequency: 0,
    },
    history: [reading],
    healthHistory: [{ timestamp: 0, health }],
    bearingPrediction: { slopePerTick: 0, rising: false, sustainedTicks: 0, timeToFailureHours: null, confidence: 0 },
  };
}

export interface DemoSnapshot {
  reading: SensorReading;
  health: number;
  status: MachineStatus;
  componentHealths: Record<ComponentId, ComponentHealth>;
  alerts: Alert[];
  operator: OperatorState;
  history: SensorReading[];
  healthHistory: HealthPoint[];
  bearingPrediction: TrendPrediction;
}

export interface DemoTickResult {
  snapshot: DemoSnapshot;
  demoStatus: DemoStatus;
  newMaintenanceEvent: MaintenanceLogEntry | null;
}

/**
 * Drives a scripted, deterministic 30s demo loop (healthy → early warning →
 * critical → maintenance → recovery). Values are curve-interpolated, not
 * randomized, so the narrative is reproducible and judge-able.
 */
export class DemoController {
  private elapsedMs = 0;
  private running = false;
  private active = false;
  private loopCount = 0;
  private lastPhase: DemoPhaseName = "healthy";
  private alertFirstTriggeredAt: number | null = null;
  private acknowledgedRuleIds = new Set<string>();
  private history: SensorReading[] = [];
  private healthHistory: HealthPoint[] = [];

  start() {
    this.active = true;
    this.running = true;
  }

  pause() {
    this.running = false;
  }

  reset() {
    this.elapsedMs = 0;
    this.running = false;
    this.active = false;
    this.loopCount = 0;
    this.lastPhase = "healthy";
    this.alertFirstTriggeredAt = null;
    this.acknowledgedRuleIds.clear();
    this.history = [];
    this.healthHistory = [];
  }

  isActive(): boolean {
    return this.active;
  }

  isRunning(): boolean {
    return this.running;
  }

  acknowledgeAlert(ruleId: string) {
    this.acknowledgedRuleIds.add(ruleId);
  }

  tick(deltaMs: number): DemoTickResult {
    if (this.running) {
      this.elapsedMs += deltaMs;
      if (this.elapsedMs >= DEMO_TOTAL_MS) {
        this.elapsedMs -= DEMO_TOTAL_MS;
        this.loopCount += 1;
      }
    }
    return this.computeResult();
  }

  private computeResult(): DemoTickResult {
    const bound = phaseAt(this.elapsedMs);
    const localT = easeInOut(clamp01((this.elapsedMs - bound.startMs) / bound.durationMs));
    const curve = CURVES[bound.name];

    let newMaintenanceEvent: MaintenanceLogEntry | null = null;

    if (bound.name !== this.lastPhase) {
      if (this.lastPhase === "healthy" && bound.name === "early_warning") {
        this.alertFirstTriggeredAt = Date.now();
      }
      if (this.lastPhase === "maintenance" && bound.name === "recovery") {
        newMaintenanceEvent = {
          id: `demo-maint-${this.loopCount}-${Date.now()}`,
          timestamp: Date.now(),
          componentId: "bearing",
          action: "Bearing inspected and lubricated during scheduled maintenance window.",
          healthBefore: Math.round(phaseValue(CURVES.maintenance.bearingHealth, 1)),
          healthAfter: Math.round(phaseValue(CURVES.recovery.bearingHealth, 1)),
        };
      }
      if (bound.name === "healthy") {
        this.alertFirstTriggeredAt = null;
        this.acknowledgedRuleIds.clear();
      }
      this.lastPhase = bound.name;
    }

    const reading: SensorReading = {
      timestamp: Date.now(),
      temperature: phaseValue(curve.temperature, localT),
      vibration: phaseValue(curve.vibration, localT),
      current: phaseValue(curve.current, localT),
      rpm: phaseValue(curve.rpm, localT),
    };

    this.history.push(reading);
    if (this.history.length > HISTORY_LENGTH) this.history.shift();

    const health = Math.round(phaseValue(curve.health, localT));
    const status = statusFromHealth(health);

    this.healthHistory.push({ timestamp: reading.timestamp, health });
    if (this.healthHistory.length > HISTORY_LENGTH) this.healthHistory.shift();

    const componentHealths: Record<ComponentId, ComponentHealth> = {
      bearing: buildComponentHealth(
        "bearing",
        phaseValue(curve.bearingHealth, localT),
        "Inspect and lubricate bearing; schedule replacement if vibration persists.",
        "No action needed — operating within nominal range."
      ),
      motor: buildComponentHealth(
        "motor",
        phaseValue(curve.motorHealth, localT),
        "Check winding temperature and load coupling.",
        "No action needed — current draw nominal."
      ),
      shaft: buildComponentHealth(
        "shaft",
        phaseValue(curve.shaftHealth, localT),
        "Inspect shaft alignment and coupling for excess play.",
        "No action needed — rotational stability nominal."
      ),
      fan: buildComponentHealth(
        "fan",
        phaseValue(curve.fanHealth, localT),
        "Clear airflow path and verify fan speed against setpoint.",
        "No action needed — thermal management nominal."
      ),
    };

    const alert = buildAlert(
      bound.name,
      localT,
      this.elapsedMs,
      this.alertFirstTriggeredAt ?? this.elapsedMs,
      this.acknowledgedRuleIds.has(BEARING_RULE_ID)
    );
    const alerts: Alert[] = alert ? [alert] : [];

    const rising = bound.name === "early_warning" || bound.name === "critical";
    const bearingPrediction: TrendPrediction = {
      slopePerTick: 0,
      rising,
      sustainedTicks: rising ? 1 : 0,
      timeToFailureHours: timeToFailureAt(this.elapsedMs, bound.name),
      confidence: alert?.confidence ?? 0,
    };

    const operatorLoadScore = phaseValue(curve.operatorLoad, localT);
    const operator: OperatorState = {
      cognitiveLoad: Math.round(operatorLoadScore),
      loadLevel: loadLevelFromScore(operatorLoadScore),
      responseTimeMs: Math.round(phaseValue(curve.responseTimeMs, localT)),
      ignoredAlerts: 0,
      alertFrequency: alerts.length,
    };

    const demoStatus: DemoStatus = {
      active: this.active,
      running: this.running,
      phase: bound.name,
      phaseLabel: DEMO_PHASE_LABELS[bound.name],
      phaseProgress: clamp01((this.elapsedMs - bound.startMs) / bound.durationMs),
      totalProgress: clamp01(this.elapsedMs / DEMO_TOTAL_MS),
      loopCount: this.loopCount,
      maintenanceInProgress: bound.name === "maintenance",
    };

    return {
      snapshot: {
        reading,
        health,
        status,
        componentHealths,
        alerts,
        operator,
        history: this.history,
        healthHistory: this.healthHistory,
        bearingPrediction,
      },
      demoStatus,
      newMaintenanceEvent,
    };
  }
}
