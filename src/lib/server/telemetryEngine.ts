import { DemoController, buildStaticHealthySnapshot, type DemoTickResult } from "@/lib/demo";
import { computeAllComponentRUL, toTrendPrediction } from "@/lib/rul";
import { PLCEngine, type PLCEvent, type PLCTickResult } from "@/lib/plc";
import { insertMaintenanceLog } from "./db";
import type {
  Alert,
  ComponentHealth,
  ComponentId,
  ComponentRUL,
  DemoPhase,
  DemoPhaseName,
  DemoStatus,
  LoadLevel,
  MaintenanceLogEntry,
  OperatorState,
  PLCTelemetry,
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
  private plc = new PLCEngine();
  private plcEventSeq = 0;
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
        alerts: Alert[];
        plc: PLCTelemetry;
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
      plc: this.plc.getTelemetry(),
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

  private buildPayload(
    result: DemoTickResult,
    componentRUL: Record<ComponentId, ComponentRUL>,
    plc: PLCTelemetry
  ): TelemetryPayload {
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
      plc,
    };
  }

  /** Same payload shape, sourced from the PLC's own control-mode process simulation instead of the scripted demo. */
  private buildControlPayload(result: PLCTickResult, componentRUL: Record<ComponentId, ComponentRUL>): TelemetryPayload {
    const { snapshot, plc } = result;
    const ambientPhase: DemoPhase =
      snapshot.status === "critical" || snapshot.status === "safe_mode"
        ? "fault"
        : snapshot.status === "warning"
          ? "rising"
          : "healthy";
    return {
      timestamp: snapshot.reading.timestamp,
      phase: "healthy",
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
      ambientPhase,
      componentHealths: snapshot.componentHealths,
      alerts: snapshot.alerts,
      operator: snapshot.operator,
      bearingPrediction: toTrendPrediction(componentRUL.bearing),
      componentRUL,
      history: snapshot.history,
      healthHistory: snapshot.healthHistory,
      maintenanceLog: this.maintenanceLog,
      demo: {
        active: false,
        running: plc.status === "RUNNING",
        phase: "healthy",
        phaseLabel: "PLC Control Mode",
        phaseProgress: 0,
        totalProgress: 0,
        loopCount: 0,
        maintenanceInProgress: false,
      },
      plc,
    };
  }

  private applyDemoResult(result: DemoTickResult) {
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
    // While the scripted demo owns the process, the PLC is a synchronized, read-only mirror of it.
    const plcTelemetry = this.plc.syncFromDemo(result.snapshot.reading, result.snapshot.status);
    this.current = this.buildPayload(result, componentRUL, plcTelemetry);
    this.applySafeModeOverride();
    this.broadcast();
  }

  /** Control-mode tick — used only while the scripted demo is not active; the PLC drives the process itself. */
  private applyControlTick(deltaMs: number) {
    const result = this.plc.tick(deltaMs);
    this.logPlcEvents(result.events);
    const componentRUL = this.computeRUL(result.snapshot.history, result.snapshot.componentHealths);
    this.current = this.buildControlPayload(result, componentRUL);
    this.applySafeModeOverride();
    this.broadcast();
  }

  private applySafeModeOverride() {
    if (this.safeModeFields) {
      this.current = {
        ...this.current,
        ...this.safeModeFields,
        demo: { ...this.current.demo, running: false },
      };
    }
  }

  private logPlcEvents(events: PLCEvent[]) {
    for (const event of events) {
      const id = `plc-${event.type}-${Date.now()}-${this.plcEventSeq++}`;
      insertMaintenanceLog({
        id,
        timestamp: Date.now(),
        phase: "control",
        component: "PLC",
        health: this.current.health,
        vibration: this.current.vibration,
        temperature: this.current.temperature,
        action: event.detail,
        rul: null,
        failureProbability: null,
        predictionConfidence: null,
        trend: null,
      });
    }
  }

  private startClock() {
    if (this.timer) return;
    this.timer = setInterval(() => {
      if (this.controller.isActive()) {
        this.applyDemoResult(this.controller.tick(TICK_MS));
      } else {
        this.applyControlTick(TICK_MS);
      }
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
    this.plc.clearEmergencyStop();
    this.controller.start();
    this.applyDemoResult(this.controller.tick(0));
  }

  pause() {
    this.safeModeFields = null;
    this.plc.clearEmergencyStop();
    this.controller.pause();
    this.applyDemoResult(this.controller.tick(0));
  }

  reset() {
    this.safeModeFields = null;
    this.controller.reset();
    this.plc.reset();
    this.maintenanceLog = [];
    this.current = this.buildIdlePayload();
    this.broadcast();
  }

  acknowledge(ruleId: string) {
    if (this.controller.isActive()) {
      this.controller.acknowledgeAlert(ruleId);
      this.applyDemoResult(this.controller.tick(0));
    } else {
      this.plc.acknowledgeAlert(ruleId);
      this.applyControlTick(0);
    }
  }

  // ---------------- PLC control actions ----------------
  // No-ops (with an error result) while the scripted demo owns the process —
  // this is the DEMO MODE vs CONTROL MODE split: the two control surfaces never fight.

  private plcAction(run: () => void): { ok: boolean; error?: string } {
    if (this.controller.isActive()) {
      return { ok: false, error: "PLC controls are disabled while the Demo is running." };
    }
    run();
    this.applyControlTick(0);
    return { ok: true };
  }

  plcStart() {
    return this.plcAction(() => this.logPlcEvents(this.plc.start()));
  }

  plcStop() {
    return this.plcAction(() => this.logPlcEvents(this.plc.stop()));
  }

  plcSetMode(mode: "AUTO" | "MANUAL") {
    return this.plcAction(() => this.logPlcEvents(this.plc.setMode(mode)));
  }

  plcSetFrequencySetpoint(hz: number) {
    return this.plcAction(() => this.logPlcEvents(this.plc.setFrequencySetpoint(hz)));
  }

  plcJogFrequency(deltaHz: number) {
    return this.plcAction(() => this.logPlcEvents(this.plc.jogFrequency(deltaHz)));
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
    this.plc.triggerEmergencyStop();

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
    const estopAlert: Alert = {
      id: "plc-estop",
      ruleId: "plc-estop",
      title: "Emergency Stop Activated",
      severity: "critical",
      confidence: 100,
      trendDurationHours: 0,
      rootCause: "Operator-initiated Emergency Stop — PLC and process latched in Safe Mode.",
      timeToFailureHours: null,
      recommendedAction: "Confirm the machine is safe, then Resume to clear Safe Mode.",
      timestamp,
      firstTriggeredAt: timestamp,
      componentId: "bearing",
      acknowledged: false,
    };
    this.safeModeFields = {
      status: "safe_mode",
      rpm: 0,
      current: 0,
      operatorLoad: "low",
      operator: safeOperator,
      timeToFailure: this.current.timeToFailure,
      bearingPrediction: this.current.bearingPrediction,
      componentRUL: this.current.componentRUL,
      alerts: [estopAlert, ...this.current.alerts.filter((a) => a.ruleId !== "plc-estop")],
      plc: this.plc.getTelemetry(),
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
