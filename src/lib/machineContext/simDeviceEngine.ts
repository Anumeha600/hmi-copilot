/**
 * Generic deterministic device simulator — PURE.
 *
 * Constructed from a DeviceSpec + a serializable DeviceRuntimeState + the
 * current clock. All telemetry is a closed-form function of elapsed time, so
 * any serverless invocation that is handed the same state produces identical
 * output. Control methods return a NEW DeviceRuntimeState; nothing is stored on
 * the instance beyond the values computed for `now`.
 *
 * SIMULATION ONLY; nothing here talks to hardware.
 */

import type {
  Alarm,
  ContextAnalysisRow,
  CopilotActivityStep,
  IoPoint,
  MachineContext,
  MachineEvent,
  OperatorAction,
  PlcTag,
  ProcessValue,
  ProcessValueStatus,
} from "./model";
import type { DeviceDiagnosis } from "./model";
import type { DeviceSpec, ProcessValueSpec } from "./deviceSpecs";
import {
  alarmCrossedAt,
  computeValues,
  machineStateOf,
  pvValueAt,
  transition,
  STARTING_MS,
  type DeviceRuntimeState,
} from "./sessionState";

function round(v: number, dp: number) {
  const f = 10 ** dp;
  return Math.round(v * f) / f;
}

export interface DeviceControlResult {
  ok: boolean;
  error?: string;
  events: MachineEvent[];
  state: DeviceRuntimeState;
}

type Source = "operator" | "copilot";

export class SimDeviceEngine {
  private readonly spec: DeviceSpec;
  private readonly state: DeviceRuntimeState;
  private readonly now: number;
  private readonly values: Record<string, number>;

  constructor(spec: DeviceSpec, state: DeviceRuntimeState, now: number = Date.now()) {
    this.spec = spec;
    this.state = state;
    this.now = now;
    this.values = computeValues(spec, state, now);
  }

  // --------------------------------------------------------------------
  // control — each returns the next DeviceRuntimeState
  // --------------------------------------------------------------------
  start(source: Source): DeviceControlResult {
    if (this.state.emergencyStop) return this.fail("Emergency stop active — clear before starting.");
    if (this.state.inService) return this.fail(`${this.spec.kind} already running.`);
    const state = transition(this.spec, this.state, { inService: true, startingUntil: this.now + STARTING_MS }, this.now);
    return { ok: true, events: [this.actionEvent(source, `${this.spec.kind} START commanded`, "Start sequence initiated.")], state };
  }
  stop(source: Source): DeviceControlResult {
    if (!this.state.inService) return this.fail(`${this.spec.kind} already stopped.`);
    const state = transition(this.spec, this.state, { inService: false, startingUntil: 0 }, this.now);
    return { ok: true, events: [this.actionEvent(source, `${this.spec.kind} STOP commanded`, "Stop sequence initiated.")], state };
  }
  setMode(mode: "AUTO" | "MANUAL", source: Source): DeviceControlResult {
    if (this.state.emergencyStop) return this.fail("Emergency stop active.");
    if (this.state.mode === mode) return { ok: true, events: [], state: this.state };
    const state = transition(this.spec, this.state, { mode }, this.now);
    return { ok: true, events: [this.actionEvent(source, `Mode set to ${mode}`, `Operating mode changed to ${mode}.`)], state };
  }
  acknowledgeAlarm(source: Source): DeviceControlResult {
    const state = transition(this.spec, this.state, { acknowledged: true }, this.now);
    return { ok: true, events: [this.actionEvent(source, `${this.spec.alarm.label} acknowledged`, "Operator acknowledged the active alarm.")], state };
  }
  resolve(source: Source): DeviceControlResult {
    if (!this.state.faulted) return { ok: true, events: [], state: this.state };
    const state = transition(this.spec, this.state, { faulted: false, alarmCleared: false, acknowledged: false }, this.now);
    return { ok: true, events: [this.actionEvent(source, `${this.spec.rootCause.cause} corrected`, "Fault condition cleared; telemetry recovering.")], state };
  }
  valve(valveId: string, open: boolean, source: Source): DeviceControlResult {
    const state = transition(this.spec, this.state, { faulted: false, alarmCleared: false, acknowledged: false }, this.now);
    return { ok: true, events: [this.actionEvent(source, `${valveId} ${open ? "opened" : "closed"}`, `Valve ${valveId} commanded ${open ? "open" : "closed"}.`)], state };
  }
  triggerEmergencyStop(source: Source): DeviceControlResult {
    const state = transition(this.spec, this.state, { emergencyStop: true, inService: false, startingUntil: 0 }, this.now);
    return { ok: true, events: [this.actionEvent(source, "EMERGENCY STOP", "Machine latched in Safe Mode by operator.")], state };
  }
  /** Demo-scenario director — (re)arms the seeded incident. Not a machine control. */
  armIncident(): DeviceControlResult {
    const state = transition(this.spec, this.state, { faulted: true, inService: true, alarmCleared: false, acknowledged: false }, this.now);
    return {
      ok: true,
      events: [this.event("alarm", "info", "Demo incident armed", `${this.driverPv().label} beginning to move toward the ${this.spec.alarm.label} condition.`)],
      state,
    };
  }

