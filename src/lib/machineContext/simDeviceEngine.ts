/**
 * Generic deterministic device simulator.
 *
 * One class drives every demo machine from its DeviceSpec — telemetry, the
 * seeded incident, alarm state, and the deterministic diagnosis the copilot
 * shows without being asked. SIMULATION ONLY; nothing here talks to hardware.
 */

import type {
  Alarm,
  ContextAnalysisRow,
  CopilotActivityStep,
  DeviceDiagnosis,
  IoPoint,
  MachineContext,
  MachineEvent,
  OperatingMode,
  OperatorAction,
  PlcTag,
  ProcessValue,
  ProcessValueStatus,
} from "./model";
import type { DeviceSpec, ProcessValueSpec } from "./deviceSpecs";

function noise(a: number) {
  return (Math.random() - 0.5) * a;
}
function round(v: number, dp: number) {
  const f = 10 ** dp;
  return Math.round(v * f) / f;
}

export interface DeviceControlResult {
  ok: boolean;
  error?: string;
  events: MachineEvent[];
}

export class SimDeviceEngine {
  private inService = true;
  private mode: OperatingMode = "AUTO";
  private faulted = true;
  private alarmCleared = false;
  private emergencyStop = false;
  private alarmTriggeredAt = Date.now() - 6 * 60_000;
  private values: Record<string, number> = {};
  private histories: Record<string, number[]> = {};
  private lastAlarmActive = true;
  private lastMode: OperatingMode = "AUTO";
  /** Counts down after a start command so the HMI can show a brief STARTING transient. */
  private startingTicks = 0;
  private readonly spec: DeviceSpec;

  constructor(spec: DeviceSpec) {
    this.spec = spec;
    for (const pv of spec.processValues) {
      this.values[pv.id] = this.targetFor(pv);
      // prime ~60 samples of history trending into the incident
      const start = pv.faultTarget != null ? pv.nominal : this.values[pv.id];
      this.histories[pv.id] = Array.from({ length: 60 }, (_, i) =>
        round(start + ((this.values[pv.id] - start) * i) / 59 + noise(pv.noise), pv.decimals)
      );
    }
  }

  // --------------------------------------------------------------------
  private targetFor(pv: ProcessValueSpec): number {
    if (this.emergencyStop || !this.inService) return pv.stopped;
    if (pv.kind === "boolean") return this.faulted ? (pv.booleanFaultState ? 1 : pv.nominal) : pv.nominal;
    if (pv.kind === "counter") return this.values[pv.id] ?? 0;
    return this.faulted && pv.faultTarget != null ? pv.faultTarget : pv.nominal;
  }

  tick(): MachineEvent[] {
    const events: MachineEvent[] = [];
    if (this.startingTicks > 0) this.startingTicks -= 1;
    for (const pv of this.spec.processValues) {
      if (pv.kind === "counter") {
        const advancing = this.inService && !this.emergencyStop && !this.faulted;
        this.values[pv.id] += advancing ? (pv.counterRate ?? 1) : 0;
      } else if (pv.kind === "boolean") {
        this.values[pv.id] = this.targetFor(pv);
      } else {
        const target = this.targetFor(pv);
        this.values[pv.id] += (target - this.values[pv.id]) * 0.06 + noise(pv.noise);
      }
      const h = this.histories[pv.id];
      h.push(round(this.values[pv.id], pv.decimals));
      if (h.length > 60) h.shift();
    }

    const active = this.isAlarmActive();
    if (active && !this.lastAlarmActive) {
      this.alarmTriggeredAt = Date.now();
      events.push(this.event("alarm", this.spec.alarm.severity ? this.severity() : "high", `${this.spec.alarm.label}`, `${this.driverPv().label} crossed its limit.`, this.spec.alarm.id));
    }
    if (!active && this.lastAlarmActive) {
      events.push(this.event("alarm", "info", `${this.spec.alarm.label} cleared`, `${this.driverPv().label} back within limit.`, this.spec.alarm.id));
    }
    this.lastAlarmActive = active;

    if (this.mode !== this.lastMode) {
      events.push(this.event("mode_change", "info", `Mode → ${this.mode}`, `Operating mode changed from ${this.lastMode}.`));
      this.lastMode = this.mode;
    }
    return events;
  }

