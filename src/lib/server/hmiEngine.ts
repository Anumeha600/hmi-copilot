/**
 * HMI Copilot engine — the server-owned singleton behind HMI Copilot.
 *
 * Holds one deterministic simulator + one DVR per demo device, ticks the active
 * device once a second, runs the context engine, records frames, and broadcasts
 * a combined payload over SSE. The HMI renders the payload and never runs
 * inference itself. SIMULATION ONLY — no device is connected to a real PLC.
 */

import { SimDeviceEngine } from "@/lib/machineContext/simDeviceEngine";
import { DEVICE_SPECS, DEVICE_OPTIONS, getDeviceSpec } from "@/lib/machineContext/deviceSpecs";
import { EventRecorder } from "./eventRecorder";
import { runContextEngine } from "./contextEngine";
import { evaluateControlAction, type ActionSource, type ControlActionId, type PolicyDecision } from "./safetyPolicy";
import { idleRouting, type TaskRouting } from "./taskRouter";
import { clockOf, type StateFrame } from "@/lib/machineContext/replay";
import type { MachineContext, ContextEngineResult, DeviceDiagnosis, DeviceOption } from "@/lib/machineContext/model";
import type { GoldenPath } from "@/lib/goldenPath";

const TICK_MS = 1000;

export interface HmiStreamPayload {
  timestamp: number;
  deviceId: string;
  devices: DeviceOption[];
  machineContext: MachineContext;
  context: ContextEngineResult;
  routing: TaskRouting;
  primaryHistory: number[];
  primaryPvId: string;
  goldenPath: GoldenPath;
  simulation: true;
}

export interface ActionRequest {
  action:
    | "device_start"
    | "device_stop"
    | "set_mode"
    | "acknowledge"
    | "resolve"
    | "valve"
    | "emergency_stop"
    | "set_screen"
    | "set_device"
    | "run_incident";
  source?: ActionSource;
  authorized?: boolean;
  mode?: "AUTO" | "MANUAL";
  screenId?: string;
  deviceId?: string;
  valveId?: "OPEN_OUTLET" | "CLOSE_INLET" | "OPEN_INLET" | "CLOSE_OUTLET";
}

export interface ActionResult {
  ok: boolean;
  error?: string;
  needsAuth?: boolean;
  policy?: PolicyDecision;
  feedback?: string;
}

type Listener = (payload: HmiStreamPayload) => void;

const ACTION_TO_ID: Record<string, ControlActionId> = {
  device_start: "START",
  device_stop: "STOP",
  acknowledge: "ACK",
  resolve: "RESOLVE",
  emergency_stop: "EMERGENCY_STOP",
};

class HmiEngine {
  private engines = new Map<string, SimDeviceEngine>();
  private recorders = new Map<string, EventRecorder>();
  private activeDeviceId = DEVICE_SPECS[0].id;
  private activeScreenId: string | null = "overview";
  private listeners = new Set<Listener>();
  private current!: HmiStreamPayload;
  private timer: ReturnType<typeof setInterval> | null = null;
  /** Wall-clock time the simulation has been advanced to. */
  private lastAdvanceAt = Date.now();

  constructor() {
    for (const spec of DEVICE_SPECS) {
      this.engines.set(spec.id, new SimDeviceEngine(spec));
      this.recorders.set(spec.id, new EventRecorder(spec));
    }
    this.current = this.build();
    this.startClock();
  }

  private engine(): SimDeviceEngine {
    return this.engines.get(this.activeDeviceId)!;
  }
  private recorder(): EventRecorder {
    return this.recorders.get(this.activeDeviceId)!;
  }

  private build(): HmiStreamPayload {
    const eng = this.engine();
    const machineContext = eng.buildContext(this.activeScreenId);
    const diagnosis: DeviceDiagnosis = eng.diagnose();
    const context = runContextEngine(machineContext, diagnosis);
    const hasAlarm = machineContext.alarms.some((a) => a.state === "active");
    return {
      timestamp: Date.now(),
      deviceId: this.activeDeviceId,
      devices: DEVICE_OPTIONS,
      machineContext,
      context,
      routing: idleRouting(hasAlarm, Boolean(process.env.GROQ_API_KEY)),
      primaryHistory: eng.primaryHistory(),
      primaryPvId: eng.driverPvId(),
      goldenPath: eng.goldenPath(),
      simulation: true,
    };
  }

  private frame(ctx: MachineContext): StateFrame {
    const t = Date.now();
    const alarm = ctx.alarms.find((a) => a.state === "active");
    const values: Record<string, number> = {};
    for (const p of ctx.processValues) values[p.id] = p.value;
    return {
      t,
      clock: clockOf(t),
      deviceId: this.activeDeviceId,
      running: Boolean(ctx.tags.find((x) => x.id.endsWith(".RUN"))?.value),
      mode: ctx.runtime.mode,
      values,
      alarm: alarm ? { id: alarm.id, label: alarm.label, severity: alarm.severity, limit: alarm.limit ?? 0, unit: alarm.unit ?? "" } : null,
      activeScreenId: this.activeScreenId,
      note: null,
    };
  }

  /**
   * Steps every device simulation forward to "now". Called both by the internal
   * timer (when the host keeps the process warm) AND on every read/action — so
   * on a serverless host, where the timer may be frozen between invocations, the
   * simulation still produces coherent current values. Idempotent-ish: multiple
   * callers within the same second do nothing extra.
   */
  private advance(): void {
    const now = Date.now();
    const steps = Math.min(180, Math.floor((now - this.lastAdvanceAt) / TICK_MS));
    if (steps < 1) return;
    for (let i = 0; i < steps; i++) {
      for (const eng of this.engines.values()) eng.tick();
    }
    this.lastAdvanceAt += steps * TICK_MS;
    this.current = this.build();
    this.recorder().record(this.frame(this.current.machineContext));
    this.broadcast();
  }