  private fail(error: string): DeviceControlResult {
    return { ok: false, error, events: [], state: this.state };
  }

  // --------------------------------------------------------------------
  private driverPv(): ProcessValueSpec {
    return this.spec.processValues.find((p) => p.id === this.spec.alarm.driverPvId)!;
  }
  private isAlarmActive(): boolean {
    if (this.state.alarmCleared || this.state.emergencyStop) return false;
    const d = this.driverPv();
    const v = this.values[d.id];
    if (this.spec.alarm.direction === "high") return d.limitHigh != null && v >= d.limitHigh;
    return d.limitLow != null && v <= d.limitLow;
  }
  private severity(): "medium" | "high" | "critical" {
    const v = this.values[this.driverPv().id];
    const s = this.spec.alarm.severity;
    if (this.spec.alarm.direction === "high") {
      if (v >= s.critical) return "critical";
      if (v >= s.high) return "high";
      return "medium";
    }
    if (v <= s.critical) return "critical";
    if (v <= s.high) return "high";
    return "medium";
  }
  private pvStatus(pv: ProcessValueSpec): ProcessValueStatus {
    const v = this.values[pv.id];
    if (pv.kind === "boolean") return v !== pv.nominal ? "high" : "normal";
    if (!this.state.inService && pv.id !== "level") return v <= pv.stopped + 0.01 ? "low" : "normal";
    if (pv.id === this.spec.alarm.driverPvId && this.isAlarmActive()) {
      return this.severity() === "critical" ? "critical" : "high";
    }
    if (pv.limitHigh != null && v >= pv.limitHigh) return "high";
    if (pv.limitLow != null && v <= pv.limitLow) return "low";
    if (v > pv.normalHigh) return "high";
    if (v < pv.normalLow) return "low";
    return "normal";
  }

  private event(kind: MachineEvent["kind"], severity: MachineEvent["severity"], title: string, detail: string, alarmId?: string): MachineEvent {
    return { id: `evt-${this.now}-${Math.random().toString(36).slice(2, 6)}`, kind, severity, title, detail, at: this.now, alarmId };
  }
  private actionEvent(source: Source, title: string, detail: string): MachineEvent {
    return {
      id: `evt-${this.now}-${Math.random().toString(36).slice(2, 6)}`,
      kind: source === "copilot" ? "copilot_action" : "operator_action",
      severity: "info",
      title,
      detail: source === "copilot" ? `${detail} (copilot-proposed, operator-authorized)` : detail,
      at: this.now,
    };
  }

  // --------------------------------------------------------------------
  primaryHistory(): number[] {
    const d = this.driverPv();
    return Array.from({ length: 60 }, (_, i) => round(pvValueAt(d, this.state, this.now - (59 - i) * 1000), d.decimals));
  }
  historyOf(pvId: string): number[] {
    const pv = this.spec.processValues.find((p) => p.id === pvId);
    if (!pv) return [];
    return Array.from({ length: 60 }, (_, i) => round(pvValueAt(pv, this.state, this.now - (59 - i) * 1000), pv.decimals));
  }
  driverPvId(): string {
    return this.spec.alarm.driverPvId;
  }
  driverUnit(): string {
    return this.driverPv().unit;
  }
  isRunning(): boolean {
    return this.state.inService && !this.state.emergencyStop;
  }
  machineState() {
    return machineStateOf(this.state, this.now);
  }
  alarmActive(): boolean {
    return this.isAlarmActive();
  }
  alarmLimit(): number {
    const d = this.driverPv();
    return (this.spec.alarm.direction === "high" ? d.limitHigh : d.limitLow) ?? 0;
  }
  toState(): DeviceRuntimeState {
    return this.state;
  }

