/**
 * HMI Copilot engine — PURE, stateless, serverless-safe.
 *
 * There is no process-global singleton and no background timer. Every request
 * carries a `SessionState` (the small demo-state object the client holds); the
 * server computes the machine state deterministically from (session, now) and,
 * for control actions, returns a NEW session. Two concurrent serverless
 * invocations that receive the same session always agree.
 */

import { SimDeviceEngine } from "@/lib/machineContext/simDeviceEngine";
import { DEVICE_OPTIONS, getDeviceSpec } from "@/lib/machineContext/deviceSpecs";
import {
  encodeSession,
  initSession,
  resolveSession,
  type SessionState,
} from "@/lib/machineContext/sessionState";
import { buildReplayFromState, type ReplayData, type TimelineEvent } from "@/lib/machineContext/replay";
import { runContextEngine } from "./contextEngine";
import { evaluateControlAction, type ActionSource, type ControlActionId, type PolicyDecision } from "./safetyPolicy";
import { idleRouting, type TaskRouting } from "./taskRouter";
import type { MachineContext, ContextEngineResult, DeviceDiagnosis, DeviceOption } from "@/lib/machineContext/model";
import type { GoldenPath } from "@/lib/goldenPath";

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
  /** The current session, re-encoded — the client keeps its copy in sync from here. */
  session: string;
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
  session?: string;
}

export interface ActionResult {
  ok: boolean;
  error?: string;
  needsAuth?: boolean;
  policy?: PolicyDecision;
  feedback?: string;
  /** New session + the fresh payload so the client can update immediately (then SSE reconnects to confirm). */
  session?: string;
  payload?: HmiStreamPayload;
  event?: TimelineEvent;
}

const ACTION_TO_ID: Record<string, ControlActionId> = {
  device_start: "START",
  device_stop: "STOP",
  acknowledge: "ACK",
  resolve: "RESOLVE",
  emergency_stop: "EMERGENCY_STOP",
};

function engineFor(session: SessionState, deviceId: string, now: number): SimDeviceEngine {
  return new SimDeviceEngine(getDeviceSpec(deviceId), session.devices[deviceId], now);
}

// ---------------------------------------------------------------------------
// reads
// ---------------------------------------------------------------------------

export function newSessionEncoded(now = Date.now()): string {
  return encodeSession(initSession(now));
}

export function buildStreamPayload(sessionStr: string | null | undefined, now = Date.now()): HmiStreamPayload {
  const session = resolveSession(sessionStr, now);
  const eng = engineFor(session, session.activeDeviceId, now);
  const machineContext = eng.buildContext(session.activeScreenId);
  const diagnosis: DeviceDiagnosis = eng.diagnose();
  const context = runContextEngine(machineContext, diagnosis);
  const hasAlarm = machineContext.alarms.some((a) => a.state === "active");
  return {
    timestamp: now,
    deviceId: session.activeDeviceId,
    devices: DEVICE_OPTIONS,
    machineContext,
    context,
    routing: idleRouting(hasAlarm, Boolean(process.env.GROQ_API_KEY)),
    primaryHistory: eng.primaryHistory(),
    primaryPvId: eng.driverPvId(),
    goldenPath: eng.goldenPath(),
    simulation: true,
    session: encodeSession(session),
  };
}

/** Live MachineContext + diagnosis + golden path for the copilot route. */
export function buildCopilotContext(
  sessionStr: string | null | undefined,
  now = Date.now()
): MachineContext & { __diagnosis: DeviceDiagnosis; __goldenPath: GoldenPath; __primaryHistory: number[]; __deviceId: string; __session: SessionState } {
  const session = resolveSession(sessionStr, now);
  const eng = engineFor(session, session.activeDeviceId, now);
  return Object.assign(eng.buildContext(session.activeScreenId), {
    __diagnosis: eng.diagnose(),
    __goldenPath: eng.goldenPath(),
    __primaryHistory: eng.primaryHistory(),
    __deviceId: session.activeDeviceId,
    __session: session,
  });
}

export function buildReplay(sessionStr: string | null | undefined, clientEvents: TimelineEvent[] = [], now = Date.now()): ReplayData {
  const session = resolveSession(sessionStr, now);
  return buildReplayFromState(getDeviceSpec(session.activeDeviceId), session.devices[session.activeDeviceId], now, clientEvents);
}

export function specForDevice(id: string) {
  return getDeviceSpec(id);
}

// ---------------------------------------------------------------------------
// actions
// ---------------------------------------------------------------------------

