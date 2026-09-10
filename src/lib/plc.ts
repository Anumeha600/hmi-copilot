import { computeComponentHealths, computeOverallHealth, statusFromHealth } from "./health";
import { HISTORY_LENGTH, NOMINAL, THRESHOLDS } from "./constants";
import type {
  Alert,
  ComponentHealth,
  ComponentId,
  HealthPoint,
  InterlockStatus,
  MachineStatus,
  MotorCommand,
  OperatorState,
  OverloadStatus,
  PLCOperatingMode,
  PLCStatus,
  PLCTelemetry,
  SensorReading,
} from "@/types";

/**
 * Software PLC / Virtual PLC — a deterministic simulated industrial control layer.
 * This is NOT a connection to physical PLC hardware; it is a stand-in that can
 * later be replaced by a real PLC communicating over an industrial protocol
 * (Modbus/OPC-UA/etc) without changing anything downstream of `PLCTickResult`.
 *
 * Frequency ↔ RPM uses a simple constant V/Hz relationship anchored to the
 * app's existing nominal RPM (1490) at an assumed 50Hz line frequency — the
 * same NOMINAL/THRESHOLDS constants the rest of the app already uses, so
 * 50Hz reproduces exactly today's nominal operating point.
 */
export const PLC_NOMINAL_FREQUENCY_HZ = 50;
export const PLC_MIN_FREQUENCY_HZ = 0;
export const PLC_MAX_FREQUENCY_HZ = 60;
export const PLC_FREQUENCY_STEP_HZ = 1;

const RPM_PER_HZ = NOMINAL.rpm / PLC_NOMINAL_FREQUENCY_HZ; // 29.8

/** Fraction of the remaining gap to target closed per tick — first-order lag, never instant. */
const RPM_RAMP_RATE = 0.22;
const TEMP_RAMP_RATE = 0.06;
/** Ticks spent in STARTING before reaching RUNNING — makes the transition observable, not decorative. */
const STARTING_TICKS = 1;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export interface PLCEvent {
  type: "started" | "stopped" | "mode_changed" | "setpoint_changed" | "fault" | "emergency_stop" | "emergency_cleared";
  detail: string;
}

export interface PLCSnapshot {
  reading: SensorReading;
  health: number;
  status: MachineStatus;
  componentHealths: Record<ComponentId, ComponentHealth>;
  alerts: Alert[];
  operator: OperatorState;
  history: SensorReading[];
  healthHistory: HealthPoint[];
}

export interface PLCTickResult {
  snapshot: PLCSnapshot;
  plc: PLCTelemetry;
  events: PLCEvent[];
}

export class PLCEngine {
  private plcStatus: PLCStatus = "STOPPED";
  private operatingMode: PLCOperatingMode = "STOPPED";
  private motorCommand: MotorCommand = "STOP";
  private frequencySetpoint = PLC_NOMINAL_FREQUENCY_HZ;
  private actualRpm = 0;
  private temperature: number = NOMINAL.temperature;
  private emergencyStopActive = false;
  private faultCode: string | null = null;
  private startingTicksRemaining = 0;
  private cycleCount = 0;
  private history: SensorReading[] = [];
  private healthHistory: HealthPoint[] = [];
  private acknowledgedRuleIds = new Set<string>();
  /** Fault-condition flags derived from the LAST computed tick — used to gate the NEXT start()/permissive check, avoiding circularity. */
  private lastOverload = false;
  private lastInterlockTripped = false;
  private lastReading: SensorReading = { timestamp: 0, temperature: NOMINAL.temperature, vibration: NOMINAL.vibration, current: 0, rpm: 0 };
  private lastComponentHealths: Record<ComponentId, ComponentHealth> = computeComponentHealths(this.lastReading);

  // ---------------- Operator commands ----------------

  start(): PLCEvent[] {
    if (this.emergencyStopActive) return [];
    if (this.plcStatus === "FAULT") return []; // must Stop to clear a latched fault first
    if (this.plcStatus === "RUNNING" || this.plcStatus === "STARTING") return [];
    if (!this.computePermissive()) return [];
    this.plcStatus = "STARTING";
    this.motorCommand = "RUN";
    this.startingTicksRemaining = STARTING_TICKS;
    if (this.operatingMode === "STOPPED" || this.operatingMode === "SAFE_MODE") {
      this.operatingMode = "AUTO";
    }
    return [
      {
        type: "started",
        detail: `Motor start commanded (${this.operatingMode} mode, setpoint ${this.frequencySetpoint.toFixed(1)} Hz).`,
      },
    ];
  }

