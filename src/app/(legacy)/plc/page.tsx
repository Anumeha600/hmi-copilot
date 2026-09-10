"use client";

import { CircuitBoard, Info } from "lucide-react";
import { useTelemetry } from "@/hooks/useTelemetry";
import { PLCStatusPanel } from "@/components/plc/PLCStatusPanel";
import { PLCControls } from "@/components/plc/PLCControls";

export default function PLCControlPage() {
  const { plc, plcStart, plcStop, plcSetMode, plcJogFrequency } = useTelemetry();

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-500/10 ring-1 ring-cyan-500/25">
          <CircuitBoard className="h-5 w-5 text-cyan-300" />
        </div>
        <div>
          <h1 className="text-xl font-semibold text-slate-100">PLC Control</h1>
          <p className="text-sm text-slate-500 max-w-xl">
            Software PLC / Virtual PLC — a simulated industrial control layer that drives the same
            motor process the rest of this archived build monitors. Not connected to physical PLC hardware.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_360px]">
        <div className="glass-panel rounded-2xl p-5">
          <p className="mb-3 text-xs font-medium uppercase tracking-wider text-slate-400">Process Status</p>
          <PLCStatusPanel plc={plc} />
        </div>

        <div className="glass-panel rounded-2xl p-5">
          <p className="mb-3 text-xs font-medium uppercase tracking-wider text-slate-400">Controls</p>
          <PLCControls plc={plc} onStart={plcStart} onStop={plcStop} onSetMode={plcSetMode} onJogFrequency={plcJogFrequency} />
        </div>
      </div>

      <div className="glass-panel flex items-start gap-2 rounded-2xl p-4 text-xs text-slate-500">
        <Info className="h-4 w-4 shrink-0 text-slate-500" />
        <p>
          This PLC is a deterministic software simulation (<code className="text-slate-400">lib/plc.ts</code>) — a
          stand-in for a physical PLC that would otherwise be reached over an industrial protocol (Modbus/OPC-UA).
          Frequency setpoint changes drive the same motor process simulation the Digital Twin, RUL engine, and AI
          Assistant already read from — RPM, current, temperature, and vibration all respond with realistic lag,
          not instant jumps. The Auto Demo (predictive-maintenance narrative) and this PLC control screen share
          the same underlying process; only one drives it at a time.
        </p>
      </div>
    </div>
  );
}