export function applyHmiAction(req: ActionRequest, now = Date.now()): ActionResult {
  const session = resolveSession(req.session, now);
  const source: ActionSource = req.source ?? "operator";

  const finish = (s: SessionState, feedback?: string, event?: TimelineEvent): ActionResult => {
    const payload = buildStreamPayloadFromSession(s, now);
    return { ok: true, feedback, session: encodeSession(s), payload, event };
  };

  // ---- non-mutating navigation ----
  if (req.action === "set_device") {
    if (!req.deviceId || !session.devices[req.deviceId]) return { ok: false, error: "unknown device" };
    return finish({ ...session, activeDeviceId: req.deviceId, activeScreenId: "overview" }, `Machine context switched to ${getDeviceSpec(req.deviceId).name}`);
  }
  if (req.action === "set_screen") {
    return finish({ ...session, activeScreenId: req.screenId ?? session.activeScreenId });
  }

  const deviceId = session.activeDeviceId;
  const eng = engineFor(session, deviceId, now);

  // ---- demo-scenario director (not a machine control) ----
  if (req.action === "run_incident") {
    const r = eng.armIncident();
    const s = { ...session, devices: { ...session.devices, [deviceId]: r.state } };
    return finish(s, `Demo incident armed for ${getDeviceSpec(deviceId).name}`, toTimelineEvent(r.events[0]));
  }

  // ---- guardrail ----
  const actionId: ControlActionId =
    req.action === "valve"
      ? (req.valveId ?? "OPEN_OUTLET")
      : req.action === "set_mode"
        ? req.mode === "MANUAL"
          ? "SET_MODE_MANUAL"
          : "SET_MODE_AUTO"
        : (ACTION_TO_ID[req.action] ?? "STOP");
  const administrative = actionId === "ACK" || actionId === "SET_MODE_AUTO" || actionId === "SET_MODE_MANUAL";

  if (!administrative) {
    const policy = evaluateControlAction(actionId, source, eng.buildContext(session.activeScreenId));
    if (!policy.allowed) return { ok: false, error: policy.reason, policy };
    if (policy.requiresOperatorAuth && !req.authorized) return { ok: false, needsAuth: true, policy };
  }

  let r;
  switch (req.action) {
    case "device_start":
      r = eng.start(source);
      break;
    case "device_stop":
      r = eng.stop(source);
      break;
    case "set_mode":
      r = eng.setMode(req.mode ?? "AUTO", source);
      break;
    case "acknowledge":
      r = eng.acknowledgeAlarm(source);
      break;
    case "resolve":
      r = eng.resolve(source);
      break;
    case "valve":
      r = eng.valve(req.valveId ?? "OPEN_OUTLET", /OPEN/.test(req.valveId ?? "OPEN_OUTLET"), source);
      break;
    case "emergency_stop":
      r = eng.triggerEmergencyStop(source);
      break;
    default:
      return { ok: false, error: "unknown action" };
  }
  if (!r.ok) return { ok: false, error: r.error };

  const s: SessionState = { ...session, devices: { ...session.devices, [deviceId]: r.state } };
  const dev = getDeviceSpec(deviceId);
  const ms = new SimDeviceEngine(dev, r.state, now).machineState();
  const feedback =
    req.action === "device_stop"
      ? `${dev.name} stopped`
      : req.action === "device_start"
        ? `${dev.name} ${ms === "STARTING" ? "starting" : "started"}`
        : req.action === "acknowledge"
          ? `${dev.alarm.label} acknowledged`
          : req.action === "set_mode"
            ? `${dev.name} — ${req.mode ?? "AUTO"} mode`
            : req.action === "resolve" || req.action === "valve"
              ? `${dev.name} recovering`
              : r.events[0]?.title ?? "Action applied";
  return finish(s, feedback, toTimelineEvent(r.events[0]));
}

function buildStreamPayloadFromSession(session: SessionState, now: number): HmiStreamPayload {
  const eng = engineFor(session, session.activeDeviceId, now);
  const machineContext = eng.buildContext(session.activeScreenId);
  const diagnosis = eng.diagnose();
  const context = runContextEngine(machineContext, diagnosis);
  const hasAlarm = machineContext.alarms.some((a) => a.state === "active");
  return {
    timestamp: now,
    deviceId: session.activeDeviceId,
    devices: DEVICE_OPTIONS,
    machineContext,
    context,
    routing: idleRouting(hasAlarm, Boolean(process.env.GROQ_API_KEY)),
    primaryHistory: eng.primaryHistory(),
    primaryPvId: eng.driverPvId(),
    goldenPath: eng.goldenPath(),
    simulation: true,
    session: encodeSession(session),
  };
}

function toTimelineEvent(e: { id: string; title: string; detail: string; at: number; kind: string } | undefined): TimelineEvent | undefined {
  if (!e) return undefined;
  return {
    id: e.id,
    t: e.at,
    clock: new Date(e.at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
    kind: e.kind,
    title: e.title,
    detail: e.detail,
  };
}