  // --------------------------------------------------------------------
  // control
  // --------------------------------------------------------------------
  start(source: "operator" | "copilot"): DeviceControlResult {
    if (this.emergencyStop) return { ok: false, error: "Emergency stop active — clear before starting.", events: [] };
    if (this.inService) return { ok: false, error: `${this.spec.kind} already running.`, events: [] };
    this.inService = true;
    this.startingTicks = 3;
    return { ok: true, events: [this.actionEvent(source, `${this.spec.kind} START commanded`, "Start sequence initiated.")] };
  }
  stop(source: "operator" | "copilot"): DeviceControlResult {
    if (!this.inService) return { ok: false, error: `${this.spec.kind} already stopped.`, events: [] };
    this.inService = false;
    this.startingTicks = 0;
    return { ok: true, events: [this.actionEvent(source, `${this.spec.kind} STOP commanded`, "Stop sequence initiated.")] };
  }

  /** Demo-scenario director — (re)arms the seeded incident for a presenter. Not a machine control. */
  armIncident(): DeviceControlResult {
    if (!this.inService) this.inService = true;
    this.faulted = true;
    this.alarmCleared = false;
    return { ok: true, events: [this.event("alarm", "info", "Demo incident armed", `${this.driverPv().label} beginning to move toward the ${this.spec.alarm.label} condition.`)] };
  }
  setMode(mode: "AUTO" | "MANUAL", source: "operator" | "copilot"): DeviceControlResult {
    if (this.emergencyStop) return { ok: false, error: "Emergency stop active.", events: [] };
    if (this.mode === mode) return { ok: true, events: [] };
    this.mode = mode;
    return { ok: true, events: [this.actionEvent(source, `Mode set to ${mode}`, `Operating mode changed to ${mode}.`)] };
  }
  acknowledgeAlarm(source: "operator" | "copilot"): DeviceControlResult {
    return { ok: true, events: [this.actionEvent(source, `${this.spec.alarm.label} acknowledged`, "Operator acknowledged the active alarm.")] };
  }
  /** Sim affordance — resolves the seeded incident so the scenario can be replayed. */
  resolve(source: "operator" | "copilot"): DeviceControlResult {
    if (!this.faulted) return { ok: true, events: [] };
    this.faulted = false;
    this.alarmCleared = false;
    return { ok: true, events: [this.actionEvent(source, `${this.spec.rootCause.cause} corrected`, "Fault condition cleared; telemetry recovering.")] };
  }
  valve(valveId: string, open: boolean, source: "operator" | "copilot"): DeviceControlResult {
    // Opening the outlet / closing the inlet corrects the seeded imbalance.
    this.faulted = false;
    this.alarmCleared = false;
    return { ok: true, events: [this.actionEvent(source, `${valveId} ${open ? "opened" : "closed"}`, `Valve ${valveId} commanded ${open ? "open" : "closed"}.`)] };
  }
  triggerEmergencyStop(source: "operator" | "copilot"): DeviceControlResult {
    this.emergencyStop = true;
    this.inService = false;
    this.mode = "SAFE_MODE";
    return { ok: true, events: [this.actionEvent(source, "EMERGENCY STOP", "Machine latched in Safe Mode by operator.")] };
  }

  // --------------------------------------------------------------------
  private driverPv(): ProcessValueSpec {
    return this.spec.processValues.find((p) => p.id === this.spec.alarm.driverPvId)!;
  }
  private isAlarmActive(): boolean {
    if (this.alarmCleared || this.emergencyStop) return false;
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
    if (!this.inService && pv.id !== "level") return v <= pv.stopped + 0.01 ? "low" : "normal";
    if (pv.id === this.spec.alarm.driverPvId && this.isAlarmActive()) {
      const sev = this.severity();
      return sev === "critical" ? "critical" : "high";
    }
    if (pv.limitHigh != null && v >= pv.limitHigh) return "high";
    if (pv.limitLow != null && v <= pv.limitLow) return "low";
    if (v > pv.normalHigh) return "high";
    if (v < pv.normalLow) return "low";
    return "normal";
  }

  private event(kind: MachineEvent["kind"], severity: MachineEvent["severity"], title: string, detail: string, alarmId?: string): MachineEvent {
    return { id: `evt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, kind, severity, title, detail, at: Date.now(), alarmId };
  }
  private actionEvent(source: "operator" | "copilot", title: string, detail: string): MachineEvent {
    return {
      id: `evt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      kind: source === "copilot" ? "copilot_action" : "operator_action",
      severity: "info",
      title,
      detail: source === "copilot" ? `${detail} (copilot-proposed, operator-authorized)` : detail,
      at: Date.now(),
    };
  }