  // --------------------------------------------------------------------
  buildContext(activeScreenId: string | null): MachineContext {
    const now = this.now;
    const dev = this.spec.id;
    const running = this.isRunning();

    const processValues: ProcessValue[] = this.spec.processValues.map((pv) => ({
      id: pv.id,
      label: pv.label,
      value: round(this.values[pv.id], pv.decimals),
      unit: pv.unit,
      status: this.pvStatus(pv),
      normalLow: pv.normalLow,
      normalHigh: pv.normalHigh,
      limitHigh: pv.limitHigh,
      limitLow: pv.limitLow,
      tagId: `${dev}.${pv.id.toUpperCase()}.PV`,
    }));

    const tags: PlcTag[] = [
      { id: `${dev}.RUN`, address: "DB10.DBX0.0", label: "In service", datatype: "BOOL", value: running, quality: "good" },
      ...this.spec.processValues.map((pv, i): PlcTag => ({
        id: `${dev}.${pv.id.toUpperCase()}.PV`,
        address: `DB10.DBD${4 + i * 4}`,
        label: pv.label,
        datatype: pv.kind === "boolean" ? "BOOL" : pv.decimals > 0 ? "REAL" : "INT",
        value: pv.kind === "boolean" ? this.values[pv.id] === 1 : round(this.values[pv.id], pv.decimals),
        unit: pv.unit || undefined,
        quality: "good",
      })),
      { id: `${dev}.MODE`, address: "DB10.DBB60", label: "Operating mode", datatype: "STRING", value: this.state.emergencyStop ? "SAFE_MODE" : this.state.mode, quality: "good" },
    ];

    const io: IoPoint[] = [
      { id: "DI0.0", channel: "DI 0.0", direction: "input", label: "Run feedback", state: running },
      { id: "DI0.3", channel: "DI 0.3", direction: "input", label: "Emergency stop healthy", state: !this.state.emergencyStop },
      { id: "DO1.1", channel: "DO 1.1", direction: "output", label: "Alarm beacon", state: this.isAlarmActive() },
      ...this.spec.processValues.slice(0, 2).map((pv, i): IoPoint => ({
        id: `AI${2 + i}`,
        channel: `AI ${2 + i}`,
        direction: "input",
        label: pv.label,
        state: round(this.values[pv.id], pv.decimals),
        unit: pv.unit || undefined,
      })),
    ];

    const alarms: Alarm[] = [];
    if (this.isAlarmActive()) {
      const d = this.driverPv();
      const v = round(this.values[d.id], d.decimals);
      alarms.push({
        id: this.spec.alarm.id,
        label: this.spec.alarm.label,
        severity: this.severity(),
        state: "active",
        message: `${d.label} is ${v} ${d.unit} — ${this.spec.alarm.direction === "high" ? "above" : "below"} the configured limit of ${this.alarmLimit()} ${d.unit}.${this.state.acknowledged ? " (acknowledged)" : ""}`,
        triggeredAt: alarmCrossedAt(this.spec, this.state, now),
        processValueId: d.id,
        limit: this.alarmLimit(),
        unit: d.unit,
        relatedProcessValueIds: this.spec.alarm.relatedPvIds,
      });
    }

    return {
      machine: { id: this.spec.id, name: this.spec.name, type: `${this.spec.kind} (simulated)`, location: this.spec.location },
      assets: this.spec.assets,
      tags,
      io,
      processValues,
      alarms,
      operatingModes: ["AUTO", "MANUAL", "STOPPED", "SAFE_MODE"],
      operatorActions: this.buildOperatorActions(),
      documents: this.spec.documents,
      runtime: {
        mode: this.state.emergencyStop ? "SAFE_MODE" : this.state.mode,
        machineState: this.machineState(),
        shift: "Shift B · 14:00–22:00",
        operator: "Console operator",
        connectivity: "simulation",
        lastContextSyncAt: now,
        activeScreenId,
      },
      generatedAt: now,
    };
  }

