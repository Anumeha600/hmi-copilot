/**
 * Time-Travel HMI Replay — a lightweight "machine DVR".
 *
 * Records compact, device-agnostic state frames and discrete events, and
 * reconstructs the dynamic HMI for any instant by feeding a frame back through
 * the normal screen builders.
 */

import type { AlarmSeverity, DeviceDiagnosis, MachineContext, ProcessValue } from "./model";
import type { DeviceSpec } from "./deviceSpecs";
import { pvValueAt, SEED_LEAD_MS, type DeviceRuntimeState } from "./sessionState";

export interface ReplayAlarm {
  id: string;
  label: string;
  severity: AlarmSeverity;
  limit: number;
  unit: string;
}

export interface StateFrame {
  t: number;
  clock: string;
  deviceId: string;
  running: boolean;
  mode: string;
  /** process-value id → value at this instant */
  values: Record<string, number>;
  alarm: ReplayAlarm | null;
  activeScreenId: string | null;
  note: string | null;
}

export interface TimelineEvent {
  id: string;
  t: number;
  clock: string;
  kind: string;
  title: string;
  detail: string;
}

export interface ReplayData {
  deviceId: string;
  from: number;
  to: number;
  frames: StateFrame[];
  events: TimelineEvent[];
}

export function clockOf(t: number): string {
  return new Date(t).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

const round = (v: number, dp: number) => Math.round(v * 10 ** dp) / 10 ** dp;

/**
 * Deterministically reconstruct the DVR for a device from its runtime state.
 * Pure function of (spec, deviceState, now) — every serverless invocation
 * produces the identical timeline. `extraEvents` are operator actions the
 * client observed during the session.
 */
export function buildReplayFromState(
  spec: DeviceSpec,
  ds: DeviceRuntimeState,
  now: number,
  extraEvents: TimelineEvent[] = []
): ReplayData {
  const driver = spec.processValues.find((p) => p.id === spec.alarm.driverPvId)!;
  const limit = (spec.alarm.direction === "high" ? driver.limitHigh : driver.limitLow) ?? driver.nominal;
  const from = Math.min(ds.since, now - SEED_LEAD_MS);
  const STEP = 2000;

  const frames: StateFrame[] = [];
  let crossFrame: StateFrame | null = null;
  for (let t = from; t <= now; t += STEP) {
    const values: Record<string, number> = {};
    for (const pv of spec.processValues) values[pv.id] = round(pvValueAt(pv, ds, t), pv.decimals);
    const dv = values[driver.id];
    const alarmed = !ds.alarmCleared && (spec.alarm.direction === "high" ? dv >= limit : dv <= limit);
    const sev: AlarmSeverity = alarmed
      ? spec.alarm.direction === "high"
        ? dv >= spec.alarm.severity.critical
          ? "critical"
          : dv >= spec.alarm.severity.high
            ? "high"
            : "medium"
        : "medium"
      : "medium";
    const f: StateFrame = {
      t,
      clock: clockOf(t),
      deviceId: spec.id,
      running: t < ds.since ? true : ds.inService && !ds.emergencyStop,
      mode: ds.emergencyStop ? "SAFE_MODE" : ds.mode,
      values,
      alarm: alarmed ? { id: spec.alarm.id, label: spec.alarm.label, severity: sev, limit, unit: driver.unit } : null,
      activeScreenId: null,
      note: null,
    };
    if (alarmed && !crossFrame) crossFrame = f;
    frames.push(f);
  }

  const events: TimelineEvent[] = [
    { id: `seed-${spec.id}-start`, t: from, clock: clockOf(from), kind: "state", title: `${spec.kind} running normally`, detail: `${driver.label} nominal` },
  ];
  if (crossFrame) {
    events.push({
      id: `seed-${spec.id}-cross`,
      t: crossFrame.t,
      clock: crossFrame.clock,
      kind: "alarm",
      title: `${driver.label} crosses limit — ${spec.alarm.label}`,
      detail: `${driver.label} ${crossFrame.values[driver.id]} ${driver.unit} vs ${limit} ${driver.unit}`,
    });
    events.push({
      id: `seed-${spec.id}-cause`,
      t: Math.min(now, crossFrame.t + 20000),
      clock: clockOf(Math.min(now, crossFrame.t + 20000)),
      kind: "copilot_action",
      title: `Copilot: likely ${spec.rootCause.cause.toLowerCase()}`,
      detail: spec.recommendedAction,
    });
  }
  events.push(...extraEvents.filter((e) => e.t >= from && e.t <= now));
  events.sort((a, b) => a.t - b.t);

  return { deviceId: spec.id, from, to: now, frames, events };
}

function statusOf(spec: DeviceSpec, id: string, value: number, running: boolean): ProcessValue["status"] {
  const pv = spec.processValues.find((p) => p.id === id);
  if (!pv) return "normal";
  if (pv.kind === "boolean") return value !== pv.nominal ? "high" : "normal";
  if (!running && id !== "level") return "low";
  if (pv.limitHigh != null && value >= pv.limitHigh) return "high";
  if (pv.limitLow != null && value <= pv.limitLow) return "low";
  if (value > pv.normalHigh) return "high";
  if (value < pv.normalLow) return "low";
  return "normal";
}

/** Rebuilds a MachineContext from a recorded frame + the device spec. */
export function frameToContext(frame: StateFrame, spec: DeviceSpec): MachineContext {
  const running = frame.running;
  const processValues: ProcessValue[] = spec.processValues.map((pv) => ({
    id: pv.id,
    label: pv.label,
    value: frame.values[pv.id] ?? pv.nominal,
    unit: pv.unit,
    status: statusOf(spec, pv.id, frame.values[pv.id] ?? pv.nominal, running),
    normalLow: pv.normalLow,
    normalHigh: pv.normalHigh,
    limitHigh: pv.limitHigh,
    limitLow: pv.limitLow,
    tagId: `${spec.id}.${pv.id.toUpperCase()}.PV`,
  }));

  return {
    machine: { id: spec.id, name: spec.name, type: `${spec.kind} (simulated)`, location: spec.location },
    assets: spec.assets,
    tags: [
      { id: `${spec.id}.RUN`, address: "DB10.DBX0.0", label: "In service", datatype: "BOOL", value: running, quality: "good" },
      ...spec.processValues.map((pv) => ({
        id: `${spec.id}.${pv.id.toUpperCase()}.PV`,
        address: "DB10",
        label: pv.label,
        datatype: (pv.kind === "boolean" ? "BOOL" : pv.decimals > 0 ? "REAL" : "INT") as "BOOL" | "REAL" | "INT",
        value: frame.values[pv.id] ?? pv.nominal,
        unit: pv.unit || undefined,
        quality: "good" as const,
      })),
    ],
    io: [],
    processValues,
    alarms: frame.alarm
      ? [
          {
            id: frame.alarm.id,
            label: frame.alarm.label,
            severity: frame.alarm.severity,
            state: "active",
            message: `${spec.processValues.find((p) => p.id === spec.alarm.driverPvId)?.label} at ${frame.values[spec.alarm.driverPvId]} ${frame.alarm.unit} vs ${frame.alarm.limit} ${frame.alarm.unit} limit.`,
            triggeredAt: frame.t,
            processValueId: spec.alarm.driverPvId,
            limit: frame.alarm.limit,
            unit: frame.alarm.unit,
            relatedProcessValueIds: spec.alarm.relatedPvIds,
          },
        ]
      : [],
    operatingModes: ["AUTO", "MANUAL", "STOPPED", "SAFE_MODE"],
    operatorActions:
      spec.controls === "valves"
        ? [
            { id: "OPEN_OUTLET", label: "Open outlet valve", kind: "control", critical: true, enabled: running },
            { id: "CLOSE_INLET", label: "Close inlet valve", kind: "control", critical: true, enabled: running },
            { id: "ACK", label: "Acknowledge alarm", kind: "acknowledge", critical: false, enabled: Boolean(frame.alarm) },
          ]
        : [
            { id: "STOP", label: "Stop", kind: "control", critical: true, enabled: running },
            { id: "START", label: "Start", kind: "control", critical: true, enabled: !running },
            { id: "ACK", label: "Acknowledge alarm", kind: "acknowledge", critical: false, enabled: Boolean(frame.alarm) },
          ],
    documents: spec.documents,
    runtime: {
      mode: frame.mode as MachineContext["runtime"]["mode"],
      machineState: frame.mode === "SAFE_MODE" ? "SAFE_MODE" : running ? "RUNNING" : "STOPPED",
      shift: "Shift B · 14:00–22:00",
      operator: "Console operator",
      connectivity: "simulation",
      lastContextSyncAt: frame.t,
      activeScreenId: frame.activeScreenId,
    },
    generatedAt: frame.t,
  };
}

/** Minimal diagnosis for a reconstructed frame — enough to build the overview screen. */
export function frameDiagnosis(frame: StateFrame, spec: DeviceSpec): DeviceDiagnosis {
  const alarmed = Boolean(frame.alarm);
  return {
    deviceKind: spec.kind,
    currentEvent: alarmed
      ? { title: `${spec.alarm.label} detected`, severity: frame.alarm!.severity, alarmId: spec.alarm.id }
      : { title: "No active events", severity: "info", alarmId: null },
    activity: [],
    contextAnalysis: [],
    alarmIntel: null,
    rootCause: alarmed
      ? { cause: spec.rootCause.cause, confidence: spec.rootCause.confidence, rationale: spec.rootCause.rationale, supportingSignals: [] }
      : null,
    recommendedAction: alarmed ? { text: spec.recommendedAction, sopId: spec.documents[0]?.id ?? null } : null,
    finding: null,
    machineView: alarmed
      ? { focusAssetId: spec.alarm.focusAssetId, focusLabel: spec.alarm.focusLabel, note: `Possible ${spec.rootCause.cause.toLowerCase()}` }
      : { focusAssetId: null, focusLabel: null, note: null },
    suggestions: spec.suggestions,
  };
}
