"use client";

import { useHmiCopilot } from "@/context/HmiCopilotContext";
import { describeGuardrailChain } from "@/lib/server/safetyPolicy";

export function SafetyGuardrailDialog() {
  const { pendingAction, authorizePending, cancelPending } = useHmiCopilot();
  if (!pendingAction) return null;

  const chain = describeGuardrailChain();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(22,35,47,0.4)] px-4" onClick={cancelPending}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-[8px] border border-ink bg-surface p-4 shadow-[0_20px_50px_rgba(22,35,47,0.25)]"
      >
        <div className="flex items-center gap-2">
          <span className="grid h-6 w-6 place-items-center rounded-[4px] border border-ink">
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
              <path d="M8 1.5 13.5 4v4.5c0 3.5-2.4 5.6-5.5 6.5-3.1-.9-5.5-3-5.5-6.5V4L8 1.5Z" stroke="var(--ink)" strokeWidth="1.3" strokeLinejoin="round" />
            </svg>
          </span>
          <h3 className="text-[13px] font-bold uppercase tracking-[0.1em] text-ink">Safety &amp; Policy Guardrail</h3>
        </div>

        <p className="mt-2.5 text-[12px] leading-snug text-ink-soft">
          Authorize <span className="font-semibold uppercase text-ink">{pendingAction.label}</span>? {pendingAction.policy.reason}
        </p>

        <ol className="mt-3 flex flex-col gap-1 rounded-[5px] border border-hairline bg-surface-muted p-2.5">
          {chain.map((c, i) => (
            <li key={c} className="flex items-center gap-2 text-[10.5px]">
              <span className={`grid h-4 w-4 place-items-center rounded-full text-[8px] font-bold ${i <= 2 ? "bg-accent text-white" : "bg-hairline text-ink-faint"}`}>
                {i + 1}
              </span>
              <span className={i <= 2 ? "text-ink" : "text-ink-faint"}>{c}</span>
              {i === 2 && <span className="ml-auto text-[8px] font-semibold uppercase text-accent-deep">you are here</span>}
            </li>
          ))}
        </ol>

        {pendingAction.policy.interlocks.length > 0 && (
          <div className="mt-2.5">
            <span className="text-[9px] font-semibold uppercase tracking-[0.13em] text-ink-faint">Interlocks checked on execution</span>
            <ul className="mt-1 flex flex-col gap-0.5">
              {pendingAction.policy.interlocks.map((it) => (
                <li key={it} className="flex gap-1.5 text-[10.5px] text-ink-soft">
                  <span className="text-accent">›</span>
                  {it}
                </li>
              ))}
            </ul>
          </div>
        )}

        <p className="mt-2.5 text-[10px] leading-snug text-ink-faint">
          The copilot recommends; it never writes to the machine. This authorization is an application-layer gate in front of the simulated control API — it does not replace PLC-level safety functions.
        </p>

        <div className="mt-3.5 flex justify-end gap-2">
          <button onClick={cancelPending} className="rounded-[4px] border border-hairline bg-surface px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-ink-soft">
            Cancel
          </button>
          <button onClick={() => void authorizePending()} className="rounded-[4px] border border-ink bg-ink px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-white">
            Authorize action
          </button>
        </div>
      </div>
    </div>
  );
}