  private buildOperatorActions(): OperatorAction[] {
    const alarmActive = this.isAlarmActive() && !this.state.acknowledged;
    const emergency = this.state.emergencyStop;
    const ms = this.machineState();
    if (this.spec.controls === "valves") {
      return [
        { id: "OPEN_OUTLET", label: "Open outlet valve", kind: "control", critical: true, enabled: !emergency, disabledReason: emergency ? "Emergency stop active" : undefined },
        { id: "CLOSE_INLET", label: "Close inlet valve", kind: "control", critical: true, enabled: !emergency, disabledReason: emergency ? "Emergency stop active" : undefined },
        { id: "ACK", label: "Acknowledge alarm", kind: "acknowledge", critical: false, enabled: alarmActive, disabledReason: alarmActive ? undefined : "No active alarm" },
        { id: "RESOLVE", label: "Restore balance (sim)", kind: "control", critical: true, enabled: this.state.faulted, disabledReason: this.state.faulted ? undefined : "Already nominal" },
      ];
    }
    return [
      { id: "STOP", label: "Stop", kind: "control", critical: true, enabled: (ms === "RUNNING" || ms === "STARTING") && !emergency, disabledReason: ms === "STOPPED" ? "Not running" : emergency ? "Emergency stop active" : undefined },
      { id: "START", label: "Start", kind: "control", critical: true, enabled: ms === "STOPPED" && !emergency, disabledReason: ms === "RUNNING" || ms === "STARTING" ? "Already running" : emergency ? "Emergency stop active" : undefined },
      { id: "ACK", label: "Acknowledge alarm", kind: "acknowledge", critical: false, enabled: alarmActive, disabledReason: alarmActive ? undefined : "No active alarm" },
      { id: "RESOLVE", label: `Restore ${this.spec.alarm.focusLabel.toLowerCase()} (sim)`, kind: "control", critical: true, enabled: this.state.faulted, disabledReason: this.state.faulted ? undefined : "Already nominal" },
    ];
  }