  stop(): PLCEvent[] {
    if (this.plcStatus === "STOPPED") return [];
    const wasFault = this.plcStatus === "FAULT";
    this.plcStatus = "STOPPED";
    this.motorCommand = "STOP";
    this.faultCode = null;
    return [{ type: "stopped", detail: wasFault ? "Fault acknowledged — motor commanded to stop." : "Motor stop commanded." }];
  }

  setMode(mode: "AUTO" | "MANUAL"): PLCEvent[] {
    if (this.emergencyStopActive) return [];
    if (this.operatingMode === mode) return [];
    this.operatingMode = mode;
    return [{ type: "mode_changed", detail: `Operating mode changed to ${mode}.` }];
  }

  setFrequencySetpoint(hz: number): PLCEvent[] {
    if (this.emergencyStopActive) return [];
    const clamped = clamp(hz, PLC_MIN_FREQUENCY_HZ, PLC_MAX_FREQUENCY_HZ);
    const rounded = Math.round(clamped * 10) / 10;
    if (rounded === this.frequencySetpoint) return [];
    this.frequencySetpoint = rounded;
    return [{ type: "setpoint_changed", detail: `Frequency setpoint changed to ${rounded.toFixed(1)} Hz.` }];
  }

  jogFrequency(deltaHz: number): PLCEvent[] {
    return this.setFrequencySetpoint(this.frequencySetpoint + deltaHz);
  }

  acknowledgeAlert(ruleId: string) {
    this.acknowledgedRuleIds.add(ruleId);
  }

  /** Any state → SAFE_MODE. The existing top-level Emergency Stop remains authoritative — this just keeps the PLC's own state machine consistent with it. */
  triggerEmergencyStop(): void {
    this.emergencyStopActive = true;
    this.plcStatus = "SAFE_MODE";
    this.operatingMode = "SAFE_MODE";
    this.motorCommand = "STOP";
    this.faultCode = "E_STOP";
    this.actualRpm = 0;
  }

  /** Clears the PLC's own latch. Requires a fresh explicit Start afterward — never auto-resumes running. */
  clearEmergencyStop(): void {
    this.emergencyStopActive = false;
    this.plcStatus = "STOPPED";
    this.operatingMode = "STOPPED";
    this.motorCommand = "STOP";
    this.faultCode = null;
  }

  reset(): void {
    this.plcStatus = "STOPPED";
    this.operatingMode = "STOPPED";
    this.motorCommand = "STOP";
    this.frequencySetpoint = PLC_NOMINAL_FREQUENCY_HZ;
    this.actualRpm = 0;
    this.temperature = NOMINAL.temperature;
    this.emergencyStopActive = false;
    this.faultCode = null;
    this.startingTicksRemaining = 0;
    this.cycleCount = 0;
    this.history = [];
    this.healthHistory = [];
    this.acknowledgedRuleIds.clear();
    this.lastOverload = false;
    this.lastInterlockTripped = false;
  }

  private computePermissive(): boolean {
    return !this.emergencyStopActive && !this.lastOverload && !this.lastInterlockTripped;
  }

  private scanTime(): number {
    return 1.8 + 0.4 * Math.sin(this.cycleCount * 0.15);
  }

  // ---------------- Control-mode process model ----------------

