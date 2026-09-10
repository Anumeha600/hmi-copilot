"use client";

import { useEffect } from "react";
import type { MachineContext } from "@/lib/machineContext/model";
import { HmiCopilotProvider, useHmiCopilot } from "@/context/HmiCopilotContext";
import { MachineContextPanel } from "./MachineContextPanel";
import { CopilotPanel } from "./CopilotPanel";
import { DynamicHmiPanel } from "./DynamicHmiPanel";
import { SafetyGuardrailDialog } from "./SafetyGuardrailDialog";

const LOOP = ["Machine State", "AI Understands", "AI Investigates", "AI Guides", "HMI Adapts"];

function WorkspaceInner() {
  const { payload, connection, goldenPath, replayT, lastResponse, machineFocusAsset, devices, activeDeviceId, setDevice, toast, busyLabel, runControl, runIncident } = useHmiCopilot();
  const machine = payload?.machineContext.machine;
  const alarm = payload?.machineContext.alarms.find((a) => a.state === "active");
  const kind = payload?.context.deviceKind ?? "Pump";
  const runtime = payload?.machineContext.runtime;
  const opMode = runtime?.mode ?? "AUTO";
  const isDemo = (runtime?.connectivity ?? "simulation") === "simulation";
  const modeToggleable = opMode === "AUTO" || opMode === "MANUAL";

  const activeStage = replayT != null ? 0 : goldenPath ? 3 : lastResponse?.screen ? 4 : alarm ? 2 : 1;

  // Keep the browser tab in sync with the active machine (page metadata is static).
  useEffect(() => {
    if (machine?.name) document.title = `HMI Copilot — ${machine.name}`;
  }, [machine?.name]);

  return (
    <div className="mx-auto max-w-[1400px] px-4 py-5">
      <div className="hmi-panel overflow-hidden" style={{ borderColor: "var(--border-strong)", boxShadow: "var(--shadow-md)", borderRadius: 10 }}>
        {/* header */}
        <header className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-b border-ink px-5 py-3">
          <span className="flex items-center gap-2.5">
            <span className="grid h-7 w-7 place-items-center rounded-[5px] border-[1.4px] border-ink">
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                <path d="M8 1.2 14.4 5v6L8 14.8 1.6 11V5L8 1.2Z" stroke="var(--ink)" strokeWidth="1.3" strokeLinejoin="round" />
                <circle cx="8" cy="8" r="2.1" fill="var(--accent)" />
              </svg>
            </span>
            <h1 className="text-[14px] font-bold uppercase tracking-[0.12em] text-ink">HMI Copilot</h1>
          </span>

          {/* device selector */}
          <label className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.1em] text-ink-faint">
            Demo Device
            <select
              value={activeDeviceId}
              onChange={(e) => void setDevice(e.target.value)}
              className="rounded-[4px] border border-ink bg-surface px-2 py-1 text-[11px] font-medium normal-case tracking-normal text-ink outline-none focus:border-accent"
            >
              {devices.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </label>

          {/* Operating mode — functional AUTO/MANUAL toggle (administrative, no guardrail) */}
          {modeToggleable ? (
            <button
              type="button"
              onClick={() => void runControl("set_mode", { mode: opMode === "AUTO" ? "MANUAL" : "AUTO" })}
              title="Toggle operating mode"
              className="flex items-center gap-1.5 rounded-[4px] border border-ink bg-surface px-2 py-1 text-[8.5px] font-bold uppercase tracking-[0.1em] text-ink hover:bg-surface-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-1"
            >
              Mode <span className="rounded-[3px] bg-ink px-1 py-px text-white">{opMode}</span>
            </button>
          ) : (
            <span className="rounded-[4px] border border-warn-line bg-warn-wash px-1.5 py-px text-[8.5px] font-bold uppercase tracking-[0.1em] text-warn">{opMode}</span>
          )}

          <span className="ml-auto flex flex-wrap items-center gap-3">
            {/* Demo-scenario director — always available except in Safe Mode; re-arms from a clean baseline */}
            <button
              type="button"
              onClick={() => void runIncident()}
              disabled={opMode === "SAFE_MODE"}
              title={
                opMode === "SAFE_MODE"
                  ? "Clear the emergency stop before arming a demo incident"
                  : alarm
                    ? "Re-arm the seeded incident — resets it to a clean baseline and lets it develop again"
                    : "Arm the seeded incident for this machine"
              }
              className="rounded-[4px] border border-ink bg-surface px-2 py-1 text-[8.5px] font-bold uppercase tracking-[0.1em] text-ink hover:bg-surface-muted disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-1"
            >
              {alarm ? "Re-arm Incident" : "Run Incident"}
            </button>

            {/* DEMO MODE — status indicator, derived from runtime.connectivity */}
            <span className="inline-flex items-center gap-1.5 rounded-[4px] border border-hairline px-2 py-1 text-[8.5px] font-semibold uppercase tracking-[0.1em] text-ink-faint">
              Demo Mode
              <span className={`h-1.5 w-1.5 rounded-full ${isDemo ? "bg-accent" : "bg-ink-faint"}`} />
              {isDemo ? "Simulated Machine" : "—"}
            </span>

            <span
              className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.1em] ${
                connection === "connected" ? "border-accent bg-accent-wash text-accent-deep" : "border-warn-line bg-warn-wash text-warn"
              }`}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${connection === "connected" ? "bg-accent hmi-live-dot" : "bg-warn"}`} />
              {connection === "connected" ? "Copilot Active" : connection === "connecting" ? "Connecting" : "Reconnecting"}
            </span>
          </span>
        </header>

        {busyLabel === "Switching machine…" && (
          <div className="border-b border-hairline bg-accent-wash px-5 py-1.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-accent-deep">
            Switching machine — adapting context, telemetry, alarms, HMI…
          </div>
        )}

        {/* three columns */}
        <div className="grid grid-cols-1 lg:grid-cols-[280px_minmax(0,1.12fr)_minmax(0,1fr)]">
          <div className="border-hairline lg:border-r">
            <MachineContextPanel
              context={payload?.machineContext ?? PLACEHOLDER_CONTEXT}
              deviceKind={kind}
              focusAsset={machineFocusAsset}
              alarmAsset={payload?.context.machineView.focusAssetId ?? null}
              focusNote={payload?.context.machineView.note ?? null}
            />
          </div>
          <div className="border-t border-hairline lg:border-t-0 lg:border-r">
            <CopilotPanel />
          </div>
          <div className="border-t border-hairline lg:border-t-0">
            <DynamicHmiPanel />
          </div>
        </div>

        {/* footer loop */}
        <footer className="flex flex-wrap items-center gap-2 border-t border-ink bg-surface-muted px-5 py-2.5 text-[9.5px] font-semibold uppercase tracking-[0.12em] text-ink-faint">
          {LOOP.map((seg, i) => (
            <span key={seg} className="flex items-center gap-2">
              {i > 0 && <span className="text-[#b8c2c9]">→</span>}
              <span className={`flex items-center gap-1.5 ${i === activeStage ? "text-accent-deep" : ""}`}>
                <span className="h-1.5 w-1.5 rounded-[2px]" style={{ background: i === activeStage ? "var(--accent)" : "var(--hairline)" }} />
                {seg}
              </span>
            </span>
          ))}
        </footer>
      </div>

      <p className="mt-3 text-center text-[10px] tracking-wide text-ink-faint">
        Product prototype · {machine?.name ?? "demo machine"} · simulated process data, no controller connected
      </p>

      {toast && (
        <div
          className={`fixed bottom-5 left-1/2 z-40 -translate-x-1/2 rounded-[5px] border px-3.5 py-2 text-[11px] font-semibold uppercase tracking-[0.08em] shadow-[0_8px_24px_rgba(22,35,47,0.18)] ${
            toast.tone === "ok"
              ? "border-accent bg-accent-wash text-accent-deep"
              : toast.tone === "warn"
                ? "border-warn-line bg-warn-wash text-warn"
                : "border-ink bg-surface text-ink"
          }`}
          role="status"
        >
          {toast.text}
        </div>
      )}

      <SafetyGuardrailDialog />
    </div>
  );
}

const PLACEHOLDER_CONTEXT: MachineContext = {
  machine: { id: "P-101", name: "Pump Station P-101", type: "", location: "" },
  assets: [{ id: "P-101", name: "Pump Station P-101", kind: "unit", parentId: null }],
  tags: [],
  io: [],
  processValues: [],
  alarms: [],
  operatingModes: ["AUTO", "MANUAL", "STOPPED", "SAFE_MODE"],
  operatorActions: [],
  documents: [],
  runtime: { mode: "AUTO", machineState: "RUNNING", shift: "", operator: "", connectivity: "simulation", lastContextSyncAt: 0, activeScreenId: null },
  generatedAt: 0,
};

export function HmiWorkspace() {
  return (
    <HmiCopilotProvider>
      <WorkspaceInner />
    </HmiCopilotProvider>
  );
}
