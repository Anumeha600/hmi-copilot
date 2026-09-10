"use client";

import { Minus, Plus, Play, Square } from "lucide-react";
import type { PLCTelemetry } from "@/types";
import { PLC_FREQUENCY_STEP_HZ, PLC_MAX_FREQUENCY_HZ, PLC_MIN_FREQUENCY_HZ } from "@/lib/plc";

interface PLCControlsProps {
  plc: PLCTelemetry;
  onStart: () => void;
  onStop: () => void;
  onSetMode: (mode: "AUTO" | "MANUAL") => void;
  onJogFrequency: (deltaHz: number) => void;
}

export function PLCControls({ plc, onStart, onStop, onSetMode, onJogFrequency }: PLCControlsProps) {
  const disabled = plc.demoSynced;
  const canStart = !disabled && plc.permissive && plc.status !== "RUNNING" && plc.status !== "STARTING" && plc.status !== "FAULT";
  const canStop = !disabled && (plc.status === "RUNNING" || plc.status === "STARTING" || plc.status === "FAULT");
  const canJog = !disabled && !plc.emergencyStop;

  return (
    <div className="space-y-4">
      {disabled && (
        <p className="rounded-xl border border-cyan-500/20 bg-cyan-500/5 px-3 py-2 text-xs text-cyan-200">
          Synchronized with Demo — PLC controls are disabled while the Auto Demo is running. Reset the demo to
          return to manual PLC control.
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={onStart}
          disabled={!canStart}
          className="flex items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs font-semibold text-emerald-300 transition hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-emerald-500/10"
        >
          <Play className="h-3.5 w-3.5" />
          START
        </button>
        <button
          onClick={onStop}
          disabled={!canStop}
          className="flex items-center gap-1.5 rounded-lg border border-red-500/40 bg-red-500/15 px-3 py-2 text-xs font-semibold text-red-300 transition hover:bg-red-500/25 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-red-500/15"
        >
          <Square className="h-3.5 w-3.5" />
          STOP
        </button>

        <div className="mx-1 h-6 w-px bg-white/10" />

        <button
          onClick={() => onSetMode("AUTO")}
          disabled={disabled}
          className={`rounded-lg border px-3 py-2 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-40 ${
            plc.mode === "AUTO"
              ? "border-cyan-500/40 bg-cyan-500/15 text-cyan-300"
              : "border-white/10 bg-white/5 text-slate-300 hover:bg-white/10"
          }`}
        >
          AUTO
        </button>
        <button
          onClick={() => onSetMode("MANUAL")}
          disabled={disabled}
          className={`rounded-lg border px-3 py-2 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-40 ${
            plc.mode === "MANUAL"
              ? "border-cyan-500/40 bg-cyan-500/15 text-cyan-300"
              : "border-white/10 bg-white/5 text-slate-300 hover:bg-white/10"
          }`}
        >
          MANUAL
        </button>
      </div>

      <div className="flex items-center gap-3">
        <span className="text-xs font-medium uppercase tracking-wider text-slate-500">Frequency Setpoint</span>
        <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-2 py-1.5">
          <button
            onClick={() => onJogFrequency(-PLC_FREQUENCY_STEP_HZ)}
            disabled={!canJog || plc.frequencySetpoint <= PLC_MIN_FREQUENCY_HZ}
            aria-label="Decrease frequency"
            className="flex h-6 w-6 items-center justify-center rounded-md text-slate-300 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-30"
          >
            <Minus className="h-3.5 w-3.5" />
          </button>
          <span className="w-16 text-center font-mono text-sm font-semibold text-cyan-300">
            {plc.frequencySetpoint.toFixed(1)} Hz
          </span>
          <button
            onClick={() => onJogFrequency(PLC_FREQUENCY_STEP_HZ)}
            disabled={!canJog || plc.frequencySetpoint >= PLC_MAX_FREQUENCY_HZ}
            aria-label="Increase frequency"
            className="flex h-6 w-6 items-center justify-center rounded-md text-slate-300 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-30"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