  /**
   * Advances the control loop. `deltaMs === 0` recomputes the current snapshot
   * (e.g. right after an operator command, or an alert acknowledgement) without
   * advancing ramp physics or the scan counter — mirrors DemoController.tick(0).
   */
  tick(deltaMs: number): PLCTickResult {
    const events: PLCEvent[] = [];
    const advancing = deltaMs > 0;

    if (advancing) {
      this.cycleCount += Math.round(1000 / this.scanTime());

      if (this.plcStatus === "STARTING") {
        this.startingTicksRemaining -= 1;
        if (this.startingTicksRemaining <= 0) this.plcStatus = "RUNNING";
      }

      const running = this.motorCommand === "RUN" && (this.plcStatus === "RUNNING" || this.plcStatus === "STARTING");
      const targetRpm = running ? this.frequencySetpoint * RPM_PER_HZ : 0;
      this.actualRpm += (targetRpm - this.actualRpm) * RPM_RAMP_RATE;
      if (Math.abs(this.actualRpm) < 0.5) this.actualRpm = 0;

      const loadFraction = clamp(this.actualRpm / NOMINAL.rpm, 0, 1.3);
      const targetTemperature = NOMINAL.temperature + loadFraction * 10;
      this.temperature += (targetTemperature - this.temperature) * TEMP_RAMP_RATE;

      const expectedCurrent = loadFraction < 0.02 ? 0.3 : NOMINAL.current * loadFraction;
      const current = expectedCurrent + (expectedCurrent > 0.3 ? 0.05 * Math.sin(this.cycleCount * 0.5) : 0);
      // Vibration scales with rotation itself (near-zero at standstill, ~nominal at nominal
      // speed) plus a small penalty for running above nominal — NOT with deviation from
      // nominal in general, which would wrongly peak at a dead stop.
      const overspeedFraction = Math.max(0, loadFraction - 1);
      const expectedVibration = NOMINAL.vibration * loadFraction + overspeedFraction * NOMINAL.vibration * 0.5;
      const vibration = expectedVibration;

      const reading: SensorReading = {
        timestamp: Date.now(),
        temperature: this.temperature,
        vibration,
        current,
        rpm: this.actualRpm,
      };
      this.history.push(reading);
      if (this.history.length > HISTORY_LENGTH) this.history.shift();
      this.lastReading = reading;

      // health.ts's band-health formula scores deviation from the app's ONE fixed set
      // of NOMINAL values — correct for the scripted demo (a fixed-speed motor, where
      // any deviation only ever means a fault), but wrong for variable-frequency
      // control: intentionally running below nominal speed/load/temperature is normal,
      // not a fault. So the health probe compares temperature/vibration/current against
      // what's EXPECTED at the *actual* current operating point (derived from actualRpm,
      // which itself already ramps smoothly) — tracking well reads as healthy at any
      // frequency, while a genuine future fault (extra heat/vibration/current beyond
      // what this operating point predicts) still shows up.
      //
      // RPM itself is deliberately fed as flat NOMINAL: comparing actualRpm against the
      // just-commanded targetRpm would flag every ordinary speed change (including a
      // simple Stop) as a "fault" — that's the ramp itself, not wear. There's no
      // independent speed-tracking fault model in control mode, so assume healthy
      // rather than inventing a false alarm out of an intentional transient.
      const healthProbeReading: SensorReading = {
        timestamp: reading.timestamp,
        temperature: NOMINAL.temperature + (this.temperature - targetTemperature),
        vibration: NOMINAL.vibration + (vibration - expectedVibration),
        current: NOMINAL.current + (current - expectedCurrent),
        rpm: NOMINAL.rpm,
      };
      const componentHealths = computeComponentHealths(healthProbeReading);
      this.lastComponentHealths = componentHealths;
      const health = computeOverallHealth(componentHealths);
      this.healthHistory.push({ timestamp: reading.timestamp, health });
      if (this.healthHistory.length > HISTORY_LENGTH) this.healthHistory.shift();

      const overload = current >= THRESHOLDS.current.critical;
      const interlockTripped = Object.values(componentHealths).some((c) => c.status === "critical");

      if (!this.emergencyStopActive && running && (overload || interlockTripped) && this.plcStatus !== "FAULT") {
        this.plcStatus = "FAULT";
        this.motorCommand = "STOP";
        this.faultCode = overload ? "OVERLOAD" : "INTERLOCK";
        events.push({ type: "fault", detail: `PLC fault: ${this.faultCode} — motor auto-stopped by protection logic.` });
      }
      this.lastOverload = overload;
      this.lastInterlockTripped = interlockTripped;
    }

    const reading = this.lastReading;
    const componentHealths = this.lastComponentHealths;
    const health = computeOverallHealth(componentHealths);
    const status: MachineStatus = this.emergencyStopActive ? "safe_mode" : statusFromHealth(health);

    const alerts: Alert[] = [];
    if (this.lastOverload) {
      alerts.push(
        this.buildAlert(
          "plc-overload",
          "PLC Overload Trip",
          "critical",
          "motor",
          "Motor current exceeded the overload threshold.",
          "Inspect motor load and VFD current limit settings."
        )
      );
    }
    if (this.lastInterlockTripped) {
      const critical = Object.values(componentHealths).find((c) => c.status === "critical");
      alerts.push(
        this.buildAlert(
          "plc-interlock",
          "PLC Interlock Trip",
          "critical",
          critical?.id ?? "bearing",
          `${critical?.name ?? "A component"} health is critical — interlock prevents safe operation.`,
          "Resolve the underlying component fault before restarting."
        )
      );
    }
    if (this.emergencyStopActive) {
      alerts.push(
        this.buildAlert(
          "plc-estop",
          "PLC Emergency Stop",
          "critical",
          "motor",
          "Emergency Stop is active — PLC is latched in Safe Mode.",
          "Clear Emergency Stop and restart the PLC to resume."
        )
      );
    }

    const operator: OperatorState = {
      cognitiveLoad: alerts.length > 0 ? 55 : 15,
      loadLevel: alerts.length > 0 ? "medium" : "low",
      responseTimeMs: 450,
      ignoredAlerts: 0,
      alertFrequency: alerts.length,
    };

    return {
      snapshot: { reading, health, status, componentHealths, alerts, operator, history: this.history, healthHistory: this.healthHistory },
      plc: this.snapshotTelemetry(false),
      events,
    };
  }