  private startClock(): void {
    if (this.timer) return;
    this.timer = setInterval(() => this.advance(), TICK_MS);
  }

  private broadcast(): void {
    for (const l of this.listeners) l(this.current);
  }

  subscribe(l: Listener): () => void {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }

  getSnapshot(): HmiStreamPayload {
    this.advance();
    return this.current;
  }

  /** Live MachineContext + diagnosis + golden path for the copilot route. */
  getContext(): MachineContext & { __diagnosis: DeviceDiagnosis; __goldenPath: GoldenPath; __primaryHistory: number[]; __deviceId: string } {
    this.advance();
    const eng = this.engine();
    return Object.assign(eng.buildContext(this.activeScreenId), {
      __diagnosis: eng.diagnose(),
      __goldenPath: eng.goldenPath(),
      __primaryHistory: eng.primaryHistory(),
      __deviceId: this.activeDeviceId,
    });
  }

  getReplay() {
    this.advance();
    return this.recorder().getReplay();
  }

  getSpecForDevice(id: string) {
    return getDeviceSpec(id);
  }

  activeDevice(): string {
    return this.activeDeviceId;
  }

  handleAction(req: ActionRequest): ActionResult {
    this.advance();
    const source: ActionSource = req.source ?? "operator";

    if (req.action === "set_device") {
      if (req.deviceId && this.engines.has(req.deviceId)) {
        this.activeDeviceId = req.deviceId;
        this.activeScreenId = "overview";
        this.current = this.build();
        this.broadcast();
        return { ok: true, feedback: `Machine context switched to ${getDeviceSpec(req.deviceId).name}` };
      }
      return { ok: false, error: "unknown device" };
    }

    if (req.action === "set_screen") {
      this.activeScreenId = req.screenId ?? this.activeScreenId;
      this.current = this.build();
      this.broadcast();
      return { ok: true };
    }

    if (req.action === "run_incident") {
      // Demo-scenario director — not a machine-control action, so it does not
      // pass the safety guardrail. It only (re)arms the simulator's seeded fault.
      const r = this.engine().armIncident();
      for (const e of r.events) this.recorder().recordAction(e.title, e.detail, "operator_action");
      this.current = this.build();
      this.broadcast();
      return { ok: true, feedback: `Demo incident armed for ${getDeviceSpec(this.activeDeviceId).name}` };
    }

    const eng = this.engine();
    const ctx = eng.buildContext(this.activeScreenId);
    const actionId: ControlActionId =
      req.action === "valve"
        ? (req.valveId ?? "OPEN_OUTLET")
        : req.action === "set_mode"
          ? req.mode === "MANUAL"
            ? "SET_MODE_MANUAL"
            : "SET_MODE_AUTO"
          : (ACTION_TO_ID[req.action] ?? "STOP");

    // ACK and operating-mode changes are administrative — they do not move the machine.
    const administrative = actionId === "ACK" || actionId === "SET_MODE_AUTO" || actionId === "SET_MODE_MANUAL";
    if (!administrative) {
      const policy = evaluateControlAction(actionId, source, ctx);
      if (!policy.allowed) return { ok: false, error: policy.reason, policy };
      if (policy.requiresOperatorAuth && !req.authorized) return { ok: false, needsAuth: true, policy };
    }

    let result;
    switch (req.action) {
      case "device_start":
        result = eng.start(source);
        break;
      case "device_stop":
        result = eng.stop(source);
        break;
      case "set_mode":
        result = eng.setMode(req.mode ?? "AUTO", source);
        break;
      case "acknowledge":
        result = eng.acknowledgeAlarm(source);
        break;
      case "resolve":
        result = eng.resolve(source);
        break;
      case "valve":
        result = eng.valve(req.valveId ?? "OPEN_OUTLET", /OPEN/.test(req.valveId ?? "OPEN_OUTLET"), source);
        break;
      case "emergency_stop":
        result = eng.triggerEmergencyStop(source);
        break;
      default:
        return { ok: false, error: "unknown action" };
    }

    if (!result.ok) return { ok: false, error: result.error };
    for (const e of result.events) {
      this.recorder().recordAction(e.title, e.detail, e.kind === "copilot_action" ? "copilot_action" : "operator_action");
    }
    this.current = this.build();
    this.broadcast();
    const dev = getDeviceSpec(this.activeDeviceId);
    const running = Boolean(this.current.machineContext.tags.find((x) => x.id.endsWith(".RUN"))?.value);
    const state = this.current.machineContext.runtime.machineState;
    const fb =
      req.action === "device_stop"
        ? `${dev.name} stopped`
        : req.action === "device_start"
          ? `${dev.name} ${state === "STARTING" ? "starting" : "started"}`
          : req.action === "acknowledge"
            ? `${dev.alarm.label} acknowledged`
            : req.action === "set_mode"
              ? `${dev.name} — ${req.mode ?? "AUTO"} mode`
              : req.action === "resolve" || req.action === "valve"
                ? `${dev.name} recovering — ${running ? "in service" : "stopped"}`
                : result.events[0]?.title ?? "Action applied";
    return { ok: true, feedback: fb };
  }
}

declare global {
  var __hmiCopilotEngine: HmiEngine | undefined;
}

export function getHmiEngine(): HmiEngine {
  if (!globalThis.__hmiCopilotEngine) {
    globalThis.__hmiCopilotEngine = new HmiEngine();
  }
  return globalThis.__hmiCopilotEngine;
}
