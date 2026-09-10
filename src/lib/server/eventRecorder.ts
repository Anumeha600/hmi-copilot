/**
 * Machine DVR — one recorder per device. Records compact state frames
 * (in-memory ring buffer) and discrete events (persisted via SQLite).
 *
 * A short synthetic incident is seeded on construction so Time-Travel replay
 * demonstrates immediately for each device; live frames accumulate on top.
 */

import { clockOf, type ReplayData, type StateFrame, type TimelineEvent } from "@/lib/machineContext/replay";
import type { DeviceSpec } from "@/lib/machineContext/deviceSpecs";
import { insertHmiEvent, listHmiEvents } from "./db";

const RING_CAPACITY = 300;
const SEED_SECONDS = 90;
const SEED_STEP = 5;

export class EventRecorder {
  private frames: StateFrame[] = [];
  private seededEvents: TimelineEvent[] = [];
  /** Live discrete events kept in memory so Time Travel works without SQLite. */
  private liveEvents: TimelineEvent[] = [];
  private prev: StateFrame | null = null;
  private readonly spec: DeviceSpec;

  constructor(spec: DeviceSpec) {
    this.spec = spec;
    this.seedIncident();
  }

  private seedIncident(): void {
    const spec = this.spec;
    const driver = spec.processValues.find((p) => p.id === spec.alarm.driverPvId)!;
    const limit = (spec.alarm.direction === "high" ? driver.limitHigh : driver.limitLow) ?? driver.nominal;
    const base = Date.now() - SEED_SECONDS * 1000;

    for (let s = 0; s <= SEED_SECONDS; s += SEED_STEP) {
      const p = s / SEED_SECONDS; // 0..1 progression into the incident
      const t = base + s * 1000;
      const values: Record<string, number> = {};
      for (const pv of spec.processValues) {
        if (pv.kind === "counter") {
          values[pv.id] = Math.round((pv.counterRate ?? 1) * (s / 1) * 0.6);
        } else if (pv.kind === "boolean") {
          values[pv.id] = pv.booleanFaultState && p > 0.55 ? 1 : pv.nominal;
        } else {
          const target = pv.faultTarget ?? pv.nominal;
          const eased = p * p * (3 - 2 * p);
          values[pv.id] = Math.round((pv.nominal + (target - pv.nominal) * eased) * 10 ** pv.decimals) / 10 ** pv.decimals;
        }
      }
      const dv = values[driver.id];
      const alarmed = spec.alarm.direction === "high" ? dv >= limit : dv <= limit;
      const severity = alarmed ? (Math.abs(dv - limit) > Math.abs(spec.alarm.severity.high - limit) ? "high" : "medium") : "medium";

      let note: string | null = null;
      if (s === 0) note = `${spec.kind} running normally`;
      else if (p > 0.2 && p < 0.35) note = `${driver.label} begins moving`;
      else if (alarmed && !this.frames.some((f) => f.alarm)) note = `${driver.label} crosses limit — ${spec.alarm.label} triggered`;
      else if (p > 0.75) note = `Copilot: likely ${spec.rootCause.cause.toLowerCase()}`;

      const frame: StateFrame = {
        t,
        clock: clockOf(t),
        deviceId: spec.id,
        running: true,
        mode: "AUTO",
        values,
        alarm: alarmed ? { id: spec.alarm.id, label: spec.alarm.label, severity, limit, unit: driver.unit } : null,
        activeScreenId: p > 0.6 ? "alarm-investigation" : p > 0.4 ? "overview" : null,
        note,
      };
      this.frames.push(frame);
      if (note) {
        this.seededEvents.push({
          id: `seed-${spec.id}-${s}`,
          t,
          clock: clockOf(t),
          kind: note.includes(spec.alarm.label) ? "alarm" : note.startsWith("Copilot") ? "copilot_action" : "state",
          title: note,
          detail: `${driver.label} ${frame.values[driver.id]} ${driver.unit}`,
        });
      }
    }
    this.prev = this.frames[this.frames.length - 1] ?? null;
  }

  record(frame: StateFrame): void {
    this.frames.push(frame);
    if (this.frames.length > RING_CAPACITY) this.frames.shift();
    const prev = this.prev;
    this.prev = frame;
    if (!prev) return;

    const emit = (kind: string, title: string, detail: string) => {
      this.pushLive({ id: `evt-${frame.t}-${kind}`, t: frame.t, clock: clockOf(frame.t), kind, title, detail });
      try {
        insertHmiEvent({ id: `evt-${frame.t}-${kind}`, ts: frame.t, machine: frame.deviceId, kind, title, detail, stateJson: JSON.stringify(frame) });
      } catch {
        /* best-effort — in-memory copy above is the source of truth */
      }
    };
    if (prev.running !== frame.running) emit("state", frame.running ? `${this.spec.kind} started` : `${this.spec.kind} stopped`, `In service: ${frame.running}`);
    if (prev.mode !== frame.mode) emit("mode_change", `Mode → ${frame.mode}`, `Was ${prev.mode}`);
    if (!prev.alarm && frame.alarm) emit("alarm", `${frame.alarm.label} triggered`, frame.alarm.label);
    if (prev.alarm && !frame.alarm) emit("alarm", `${prev.alarm.label} cleared`, "Back within limit");
    if (prev.activeScreenId !== frame.activeScreenId && frame.activeScreenId) emit("screen", `HMI → ${frame.activeScreenId}`, `Dynamic HMI switched`);
  }

  recordAction(title: string, detail: string, kind: "operator_action" | "copilot_action"): void {
    const t = Date.now();
    const id = `act-${t}-${Math.random().toString(36).slice(2, 6)}`;
    this.pushLive({ id, t, clock: clockOf(t), kind, title, detail });
    try {
      insertHmiEvent({ id, ts: t, machine: this.spec.id, kind, title, detail, stateJson: this.prev ? JSON.stringify(this.prev) : null });
    } catch {
      /* best-effort */
    }
  }

  private pushLive(e: TimelineEvent): void {
    this.liveEvents.push(e);
    if (this.liveEvents.length > 200) this.liveEvents.shift();
  }

  getReplay(): ReplayData {
    const frames = [...this.frames].sort((a, b) => a.t - b.t);
    const from = frames[0]?.t ?? Date.now();
    const to = frames[frames.length - 1]?.t ?? Date.now();
    let persisted: TimelineEvent[] = [];
    try {
      // Only events inside this session's frame window, and not already held in memory.
      persisted = listHmiEvents(from)
        .filter((e) => e.machine === this.spec.id && e.ts <= to && !this.liveEvents.some((l) => l.id === e.id))
        .map((e) => ({ id: e.id, t: e.ts, clock: clockOf(e.ts), kind: e.kind, title: e.title, detail: e.detail }));
    } catch {
      /* ignore */
    }
    return {
      deviceId: this.spec.id,
      from,
      to,
      frames,
      events: [...this.seededEvents, ...this.liveEvents, ...persisted].sort((a, b) => a.t - b.t),
    };
  }

  frameAt(t: number): StateFrame | null {
    const frames = [...this.frames].sort((a, b) => a.t - b.t);
    if (!frames.length) return null;
    let chosen = frames[0];
    for (const f of frames) {
      if (f.t <= t) chosen = f;
      else break;
    }
    return chosen;
  }
}
