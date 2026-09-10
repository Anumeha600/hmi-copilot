"use client";

import { CheckCircle2, XCircle } from "lucide-react";
import type { PLCTelemetry } from "@/types";

const STATUS_COLOR: Record<PLCTelemetry["status"], string> = {
  STOPPED: "text-slate-300",
  STARTING: "text-amber-300",
  RUNNING: "text-emerald-300",
  FAULT: "text-red-300",
  SAFE_MODE: "text-slate-300",
};

const STATUS_DOT: Record<PLCTelemetry["status"], string> = {
  STOPPED: "bg-slate-500",
  STARTING: "bg-amber-400 animate-pulse-glow",
  RUNNING: "bg-emerald-400 animate-pulse-glow",
  FAULT: "bg-red-500 animate-pulse-glow",
  SAFE_MODE: "bg-slate-500",
};

function Tile({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-white/5 bg-white/[0.02] p-3">
      <p className="text-[10px] font-medium uppercase tracking-wider text-slate-500">{label}</p>
      <div className="mt-1 font-mono text-lg font-semibold">{children}</div>
    </div>
  );
}

function ReadyBadge({ ok, okLabel, badLabel }: { ok: boolean; okLabel: string; badLabel: string }) {
  return (
    <span className={`flex items-center gap-1.5 ${ok ? "text-emerald-300" : "text-red-300"}`}>
      {ok ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
      {ok ? okLabel : badLabel}
    </span>
  );
}

export function PLCStatusPanel({ plc }: { plc: PLCTelemetry }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      <Tile label="PLC Status">
        <span className={`flex items-center gap-2 ${STATUS_COLOR[plc.status]}`}>
          <span className={`h-2 w-2 rounded-full ${STATUS_DOT[plc.status]}`} />
          {plc.status}
        </span>
      </Tile>
      <Tile label="Mode">
        <span className="text-cyan-300">{plc.mode}</span>
      </Tile>
      <Tile label="Motor Command">
        <span className={plc.motorCommand === "RUN" ? "text-emerald-300" : "text-slate-300"}>{plc.motorCommand}</span>
      </Tile>
      <Tile label="Fault Code">
        <span className={plc.faultCode ? "text-red-300" : "text-slate-500"}>{plc.faultCode ?? "NONE"}</span>
      </Tile>

      <Tile label="Frequency Setpoint">
        <span className="text-cyan-300">{plc.frequencySetpoint.toFixed(1)} Hz</span>
      </Tile>
      <Tile label="Actual Frequency">
        <span className="text-cyan-300">{plc.actualFrequency.toFixed(1)} Hz</span>
      </Tile>
      <Tile label="Permissive">
        <ReadyBadge ok={plc.permissive} okLabel="READY" badLabel="BLOCKED" />
      </Tile>
      <Tile label="Emergency Stop">
        <ReadyBadge ok={!plc.emergencyStop} okLabel="READY" badLabel="ACTIVE" />
      </Tile>

      <Tile label="Interlocks">
        <ReadyBadge ok={plc.interlockStatus === "OK"} okLabel="OK" badLabel="TRIPPED" />
      </Tile>
      <Tile label="Overload">
        <ReadyBadge ok={plc.overloadStatus === "NORMAL"} okLabel="NORMAL" badLabel="OVERLOAD" />
      </Tile>
      <Tile label="PLC Scan">
        <span className="text-slate-300">{plc.scanTime.toFixed(1)} ms</span>
      </Tile>
      <Tile label="Cycle Count">
        <span className="text-slate-300">{plc.cycleCount.toLocaleString()}</span>
      </Tile>
    </div>
  );
}
