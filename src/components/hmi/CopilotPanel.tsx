"use client";

import { useEffect, useRef, useState } from "react";
import { useHmiCopilot } from "@/context/HmiCopilotContext";

function Check() {
  return (
    <span className="grid h-3.5 w-3.5 shrink-0 place-items-center rounded-full bg-accent">
      <svg width="8" height="8" viewBox="0 0 10 10" fill="none">
        <path d="M1.5 5.2 4 7.5 8.5 2.5" stroke="#fff" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}

function clock(at?: number) {
  return at ? new Date(at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "";
}

export function CopilotPanel() {
  const {
    payload,
    conversation,
    copilotBusy,
    busyLabel,
    sendIntent,
    ask,
    runControl,
    activePanel,
    toggleInvestigate,
    showOnMachine,
    openTimeTravel,
  } = useHmiCopilot();
  const [input, setInput] = useState("");
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [conversation.length]);

  if (!payload) {
    return <section className="p-3.5 text-[12px] text-ink-faint">Connecting to the machine context stream…</section>;
  }

  const { context, routing } = payload;
  const ev = context.currentEvent;
  const rc = context.rootCause;
  const rec = context.recommendedAction;
  const finding = context.finding;
  const hasAlarm = Boolean(ev?.alarmId);

  // one active-state model: only the button whose panel is open is dark navy.
  const chipBase =
    "rounded-[4px] border px-2.5 py-1.5 text-[9.5px] font-semibold uppercase tracking-[0.09em] transition disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-1";
  const ACTIVE = "border-ink bg-ink text-white";
  const INACTIVE = "border-hairline bg-surface text-ink hover:bg-surface-muted";
  const cls = (panel: string) => `${chipBase} ${activePanel === panel ? ACTIVE : INACTIVE}`;

  return (
    <section className="relative flex flex-col gap-3 p-3.5" style={{ background: "linear-gradient(180deg, var(--accent-wash) 0, transparent 130px)" }}>
      <span className="absolute inset-x-0 top-0 h-0.5 bg-accent" />

      <div className="flex items-center justify-between">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink">AI Copilot</h2>
        <span className="flex items-center gap-1.5 text-[9.5px] font-semibold uppercase tracking-[0.1em] text-accent-deep">
          <span className="h-1.5 w-1.5 rounded-full bg-accent hmi-live-dot" /> Copilot Active
        </span>
      </div>

      {/* task routing */}
      <div className="flex items-start gap-2 rounded-[5px] border border-hairline bg-surface px-2.5 py-1.5">
        <span className={`mt-px rounded-[3px] px-1.5 py-px text-[8px] font-bold uppercase tracking-[0.08em] ${routing.tier === "central" ? "bg-ink text-white" : "bg-accent-wash text-accent-deep"}`}>
          {routing.tier === "central" ? "Central AI →" : "Local Edge ✓"}
        </span>
        <div className="min-w-0">
          <div className="text-[10.5px] font-medium text-ink">{routing.task}</div>
          <div className="text-[9px] text-ink-faint">{routing.handledBy}</div>
        </div>
      </div>

      {/* proactive activity stream */}
      <div className="rounded-[6px] border border-hairline">
        <div className="flex items-center justify-between border-b border-hairline-soft px-3 py-1.5">
          <span className="text-[9.5px] font-semibold uppercase tracking-[0.13em] text-ink-faint">Copilot Activity</span>
          {context.activity[0]?.at && <span className="font-mono text-[9px] text-ink-faint">{clock(context.activity[0].at)}</span>}
        </div>
        <div className="flex flex-col gap-1 px-3 py-2">
          {context.activity.map((a) => (
            <div key={a.id} className="flex items-center gap-2 text-[11px] text-ink-soft">
              {a.state === "done" ? <Check /> : <span className="h-3 w-3 shrink-0 rounded-full border-2 border-[#cfe6e2] border-t-accent hmi-spin" />}
              {a.label}
            </div>
          ))}
        </div>
      </div>

      {/* current event */}
      {ev && (
        <div className={`flex items-center gap-2.5 rounded-[6px] border px-3 py-2.5 ${hasAlarm ? "border-warn-line bg-warn-wash" : "border-hairline"}`} style={{ borderLeftWidth: 3 }}>
          {hasAlarm && (
            <svg width="15" height="15" viewBox="0 0 16 16" fill="none" className="shrink-0" aria-hidden>
              <path d="M8 2.2 14.5 13.4H1.5L8 2.2Z" stroke="var(--warn)" strokeWidth="1.3" strokeLinejoin="round" />
              <path d="M8 6.4v3.1" stroke="var(--warn)" strokeWidth="1.4" strokeLinecap="round" />
              <circle cx="8" cy="11.4" r=".9" fill="var(--warn)" />
            </svg>
          )}
          <div className="min-w-0">
            <div className="text-[9.5px] font-bold uppercase tracking-[0.14em] text-ink-faint">Current Event</div>
            <div className={`text-[13.5px] font-bold ${hasAlarm ? "text-warn" : "text-ink"}`}>{ev.title}</div>
          </div>
          {hasAlarm && <span className="ml-auto shrink-0 rounded-[3px] bg-warn px-1.5 text-[8.5px] font-bold uppercase tracking-wide text-white">{ev.severity}</span>}
        </div>
      )}

      {/* context analysis */}
      {context.contextAnalysis.length > 0 && (
        <div className="rounded-[6px] border border-hairline">
          <div className="border-b border-hairline-soft px-3 py-1.5 text-[9.5px] font-semibold uppercase tracking-[0.13em] text-ink-faint">Context Analysis</div>
          <div className="flex flex-col">
            {context.contextAnalysis.map((r, i) => (
              <div key={i} className={`flex items-center justify-between px-3 py-1.5 text-[11.5px] ${i > 0 ? "border-t border-hairline-soft" : ""}`}>
                <span className="text-ink-soft">{r.label}</span>
                <span className={`font-mono tabular ${r.status === "high" ? "text-warn" : r.status === "normal" ? "text-accent-deep" : "text-ink"}`}>{r.value}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* likely cause + confidence */}
      {rc && (
        <div className="grid grid-cols-2 overflow-hidden rounded-[6px] border border-hairline">
          <div className="flex flex-col gap-0.5 p-2.5">
            <span className="text-[9px] font-semibold uppercase tracking-[0.12em] text-ink-faint">Likely Cause</span>
            <span className="text-[12.5px] font-semibold text-ink">{rc.cause}</span>
          </div>
          <div className="flex flex-col gap-0.5 border-l border-hairline-soft p-2.5">
            <span className="text-[9px] font-semibold uppercase tracking-[0.12em] text-ink-faint">Confidence</span>
            <span className="flex items-center gap-1.5 text-[12.5px] font-semibold capitalize text-ink">
              <span className="inline-flex items-end gap-0.5">
                {[4, 7, 10].map((h, i) => (
                  <span key={i} className="w-[3px] rounded-[1px]" style={{ height: h, background: i < (rc.confidence === "high" ? 3 : rc.confidence === "medium" ? 2 : 1) ? "var(--accent)" : "var(--hairline)" }} />
                ))}
              </span>
              {rc.confidence}
            </span>
          </div>
        </div>
      )}

      {rec && (
        <div className="flex flex-col gap-1 rounded-[6px] border border-accent-line bg-accent-wash px-3 py-2.5" style={{ borderLeftWidth: 3 }}>
          <span className="text-[9.5px] font-bold uppercase tracking-[0.14em] text-accent-deep">Recommended Action</span>
          <p className="text-[12px] text-[#1f4b46]">{rec.text}</p>
        </div>
      )}

      {/* interactive copilot actions */}
      <div className="flex flex-wrap gap-2">
        <button onClick={toggleInvestigate} className={cls("investigation")}>
          {activePanel === "investigation" ? "Hide Investigation" : "Investigate"}
        </button>
        <button onClick={() => sendIntent("show_root_cause")} disabled={!hasAlarm} className={cls("root-cause")}>
          Show Root Cause
        </button>
        <button onClick={() => sendIntent("open_sop")} disabled={!hasAlarm} className={cls("sop")}>
          View SOP
        </button>
        <button onClick={() => sendIntent("golden_path")} disabled={!hasAlarm} className={cls("golden-path")}>
          Golden Path
        </button>
        <button onClick={() => showOnMachine()} disabled={!hasAlarm} className={`${chipBase} ${INACTIVE}`}>
          Show on Machine
        </button>
        <button onClick={() => void openTimeTravel()} className={cls("replay")}>
          Replay Event
        </button>
        <button onClick={() => runControl("acknowledge")} disabled={!hasAlarm} className={`${chipBase} ${INACTIVE}`}>
          Acknowledge
        </button>
      </div>

      {/* investigation expansion */}
      {activePanel === "investigation" && (
        <div className="flex flex-col gap-2 rounded-[6px] border border-ink p-2.5">
          <span className="text-[10px] font-bold uppercase tracking-[0.13em] text-ink">Investigation</span>
          <Field k="Event" v={ev?.title ?? "—"} />
          {context.alarmIntel && <Field k="Assessment" v={context.alarmIntel.explanation} />}
          <div className="flex flex-col gap-0.5">
            <span className="text-[9px] font-semibold uppercase tracking-[0.13em] text-ink-faint">Relevant telemetry</span>
            {context.alarmIntel?.relatedProcessValues.map((r) => (
              <div key={r.label} className="flex justify-between text-[10.5px]">
                <span className="text-ink-soft">{r.label}</span>
                <span className={`font-mono tabular ${r.status === "normal" ? "text-accent-deep" : "text-warn"}`}>{r.value}</span>
              </div>
            ))}
          </div>
          {rc && (
            <div className="flex flex-col gap-0.5">
              <span className="text-[9px] font-semibold uppercase tracking-[0.13em] text-ink-faint">Correlated signals / evidence</span>
              {rc.supportingSignals.map((s, i) => (
                <div key={i} className="flex gap-1.5 text-[10.5px] text-ink-soft">
                  <span className="text-accent">›</span>
                  {s}
                </div>
              ))}
            </div>
          )}
          {rc && <Field k="Likely cause" v={`${rc.cause} — ${rc.confidence} confidence`} />}
          {rec && <Field k="Recommended next step" v={rec.text} />}
        </div>
      )}

      {/* copilot output */}
      {finding && (
        <div className="flex flex-col gap-2 rounded-[6px] border border-ink p-2.5">
          <div className="flex items-center justify-between border-b border-hairline-soft pb-1.5">
            <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.13em] text-ink">
              <span className="h-1.5 w-1.5 rounded-[2px] bg-accent" /> Copilot Output
            </span>
            <span className="text-[8.5px] font-semibold uppercase tracking-[0.1em] text-accent-deep">Analysis complete</span>
          </div>
          <p className="text-[11.5px] leading-snug text-ink-soft">{finding.summary}</p>
          <div className="flex flex-col gap-1">
            <span className="text-[9px] font-semibold uppercase tracking-[0.13em] text-ink-faint">What I Found</span>
            <ul className="flex flex-col gap-0.5">
              {finding.whatIFound.map((s, i) => (
                <li key={i} className={`relative pl-3 text-[11px] ${i === 0 ? "text-warn" : "text-ink-soft"}`}>
                  <span className="absolute left-0.5 top-[7px] h-1 w-1 rounded-full" style={{ background: i === 0 ? "var(--warn)" : "var(--ink-faint)" }} />
                  {s}
                </li>
              ))}
            </ul>
          </div>
          <Field k="Next Action" v={finding.nextAction} strong />
        </div>
      )}

      {/* suggested questions — device-specific */}
      <div className="flex flex-col gap-1.5">
        <span className="text-[9px] font-semibold uppercase tracking-[0.13em] text-ink-faint">Suggested questions</span>
        <div className="flex flex-wrap gap-1.5">
          {context.suggestions.map((s) => (
            <button key={s} onClick={() => void ask(s)} className="rounded-full border border-hairline bg-surface px-2.5 py-1 text-[10px] text-ink-soft hover:border-accent hover:text-accent-deep">
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* conversation */}
      {(conversation.length > 0 || copilotBusy) && (
        <div ref={logRef} className="flex max-h-44 flex-col gap-2 overflow-y-auto rounded-[6px] border border-hairline bg-surface-muted p-2.5">
          {conversation.slice(-6).map((turn, i) => (
            <div key={i} className={turn.role === "operator" ? "" : "rounded-[4px] bg-surface p-2"}>
              <div className={`mb-0.5 flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-[0.13em] ${turn.role === "operator" ? "text-ink-faint" : "text-accent-deep"}`}>
                {turn.role === "operator" ? "Operator" : "AI Copilot"}
                {turn.source === "groq" && <span className="rounded-[2px] bg-ink px-1 text-[7px] text-white">central</span>}
              </div>
              <p className={`text-[11.5px] leading-snug ${turn.role === "operator" ? "text-ink" : "text-ink-soft"}`}>{turn.text}</p>
            </div>
          ))}
          {copilotBusy && <p className="text-[10px] text-ink-faint">{busyLabel ?? "Working…"}</p>}
        </div>
      )}

      {/* ask */}
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void ask(input);
          setInput("");
        }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          aria-label="Ask the Copilot"
          placeholder="Ask the Copilot about this machine…"
          className="flex-1 rounded-[4px] border border-hairline bg-surface px-2.5 py-2 text-[11.5px] text-ink outline-none focus:border-accent"
        />
        <button type="submit" aria-label="Send" className="grid w-9 place-items-center rounded-[4px] border border-ink bg-ink text-white">
          <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden>
            <path d="M2 8h10.5M8.5 3.5 13 8l-4.5 4.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </form>
    </section>
  );
}

function Field({ k, v, strong }: { k: string; v: string; strong?: boolean }) {
  return (
    <div className="flex flex-col">
      <span className="text-[9px] font-semibold uppercase tracking-[0.13em] text-ink-faint">{k}</span>
      <span className={`text-[11px] leading-snug ${strong ? "font-medium text-ink" : "text-ink-soft"}`}>{v}</span>
    </div>
  );
}