  // --------------------------------------------------------------------
  primaryHistory(): number[] {
    return [...(this.histories[this.spec.alarm.driverPvId] ?? [])];
  }
  driverPvId(): string {
    return this.spec.alarm.driverPvId;
  }
  driverUnit(): string {
    return this.driverPv().unit;
  }
  isRunning(): boolean {
    return this.inService && !this.emergencyStop;
  }
  machineState(): "STARTING" | "RUNNING" | "STOPPED" | "SAFE_MODE" {
    if (this.emergencyStop) return "SAFE_MODE";
    if (!this.inService) return "STOPPED";
    return this.startingTicks > 0 ? "STARTING" : "RUNNING";
  }
  alarmActive(): boolean {
    return this.isAlarmActive();
  }
  alarmLimit(): number {
    const d = this.driverPv();
    return (this.spec.alarm.direction === "high" ? d.limitHigh : d.limitLow) ?? 0;
  }

  // --------------------------------------------------------------------
  buildContext(activeScreenId: string | null): MachineContext {
    const now = Date.now();
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
      { id: `${dev}.MODE`, address: "DB10.DBB60", label: "Operating mode", datatype: "STRING", value: this.emergencyStop ? "SAFE_MODE" : this.mode, quality: "good" },
    ];

    const io: IoPoint[] = [
      { id: "DI0.0", channel: "DI 0.0", direction: "input", label: "Run feedback", state: running },
      { id: "DI0.3", channel: "DI 0.3", direction: "input", label: "Emergency stop healthy", state: !this.emergencyStop },
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
        message: `${d.label} is ${v} ${d.unit} — ${this.spec.alarm.direction === "high" ? "above" : "below"} the configured limit of ${this.alarmLimit()} ${d.unit}.`,
        triggeredAt: this.alarmTriggeredAt,
        processValueId: d.id,
        limit: this.alarmLimit(),
        unit: d.unit,
        relatedProcessValueIds: this.spec.alarm.relatedPvIds,
      });
    }

    const operatorActions = this.buildOperatorActions();

    return {
      machine: {
        id: this.spec.id,
        name: this.spec.name,
        type: `${this.spec.kind} (simulated)`,
        location: this.spec.location,
      },
      assets: this.spec.assets,
      tags,
      io,
      processValues,
      alarms,
      operatingModes: ["AUTO", "MANUAL", "STOPPED", "SAFE_MODE"],
      operatorActions,
      documents: this.spec.documents,
      runtime: {
        mode: this.emergencyStop ? "SAFE_MODE" : this.mode,
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
    const alarmActive = this.isAlarmActive();
    const emergency = this.emergencyStop;
    if (this.spec.controls === "valves") {
      return [
        { id: "OPEN_OUTLET", label: "Open outlet valve", kind: "control", critical: true, enabled: !emergency, disabledReason: emergency ? "Emergency stop active" : undefined },
        { id: "CLOSE_INLET", label: "Close inlet valve", kind: "control", critical: true, enabled: !emergency, disabledReason: emergency ? "Emergency stop active" : undefined },
        { id: "ACK", label: "Acknowledge alarm", kind: "acknowledge", critical: false, enabled: alarmActive, disabledReason: alarmActive ? undefined : "No active alarm" },
        { id: "RESOLVE", label: "Restore balance (sim)", kind: "control", critical: true, enabled: this.faulted, disabledReason: this.faulted ? undefined : "Already nominal" },
      ];
    }
    const running = this.isRunning();
    return [
      { id: "STOP", label: "Stop", kind: "control", critical: true, enabled: running, disabledReason: !running ? "Not running" : emergency ? "Emergency stop active" : undefined },
      { id: "START", label: "Start", kind: "control", critical: true, enabled: !running && !emergency, disabledReason: running ? "Already running" : emergency ? "Emergency stop active" : undefined },
      { id: "ACK", label: "Acknowledge alarm", kind: "acknowledge", critical: false, enabled: alarmActive, disabledReason: alarmActive ? undefined : "No active alarm" },
      { id: "RESOLVE", label: `Restore ${this.spec.alarm.focusLabel.toLowerCase()} (sim)`, kind: "control", critical: true, enabled: this.faulted, disabledReason: this.faulted ? undefined : "Already nominal" },
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
          { id: "detect", label: "Event detected", state: "done", at: this.alarmTriggeredAt },
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
      { label: `${this.spec.kind} state`, value: this.isRunning() ? "Running" : "Stopped", status: "info" },
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