  // --------------------------------------------------------------------
  diagnose(): DeviceDiagnosis {
    const alarm = this.isAlarmActive();
    const d = this.driverPv();
    const v = round(this.values[d.id], d.decimals);
    const limit = this.alarmLimit();
    const overBy = round(Math.abs(v - limit), d.decimals);
    const pvVal = (id: string) => {
      const pv = this.spec.processValues.find((p) => p.id === id);
      return pv ? `${round(this.values[id], pv.decimals)} ${pv.unit}`.trim() : "—";
    };
    const pvStat = (id: string) => {
      const pv = this.spec.processValues.find((p) => p.id === id);
      return pv ? this.pvStatus(pv) : "normal";
    };

    const activity: CopilotActivityStep[] = alarm
      ? [
          { id: "detect", label: "Event detected", state: "done", at: alarmCrossedAt(this.spec, this.state, this.now) },
          { id: "correlate", label: "Correlating process signals", state: "done" },
          { id: "conditions", label: "Checking operating conditions", state: "done" },
          { id: "causes", label: "Evaluating likely causes", state: "done" },
          { id: "sop", label: "SOP matched", state: "done" },
          { id: "guidance", label: "Recommendation ready", state: "active" },
        ]
      : [
          { id: "read", label: "Reading machine context", state: "done" },
          { id: "monitor", label: "Monitoring process signals", state: "done" },
          { id: "nominal", label: "All values within range", state: "active" },
        ];

    if (!alarm) {
      return {
        deviceKind: this.spec.kind,
        currentEvent: { title: "No active events", severity: "info", alarmId: null },
        activity,
        contextAnalysis: this.spec.processValues
          .filter((p) => p.overview)
          .slice(0, 4)
          .map((p): ContextAnalysisRow => ({ label: p.label, value: pvVal(p.id), status: pvStat(p.id) === "normal" ? "normal" : "high" })),
        alarmIntel: null,
        rootCause: null,
        recommendedAction: null,
        finding: null,
        machineView: { focusAssetId: null, focusLabel: null, note: null },
        suggestions: this.spec.suggestions,
      };
    }

    const contextAnalysis: ContextAnalysisRow[] = [
      { label: d.label, value: `${v} ${d.unit}`, status: "high" },
      { label: "Configured limit", value: `${limit} ${d.unit}`, status: "info" },
      { label: `${this.spec.kind} state`, value: this.machineState() === "RUNNING" ? "Running" : this.machineState(), status: "info" },
      ...this.spec.rootCause.signalPvIds
        .filter((id) => id !== d.id)
        .slice(0, 3)
        .map((id): ContextAnalysisRow => {
          const s = pvStat(id);
          const pv = this.spec.processValues.find((p) => p.id === id)!;
          return { label: pv.label, value: s === "normal" ? "Normal" : `${pvVal(id)}`, status: s === "normal" ? "normal" : "elevated" };
        }),
    ];

    const rootCause = {
      cause: this.spec.rootCause.cause,
      confidence: this.spec.rootCause.confidence,
      rationale: this.spec.rootCause.rationale,
      supportingSignals: this.spec.rootCause.signalPvIds.map((id) => {
        const pv = this.spec.processValues.find((p) => p.id === id)!;
        return `${pv.label} ${pvVal(id)}${id === d.id ? ` vs ${limit} ${d.unit} limit` : ` (${pvStat(id)})`}`;
      }),
    };

    const sop = this.spec.documents[0];
    const recommendedAction = { text: this.spec.recommendedAction, sopId: sop?.id ?? null };

    const finding = {
      summary:
        `${this.spec.name} shows ${this.spec.alarm.label.toLowerCase()}: ${d.label.toLowerCase()} is ${v} ${d.unit}, ` +
        `${this.spec.alarm.direction === "high" ? "exceeding" : "below"} the configured ${limit} ${d.unit} limit. ` +
        `The most likely cause is ${this.spec.rootCause.cause.toLowerCase()}.`,
      whatIFound: [
        `${d.label} is ${overBy} ${d.unit} ${this.spec.alarm.direction === "high" ? "above" : "below"} limit`,
        ...this.spec.rootCause.signalPvIds
          .filter((id) => id !== d.id)
          .slice(0, 2)
          .map((id) => {
            const pv = this.spec.processValues.find((p) => p.id === id)!;
            const s = pvStat(id);
            return `${pv.label} is ${s === "normal" ? "within normal range" : s}`;
          }),
        `${this.spec.kind} remains ${this.isRunning() ? "operational" : "stopped"}`,
      ],
      nextAction: this.spec.recommendedAction,
    };

    const alarmIntel = {
      alarmId: this.spec.alarm.id,
      label: this.spec.alarm.label,
      severity: this.severity(),
      explanation:
        `${this.spec.alarm.label} is ${this.severity().toUpperCase()} severity. ${d.label} is ${v} ${d.unit}, ` +
        `${overBy} ${d.unit} ${this.spec.alarm.direction === "high" ? "above" : "below"} the ${limit} ${d.unit} limit. ` +
        `${this.spec.rootCause.rationale}`,
      relatedProcessValues: this.spec.alarm.relatedPvIds.map((id) => {
        const pv = this.spec.processValues.find((p) => p.id === id)!;
        return { label: pv.label, value: pvVal(id), status: pvStat(id) };
      }),
    };

    return {
      deviceKind: this.spec.kind,
      currentEvent: { title: `${this.spec.alarm.label} detected`, severity: this.severity(), alarmId: this.spec.alarm.id },
      activity,
      contextAnalysis,
      alarmIntel,
      rootCause,
      recommendedAction,
      finding,
      machineView: {
        focusAssetId: this.spec.alarm.focusAssetId,
        focusLabel: this.spec.alarm.focusLabel,
        note: `Possible ${this.spec.rootCause.cause.toLowerCase()}`,
      },
      suggestions: this.spec.suggestions,
    };
  }

  goldenPath() {
    return this.spec.goldenPath;
  }
}
