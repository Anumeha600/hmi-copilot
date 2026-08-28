import { DemoController, buildStaticHealthySnapshot, type DemoTickResult } from "@/lib/demo";
import { computeAllComponentRUL, toTrendPrediction } from "@/lib/rul";
import { insertMaintenanceLog } from "./db";
import type {
  ComponentHealth,
  ComponentId,
  ComponentRUL,
  DemoPhase,
  DemoPhaseName,
  DemoStatus,
  LoadLevel,
  MaintenanceLogEntry,
  OperatorState,
  SensorReading,
  TelemetryPayload,
  TrendPrediction,
} from "@/types";

const TICK_MS = 1000;

type Listener = (payload: TelemetryPayload) => void;

/** The ambient engine's phase vocabulary is coarser than the demo's — map onto the closest bucket. */
function demoPhaseToAmbientPhase(name: DemoPhaseName): DemoPhase {
  switch (name) {
    case "healthy":
      return "healthy";
    case "early_warning":
      return "rising";
    case "critical":
    case "maintenance":
      return "fault";
    case "recovery":
      return "recovery";
  }
}

function idleDemoStatus(): DemoStatus {
  return {
    active: false,
    running: false,
    phase: "healthy",
    phaseLabel: "Healthy",
    phaseProgress: 0,
    totalProgress: 0,
    loopCount: 0,
    maintenanceInProgress: false,
  };
}

class TelemetryEngine {
  private controller = new DemoController();
  private listeners = new Set<Listener>();
  private maintenanceLog: MaintenanceLogEntry[] = [];
  private current: TelemetryPayload;
  private timer: ReturnType<typeof setInterval> | null = null;
  /** Set while Emergency Stop's Safe Mode override should win over freshly-computed ticks. */
  private safeModeFields:
    | {
        status: "safe_mode";
        rpm: number;
        current: number;
        operatorLoad: LoadLevel;
        operator: OperatorState;
        timeToFailure: number | null;
        bearingPrediction: TrendPrediction;
        componentRUL: Record<ComponentId, ComponentRUL>;
      }
    | null = null;

  constructor() {
    this.current = this.buildIdlePayload();
    this.startClock();
  }

  private buildIdlePayload(): TelemetryPayload {
    const idle = buildStaticHealthySnapshot();
    const componentRUL = computeAllComponentRUL(idle.history, idle.componentHealths);
    return {
      timestamp: idle.reading.timestamp || Date.now(),
      phase: "healthy",
      health: idle.health,
      temperature: idle.reading.temperature,
      vibration: idle.reading.vibration,
      current: idle.reading.current,
      rpm: idle.reading.rpm,
      bearingHealth: idle.componentHealths.bearing.health,
      motorHealth: idle.componentHealths.motor.health,
      shaftHealth: idle.componentHealths.shaft.health,
      fanHealth: idle.componentHealths.fan.health,
      batteryHealth: idle.componentHealths.motor.health,
      operatorLoad: idle.operator.loadLevel,
      timeToFailure: componentRUL.bearing.rulHours,
      status: idle.status,
      ambientPhase: idle.phase,
      componentHealths: idle.componentHealths,
      alerts: idle.alerts,
      operator: idle.operator,
      bearingPrediction: toTrendPrediction(componentRUL.bearing),
      componentRUL,
      history: idle.history,
      healthHistory: idle.healthHistory,
      maintenanceLog: [],
      demo: idleDemoStatus(),
    };
  }

  /**
   * Real, regression-derived RUL/trend numbers for all four components (lib/rul.ts),
   * computed from the live sensor history the DemoController already accumulates —
   * this replaces the scripted `snapshot.bearingPrediction` fake with genuine OLS output.
   */
  private computeRUL(history: SensorReading[], componentHealths: Record<ComponentId, ComponentHealth>) {
    return computeAllComponentRUL(history, componentHealths);
  }

  private buildPayload(result: DemoTickResult, componentRUL: Record<ComponentId, ComponentRUL>): TelemetryPayload {
    const { snapshot, demoStatus } = result;
    return {
      timestamp: snapshot.reading.timestamp,
      phase: demoStatus.phase,
      health: snapshot.health,
      temperature: snapshot.reading.temperature,
      vibration: snapshot.reading.vibration,
      current: snapshot.reading.current,
      rpm: snapshot.reading.rpm,
      bearingHealth: snapshot.componentHealths.bearing.health,
      motorHealth: snapshot.componentHealths.motor.health,
      shaftHealth: snapshot.componentHealths.shaft.health,
      fanHealth: snapshot.componentHealths.fan.health,
      batteryHealth: snapshot.componentHealths.motor.health,
      operatorLoad: snapshot.operator.loadLevel,
      timeToFailure: componentRUL.bearing.rulHours,
      status: snapshot.status,
      ambientPhase: demoPhaseToAmbientPhase(demoStatus.phase),
      componentHealths: snapshot.componentHealths,
      alerts: snapshot.alerts,
      operator: snapshot.operator,
      bearingPrediction: toTrendPrediction(componentRUL.bearing),
      componentRUL,
      history: snapshot.history,
      healthHistory: snapshot.healthHistory,
      maintenanceLog: this.maintenanceLog,
      demo: demoStatus,
    };
  }

