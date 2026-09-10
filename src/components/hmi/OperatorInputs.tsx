"use client";

import { useMemo, useState } from "react";
import { useHmiCopilot } from "@/context/HmiCopilotContext";
import { classifyManualValue, getDeviceSpec } from "@/lib/machineContext/deviceSpecs";

/**
 * OPERATOR INPUTS — the MANUAL-mode control surface.
 *
 * Editable numeric setpoints for the current machine. Applying them posts a real
 * `set_manual_values` HMI action: the client-authoritative session is updated,
 * telemetry / context / alarms / Dynamic HMI / Copilot all follow. Values that
 * fall outside the safe operating range go through the Safety & Policy Guardrail
 * exactly like a control action.
 *
 * Mounted only while MODE = MANUAL, so each field defaults to the live telemetry
 * value at the moment manual control is taken; the operator's edits then own it.
 */
export function OperatorInputs() {
  const { payload, activeDeviceId, applyManualInputs } = useHmiCopilot();
  const spec = getDeviceSpec(activeDeviceId);
  const inputs = spec.manualInputs;

  const pvById = useMemo(
    () => Object.fromEntries((payload?.machineContext.processValues ?? []).map((p) => [p.id, p])),
    [payload]
  );

  // Only the operator's edits; an unset field shows the live telemetry value.
  const [edits, setEdits] = useState<Record<string, string>>({});

  const rows = inputs.map((inp) => {
    const pv = spec.processValues.find((p) => p.id === inp.pvId)!;
    const live = pvById[inp.pvId];
    const raw = edits[inp.pvId] ?? (live ? String(live.value) : "");
    const num = Number(raw);
    const withinWidget = raw.trim() !== "" && Number.isFinite(num) && num >= inp.min && num <= inp.max;
    const cls = withinWidget ? classifyManualValue(pv, num) : "invalid";
    return { inp, pv, raw, num, withinWidget, cls };
  });

  const anyInvalid = rows.some((r) => !r.withinWidget);
  const anyUnsafe = rows.some((r) => r.cls === "unsafe");

  const apply = () => {
    if (anyInvalid) return;
    const values: Record<string, number> = {};
    for (const r of rows) values[r.inp.pvId] = r.num;
    void applyManualInputs(values);
  };

  return (
    <div className="flex flex-col gap-2 rounded-[6px] border-[1.5px] border-accent bg-accent-wash/50 px-3 py-2.5">
      <div className="flex items-center justify-between">
        <span className="text-[9.5px] font-bold uppercase tracking-[0.14em] text-accent-deep">Operator Inputs · Manual Control</span>
        <span className="rounded-[3px] border border-accent-line bg-surface px-1.5 py-px text-[8px] font-bold uppercase tracking-[0.1em] text-accent-deep">Editable</span>
      </div>

      <div className="flex flex-col gap-2">
        {rows.map(({ inp, pv, raw, withinWidget, cls }) => (
          <label key={inp.pvId} className="flex flex-col gap-0.5">
            <span className="flex items-baseline justify-between text-[10px] font-semibold text-ink-soft">
              {pv.label}
              <span className="text-[8.5px] font-normal text-ink-faint">
                {inp.min}–{inp.max}
                {pv.unit ? ` ${pv.unit}` : ""}
              </span>
            </span>
            <span className="flex items-center gap-1.5">
              <input
                type="number"
                inputMode="decimal"
                min={inp.min}
                max={inp.max}
                step={inp.step}
                value={raw}
                onChange={(e) => setEdits((f) => ({ ...f, [inp.pvId]: e.target.value }))}
                aria-label={`${pv.label} setpoint`}
                aria-invalid={!withinWidget}
                className={`w-full rounded-[4px] border px-2 py-1 font-mono text-[12.5px] tabular outline-none focus:border-accent ${
                  !withinWidget
                    ? "border-critical bg-critical-wash text-critical"
                    : cls === "unsafe"
                      ? "border-warn-line bg-warn-wash text-warn"
                      : cls === "abnormal"
                        ? "border-warn-line bg-surface text-warn-deep"
                        : "border-ink bg-surface text-ink"
                }`}
              />
              {pv.unit && <span className="shrink-0 text-[10px] text-ink-faint">{pv.unit}</span>}
            </span>
            {!withinWidget && raw.trim() !== "" && (
              <span className="text-[9px] font-semibold text-critical">
                Enter a number between {inp.min} and {inp.max}
                {pv.unit ? ` ${pv.unit}` : ""}.
              </span>
            )}
            {!withinWidget && raw.trim() === "" && <span className="text-[9px] font-semibold text-critical">Required.</span>}
            {withinWidget && cls === "unsafe" && (
              <span className="text-[9px] font-semibold text-warn">
                {pv.label} setpoint is outside the safe operating range — requires authorization.
              </span>
            )}
            {withinWidget && cls === "abnormal" && (
              <span className="text-[9px] font-semibold text-warn-deep">Outside normal operating range.</span>
            )}
          </label>
        ))}
      </div>

      <button
        type="button"
        onClick={apply}
        disabled={anyInvalid}
        className="mt-0.5 w-full rounded-[4px] border border-ink bg-ink px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-white disabled:cursor-not-allowed disabled:opacity-40"
      >
        {anyUnsafe ? "Apply Inputs — Authorize" : "Apply Inputs"}
      </button>
      <p className="text-[9px] leading-snug text-ink-faint">
        Applied values drive the simulator, machine context, alarms and Copilot until you return to AUTO.
      </p>
    </div>
  );
}