  private buildAlert(
    ruleId: string,
    title: string,
    severity: "critical" | "warning" | "info",
    componentId: ComponentId,
    rootCause: string,
    recommendedAction: string
  ): Alert {
    const now = Date.now();
    return {
      id: ruleId,
      ruleId,
      title,
      severity,
      confidence: 90,
      trendDurationHours: 0,
      rootCause,
      timeToFailureHours: null,
      recommendedAction,
      timestamp: now,
      firstTriggeredAt: now,
      componentId,
      acknowledged: this.acknowledgedRuleIds.has(ruleId),
    };
  }

  /**
   * Mirrors the scripted demo's live reading — display-only. While the demo is
   * active, its DemoController is the sole source of truth for the process;
   * the PLC never drives anything, it just reflects the same numbers so the
   * /plc page stays coherent instead of showing stale or conflicting state.
   */
  syncFromDemo(reading: SensorReading, demoMachineStatus: MachineStatus): PLCTelemetry {
    this.actualRpm = reading.rpm;
    if (!this.emergencyStopActive) {
      const safe = demoMachineStatus === "safe_mode";
      this.plcStatus = safe ? "SAFE_MODE" : "RUNNING";
      this.operatingMode = safe ? "SAFE_MODE" : "AUTO";
      this.motorCommand = safe ? "STOP" : "RUN";
    }
    this.frequencySetpoint = Math.round((reading.rpm / RPM_PER_HZ) * 10) / 10;
    this.cycleCount += Math.round(1000 / this.scanTime());
    return this.snapshotTelemetry(true);
  }

  private snapshotTelemetry(demoSynced: boolean): PLCTelemetry {
    const actualFrequency = Math.round((this.actualRpm / RPM_PER_HZ) * 10) / 10;
    const interlockStatus: InterlockStatus = this.lastInterlockTripped ? "TRIPPED" : "OK";
    const overloadStatus: OverloadStatus = this.lastOverload ? "OVERLOAD" : "NORMAL";
    return {
      status: this.plcStatus,
      mode: this.operatingMode,
      motorCommand: this.motorCommand,
      frequencySetpoint: this.frequencySetpoint,
      actualFrequency,
      permissive: this.computePermissive(),
      interlockStatus,
      overloadStatus,
      emergencyStop: this.emergencyStopActive,
      faultCode: this.faultCode,
      scanTime: Math.round(this.scanTime() * 100) / 100,
      cycleCount: this.cycleCount,
      demoSynced,
    };
  }

  /** Snapshot without advancing anything — used for the idle/reset payload. */
  getTelemetry(): PLCTelemetry {
    return this.snapshotTelemetry(false);
  }

  isRunningOrStarting(): boolean {
    return this.plcStatus === "RUNNING" || this.plcStatus === "STARTING";
  }
}