  private applyResult(result: DemoTickResult) {
    const componentRUL = this.computeRUL(result.snapshot.history, result.snapshot.componentHealths);

    if (result.newMaintenanceEvent) {
      const event = result.newMaintenanceEvent;
      this.maintenanceLog = [event, ...this.maintenanceLog];
      const bearingRUL = componentRUL.bearing;

      // "During every Maintenance phase automatically insert a log" — persisted
      // with the sensor context captured at the exact tick the repair completed.
      insertMaintenanceLog({
        id: event.id,
        timestamp: event.timestamp,
        phase: "maintenance",
        component: event.componentId,
        health: event.healthAfter,
        vibration: result.snapshot.reading.vibration,
        temperature: result.snapshot.reading.temperature,
        action: event.action,
        rul: bearingRUL.rulHours,
        failureProbability: bearingRUL.failureProbability,
        predictionConfidence: bearingRUL.confidence,
        trend: bearingRUL.trendDescription,
      });
    }
    this.current = this.buildPayload(result, componentRUL);
    if (this.safeModeFields) {
      this.current = {
        ...this.current,
        ...this.safeModeFields,
        demo: { ...this.current.demo, running: false },
      };
    }
    this.broadcast();
  }

  private startClock() {
    if (this.timer) return;
    this.timer = setInterval(() => {
      this.applyResult(this.controller.tick(TICK_MS));
    }, TICK_MS);
  }

  private broadcast() {
    for (const listener of this.listeners) listener(this.current);
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  getSnapshot(): TelemetryPayload {
    return this.current;
  }

  start() {
    this.safeModeFields = null;
    this.controller.start();
    this.applyResult(this.controller.tick(0));
  }

  pause() {
    this.safeModeFields = null;
    this.controller.pause();
    this.applyResult(this.controller.tick(0));
  }

  reset() {
    this.safeModeFields = null;
    this.controller.reset();
    this.maintenanceLog = [];
    this.current = this.buildIdlePayload();
    this.broadcast();
  }

  acknowledge(ruleId: string) {
    this.controller.acknowledgeAlert(ruleId);
    this.applyResult(this.controller.tick(0));
  }

  /**
   * Freezes telemetry and forces the machine into Safe Mode. This overrides the
   * *displayed* payload only — the underlying DemoController is merely paused.
   * The override is sticky (`safeModeFields`) so it survives every subsequent
   * clock tick, alert acknowledgement, etc. until Start/Pause/Reset explicitly
   * clears it — Start/Resume afterward continues the scripted demo exactly as
   * before.
   */
  emergencyStop() {
    this.controller.pause();

    const timestamp = Date.now();
    const entry: MaintenanceLogEntry = {
      id: `emergency-${timestamp}`,
      timestamp,
      componentId: "bearing",
      action: "Emergency shutdown initiated.",
      healthBefore: this.current.health,
      healthAfter: this.current.health,
    };
    this.maintenanceLog = [entry, ...this.maintenanceLog];
    const bearingRUL = this.current.componentRUL.bearing;
    insertMaintenanceLog({
      id: entry.id,
      timestamp: entry.timestamp,
      phase: "emergency",
      component: "system",
      health: this.current.health,
      vibration: this.current.vibration,
      temperature: this.current.temperature,
      action: entry.action,
      rul: bearingRUL.rulHours,
      failureProbability: bearingRUL.failureProbability,
      predictionConfidence: bearingRUL.confidence,
      trend: bearingRUL.trendDescription,
    });

    // Freeze RUL/trend at their exact value the instant Emergency Stop was pressed —
    // the prediction clock must not keep advancing while the machine is in Safe Mode.
    const safeOperator = { ...this.current.operator, loadLevel: "low" as const, cognitiveLoad: 5 };
    this.safeModeFields = {
      status: "safe_mode",
      rpm: 0,
      current: 0,
      operatorLoad: "low",
      operator: safeOperator,
      timeToFailure: this.current.timeToFailure,
      bearingPrediction: this.current.bearingPrediction,
      componentRUL: this.current.componentRUL,
    };
    this.current = {
      ...this.current,
      timestamp,
      ...this.safeModeFields,
      demo: { ...this.current.demo, running: false },
      maintenanceLog: this.maintenanceLog,
    };
    this.broadcast();
  }
}

declare global {
  var __sensegridTelemetryEngine: TelemetryEngine | undefined;
}

/** Guarded via globalThis so dev-mode hot reload never spins up a second ticking interval. */
export function getTelemetryEngine(): TelemetryEngine {
  if (!globalThis.__sensegridTelemetryEngine) {
    globalThis.__sensegridTelemetryEngine = new TelemetryEngine();
  }
  return globalThis.__sensegridTelemetryEngine;
}
