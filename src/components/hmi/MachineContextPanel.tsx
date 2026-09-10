"use client";

import { useState } from "react";
import type { MachineContext } from "@/lib/machineContext/model";
import { MachineView } from "./MachineView";
import { OperatorInputs } from "./OperatorInputs";

interface Props {
  context: MachineContext;
  deviceKind: string;
  focusAsset: string | null;
  alarmAsset: string | null;
  focusNote: string | null;
}

const STATUS_CLASS: Record<string, string> = {
  normal: "text-ink",
  high: "text-warn",
  low: "text-warn",
  critical: "text-critical",
};

function fmt(value: number, unit: string): string {
  if (unit === "") return value === 1 ? "Active" : "Clear";
  return `${value}${unit ? " " + unit : ""}`;
}

export function MachineContextPanel({ context, deviceKind, focusAsset, alarmAsset, focusNote }: Props) {
  const [tab, setTab] = useState<"values" | "tags" | "io">("values");
  const alarm = context.alarms.find((a) => a.state === "active");
  const ms = context.runtime.machineState;
  const running = ms === "RUNNING" || ms === "STARTING";
  const stateLabel = { STARTING: "Starting…", RUNNING: "Running", STOPPED: "Stopped", SAFE_MODE: "Safe Mode" }[ms] ?? "Running";
  const driver = alarm?.processValueId ? context.processValues.find((p) => p.id === alarm.processValueId) : undefined;
  const overBy = driver && alarm?.limit != null ? Math.round((driver.value - alarm.limit) * 10) / 10 : null;
  const keyValues = context.processValues.slice(0, 5);
  const manual = context.runtime.mode === "MANUAL";

  return (
    <section className="flex flex-col gap-3.5 p-3.5">
      <div className="flex items-center justify-between">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink">Machine Context</h2>
        <span className="flex items-center gap-1.5 text-[9.5px] font-semibold uppercase tracking-[0.1em] text-accent-deep">
          <span className="h-1.5 w-1.5 rounded-full bg-accent hmi-live-dot" /> Live
        </span>
      </div>

      <div className="flex flex-col rounded-[6px] border border-hairline">
        <div className="flex items-center justify-between px-3 py-2 text-[12px]">
          <span className="text-ink-soft">{deviceKind}</span>
          <span className={`flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-wide ${ms === "SAFE_MODE" ? "text-critical" : running ? "text-accent-deep" : "text-ink-faint"}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${ms === "RUNNING" ? "bg-accent hmi-live-dot" : ms === "STARTING" ? "bg-accent" : "bg-ink-faint"}`} />
            {stateLabel}
          </span>
        </div>
        <div className="flex items-center justify-between border-t border-hairline-soft px-3 py-1 text-[8.5px] font-bold uppercase tracking-[0.12em] text-ink-faint">
          <span>Process values</span>
          <span className={manual ? "text-accent-deep" : "text-ink-faint"}>{manual ? "Operator-controlled" : "Simulator-controlled"}</span>
        </div>
        {keyValues.map((p) => (
          <div key={p.id} className="flex items-center justify-between border-t border-hairline-soft px-3 py-2 text-[12px]">
            <span className="text-ink-soft">{p.label}</span>
            <span className={`font-mono tabular text-[12.5px] font-medium ${STATUS_CLASS[p.status] ?? "text-ink"}`}>
              {fmt(p.value, p.unit)}
              {p.status !== "normal" ? " ↑" : ""}
            </span>
          </div>
        ))}
      </div>

      {manual && <OperatorInputs />}

      {alarm ? (
        <div className="flex flex-col gap-0.5 rounded-[6px] border border-warn-line bg-warn-wash px-3 py-2.5" style={{ borderLeftWidth: 3 }}>
          <div className="flex items-center justify-between">
            <span className="text-[9.5px] font-bold uppercase tracking-[0.14em] text-warn-deep">Active Alarm{alarm.acknowledged ? " · Acknowledged" : ""}</span>
            <span className="rounded-[3px] bg-warn px-1.5 text-[8.5px] font-bold uppercase tracking-wide text-white">{alarm.severity}</span>
          </div>
          <span className="text-[14px] font-bold text-warn">{alarm.label}</span>
          {driver && alarm.limit != null && (
            <span className="font-mono text-[10.5px] text-warn-deep">
              Limit: {alarm.limit} {alarm.unit}
              {overBy != null ? ` · ${overBy > 0 ? "+" : ""}${overBy} ${alarm.unit}` : ""}
            </span>
          )}
        </div>
      ) : (
        <div className="rounded-[6px] border border-hairline px-3 py-2.5 text-[11px] text-ink-faint">No active alarms.</div>
      )}

      <MachineView context={context} deviceKind={deviceKind} focusAsset={focusAsset} alarmAsset={alarmAsset} focusNote={focusNote} machineState={ms} />

      <div className="rounded-[6px] border border-hairline">
        <div className="flex border-b border-hairline-soft text-[9px] font-semibold uppercase tracking-[0.1em]">
          {(["values", "tags", "io"] as const).map((k) => (
            <button key={k} onClick={() => setTab(k)} className={`flex-1 py-1.5 transition ${tab === k ? "bg-surface-muted text-ink" : "text-ink-faint"}`}>
              {k === "io" ? "I/O" : k}
            </button>
          ))}
        </div>
        <div className="max-h-40 overflow-y-auto">
          {tab === "values" && context.processValues.map((p) => <Row key={p.id} k={p.label} v={fmt(p.value, p.unit)} tone={p.status !== "normal"} />)}
          {tab === "tags" && context.tags.map((t) => <Row key={t.id} k={t.id} v={`${t.value}${t.unit ? " " + t.unit : ""}`} mono />)}
          {tab === "io" && context.io.map((p) => <Row key={p.id} k={`${p.channel} · ${p.label}`} v={typeof p.state === "boolean" ? (p.state ? "1" : "0") : `${p.state}${p.unit ? " " + p.unit : ""}`} mono />)}
        </div>
      </div>

      <p className="text-[10.5px] leading-snug text-ink-faint">
        Context re-read every second · {context.assets.find((a) => a.id === context.machine.id)?.name ?? context.machine.name} · simulation mode, no controller connected.
      </p>
    </section>
  );
}

function Row({ k, v, tone, mono }: { k: string; v: string; tone?: boolean; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-2 border-t border-hairline-soft px-3 py-1.5 text-[10.5px] first:border-t-0">
      <span className={`truncate ${mono ? "font-mono" : ""} text-ink-soft`}>{k}</span>
      <span className={`shrink-0 font-mono tabular ${tone ? "text-warn" : "text-ink"}`}>{v}</span>
    </div>
  );
}
