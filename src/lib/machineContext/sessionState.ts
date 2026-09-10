/**
 * Demo session state — the single source of truth for the simulation.
 *
 * Serverless functions have no shared process memory, so the client holds this
 * small object and sends it with every request. The server is a PURE function
 * of (session, now): given the same session and clock it always produces the
 * same machine state. Control actions return a NEW session; there is no
 * process-global singleton to get out of sync.
 */

import { DEVICE_SPECS, getDeviceSpec, type DeviceSpec, type ProcessValueSpec } from "./deviceSpecs";

/** First-order lag per second — matches the previous `+= (target-v)*0.06` tick model. */
const DECAY = 0.94;
export const STARTING_MS = 3000;
/** How long before "now" the seeded incident began developing. */
export const SEED_LEAD_MS = 90_000;

export interface DeviceRuntimeState {
  inService: boolean;
  faulted: boolean;
  alarmCleared: boolean;
  emergencyStop: boolean;
  mode: "AUTO" | "MANUAL";
  acknowledged: boolean;
  /** epoch ms — when the flags above last changed (telemetry eases from `valuesAt` from here) */
  since: number;
  /** process-value values captured at `since` */
  valuesAt: Record<string, number>;
  /** epoch ms — STARTING transient ends */
  startingUntil: number;
}

export interface SessionState {
  v: 1;
  createdAt: number;
  activeDeviceId: string;
  activeScreenId: string;
  devices: Record<string, DeviceRuntimeState>;
}

// ---------------------------------------------------------------------------
// pure telemetry model
// ---------------------------------------------------------------------------

export function targetFor(pv: ProcessValueSpec, ds: DeviceRuntimeState): number {
  if (ds.emergencyStop || !ds.inService) return pv.stopped;
  if (pv.kind === "boolean") return ds.faulted ? (pv.booleanFaultState ? 1 : pv.nominal) : pv.nominal;
  if (pv.kind === "counter") return pv.nominal;
  return ds.faulted && pv.faultTarget != null ? pv.faultTarget : pv.nominal;
}

function ease(v0: number, target: number, dtMs: number): number {
  return target + (v0 - target) * Math.pow(DECAY, Math.max(0, dtMs) / 1000);
}

/** Value of one process value at absolute time `t`. */
export function pvValueAt(pv: ProcessValueSpec, ds: DeviceRuntimeState, t: number): number {
  if (t < ds.since) return ds.valuesAt[pv.id] ?? pv.nominal;
  const dt = t - ds.since;
  const v0 = ds.valuesAt[pv.id] ?? pv.nominal;
  if (pv.kind === "counter") {
    const advancing = ds.inService && !ds.emergencyStop && !ds.faulted;
    return v0 + (advancing ? (pv.counterRate ?? 1) * (dt / 1000) : 0);
  }
  if (pv.kind === "boolean") return targetFor(pv, ds);
  return ease(v0, targetFor(pv, ds), dt);
}

/** All current process-value values for a device. */
export function computeValues(spec: DeviceSpec, ds: DeviceRuntimeState, now: number): Record<string, number> {
  const out: Record<string, number> = {};
  for (const pv of spec.processValues) out[pv.id] = pvValueAt(pv, ds, now);
  return out;
}

export function machineStateOf(ds: DeviceRuntimeState, now: number): "STARTING" | "RUNNING" | "STOPPED" | "SAFE_MODE" {
  if (ds.emergencyStop) return "SAFE_MODE";
  if (!ds.inService) return "STOPPED";
  return now < ds.startingUntil ? "STARTING" : "RUNNING";
}

/** Epoch ms the driver PV first crossed its limit in the current segment (for alarm.triggeredAt). */
export function alarmCrossedAt(spec: DeviceSpec, ds: DeviceRuntimeState, now: number): number {
  const d = spec.processValues.find((p) => p.id === spec.alarm.driverPvId)!;
  const limit = (spec.alarm.direction === "high" ? d.limitHigh : d.limitLow) ?? d.nominal;
  const v0 = ds.valuesAt[d.id] ?? d.nominal;
  const target = targetFor(d, ds);
  const denom = v0 - target;
  if (denom === 0) return ds.since;
  const ratio = (limit - target) / denom;
  if (ratio <= 0 || ratio >= 1) return ds.since; // already past, or never crosses
  const dt = (Math.log(ratio) / Math.log(DECAY)) * 1000;
  return Math.min(now, Math.max(ds.since, ds.since + dt));
}

// ---------------------------------------------------------------------------
// session lifecycle
// ---------------------------------------------------------------------------

function seedDevice(spec: DeviceSpec, now: number): DeviceRuntimeState {
  return {
    inService: true,
    faulted: true,
    alarmCleared: false,
    emergencyStop: false,
    mode: "AUTO",
    acknowledged: false,
    since: now - SEED_LEAD_MS,
    valuesAt: Object.fromEntries(spec.processValues.map((pv) => [pv.id, pv.nominal])),
    startingUntil: 0,
  };
}

export function initSession(now = Date.now()): SessionState {
  return {
    v: 1,
    createdAt: now,
    activeDeviceId: DEVICE_SPECS[0].id,
    activeScreenId: "overview",
    devices: Object.fromEntries(DEVICE_SPECS.map((s) => [s.id, seedDevice(s, now)])),
  };
}

const B64 = typeof Buffer !== "undefined";
export function encodeSession(s: SessionState): string {
  const json = JSON.stringify(s);
  return B64 ? Buffer.from(json, "utf8").toString("base64url") : btoa(unescape(encodeURIComponent(json)));
}
export function decodeSession(str: string | null | undefined): SessionState | null {
  if (!str) return null;
  try {
    const json = B64 ? Buffer.from(str, "base64url").toString("utf8") : decodeURIComponent(escape(atob(str)));
    const s = JSON.parse(json) as SessionState;
    if (s?.v !== 1 || !s.devices || !getDeviceSpec(s.activeDeviceId)) return null;
    return s;
  } catch {
    return null;
  }
}

/** Decode, or start a fresh session if the string is missing/invalid. */
export function resolveSession(str: string | null | undefined, now = Date.now()): SessionState {
  return decodeSession(str) ?? initSession(now);
}

// ---------------------------------------------------------------------------
// transitions — snapshot current values, then flip flags
// ---------------------------------------------------------------------------

function snapshot(spec: DeviceSpec, ds: DeviceRuntimeState, now: number): DeviceRuntimeState {
  return { ...ds, since: now, valuesAt: computeValues(spec, ds, now) };
}

export function transition(
  spec: DeviceSpec,
  ds: DeviceRuntimeState,
  patch: Partial<DeviceRuntimeState>,
  now: number
): DeviceRuntimeState {
  return { ...snapshot(spec, ds, now), ...patch };
}
