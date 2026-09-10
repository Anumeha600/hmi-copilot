"use client";

import { useEffect, useRef, useState } from "react";
import type { MachineContext } from "@/lib/machineContext/model";
import { sceneFor, type MachineComponent, type Prim } from "@/lib/machineComponents";
import { useHmiCopilot } from "@/context/HmiCopilotContext";

interface Props {
  context: MachineContext;
  deviceKind: string;
  focusAsset: string | null;
  focusNote: string | null;
  machineState: "STARTING" | "RUNNING" | "STOPPED" | "SAFE_MODE";
}

const DEFAULT_VIEW = { scale: 1, tx: 0, ty: 0, rot: 0 };

function primEl(p: Prim, key: number) {
  if (p.s === "rect") return <rect key={key} x={p.x} y={p.y} width={p.w} height={p.h} rx={p.r ?? 0} />;
  if (p.s === "circle") return <circle key={key} cx={p.cx} cy={p.cy} r={p.r} />;
  if (p.s === "line") return <line key={key} x1={p.x1} y1={p.y1} x2={p.x2} y2={p.y2} />;
  return <path key={key} d={p.d} />;
}

export function MachineView({ context, deviceKind, focusAsset, focusNote, machineState }: Props) {
  const stopped = machineState === "STOPPED" || machineState === "SAFE_MODE";
  const { selectedComponent, componentAction, selectComponent, clearComponent, explainComponent } = useHmiCopilot();
  const scene = sceneFor(deviceKind);
  const [view, setView] = useState(DEFAULT_VIEW);
  const [hovered, setHovered] = useState<string | null>(null);
  const [dragging, setDragging] = useState<null | "orbit" | "pan">(null);
  const drag = useRef<{ x: number; y: number; pan: boolean } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  // Non-passive wheel listener so zoom does not scroll the page, without
  // blocking scroll elsewhere.
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const onWheelNative = (e: WheelEvent) => {
      e.preventDefault();
      setView((v) => ({ ...v, scale: Math.max(0.55, Math.min(3, v.scale * (1 - e.deltaY * 0.0012))) }));
    };
    el.addEventListener("wheel", onWheelNative, { passive: false });
    return () => el.removeEventListener("wheel", onWheelNative);
  }, []);

  const alarm = context.alarms.find((a) => a.state === "active");
  const pvVal = (id: string) => {
    const p = context.processValues.find((x) => x.id === id);
    return p ? `${p.value}${p.unit ? " " + p.unit : ""}` : "—";
  };
  const worstStatus = (c: MachineComponent) => {
    const order = { critical: 3, high: 2, low: 2, normal: 0 } as const;
    let worst: "normal" | "high" | "low" | "critical" = "normal";
    for (const id of c.pvIds) {
      const s = context.processValues.find((p) => p.id === id)?.status ?? "normal";
      if (order[s] > order[worst]) worst = s;
    }
    return worst;
  };

  const onPointerDown = (e: React.PointerEvent) => {
    try {
      (e.target as Element).setPointerCapture?.(e.pointerId);
    } catch {
      /* no active pointer (e.g. synthetic event) — capture is optional */
    }
    const pan = e.shiftKey || e.button === 1 || e.button === 2;
    drag.current = { x: e.clientX, y: e.clientY, pan };
    setDragging(pan ? "pan" : "orbit");
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    d.x = e.clientX;
    d.y = e.clientY;
    const pan = d.pan; // read before setView's updater runs (drag.current may be cleared by then)
    setView((v) =>
      pan
        ? { ...v, tx: v.tx + dx * 0.4, ty: v.ty + dy * 0.4 }
        : { ...v, rot: Math.max(-34, Math.min(34, v.rot + dx * 0.4)), ty: v.ty + dy * 0.15 }
    );
  };
  const onPointerUp = () => {
    drag.current = null;
    setDragging(null);
  };
  const btn = "grid h-6 w-6 place-items-center rounded-[3px] border border-hairline bg-surface text-[11px] font-bold text-ink-soft hover:bg-surface-muted";

  const selComp = selectedComponent ? scene.components.find((c) => c.id === selectedComponent.id) : null;

  return (
    <div className="flex flex-col gap-2 rounded-[6px] border border-ink p-2.5">
      <div className="flex items-center justify-between">
        <span className="text-[9.5px] font-bold uppercase tracking-[0.12em] text-ink">Machine View</span>
        <span className="rounded-[3px] border border-accent-line bg-accent-wash px-1.5 py-px text-[7.5px] font-semibold uppercase tracking-[0.1em] text-accent-deep">
          Interactive · 2.5D
        </span>
      </div>
      <span className="-mt-1 font-mono text-[9.5px] text-ink-faint">{context.machine.id} · {deviceKind}</span>

      <div className="relative rounded-[4px] border border-hairline bg-[#f7f9f9]">
        <svg
          ref={svgRef}
          viewBox={scene.viewBox}
          role="img"
          aria-label={`Interactive ${deviceKind} schematic${focusAsset ? `, copilot focus on ${focusNote ?? "a component"}` : ""}`}
          className="block h-auto w-full touch-none select-none"
          style={{ cursor: dragging ? "grabbing" : "grab" }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerLeave={onPointerUp}
          onContextMenu={(e) => e.preventDefault()}
        >
          <g
            opacity={stopped ? 0.5 : 1}
            style={{
              transform: `translate(${view.tx}px, ${view.ty}px) scale(${view.scale}) rotate(${view.rot * 0.45}deg) scaleY(${1 - Math.abs(view.rot) / 320})`,
              transformOrigin: "50% 55%",
              transition: dragging ? "none" : "transform .16s ease-out",
            }}
          >
            <g stroke="#c2ccd2" strokeWidth="1" fill="none">
              {scene.frame.map((p, i) => primEl(p, i))}
            </g>

            {scene.components.map((c) => {
              const isAlarm = focusAsset === c.id;
              const isSel = selectedComponent?.id === c.id;
              const isHover = hovered === c.id;
              const stroke = isAlarm ? "var(--warn)" : isSel ? "var(--accent)" : isHover ? "var(--ink)" : "#16232f";
              const sw = isAlarm || isSel ? 1.6 : 1;
              return (
                <g
                  key={c.id}
                  className={isAlarm ? "hmi-fault-pulse" : undefined}
                  style={{ cursor: "pointer" }}
                  stroke={stroke}
                  strokeWidth={sw}
                  fill={isAlarm ? "var(--warn-wash)" : isSel ? "var(--accent-wash)" : "#eef2f3"}
                  onClick={(e) => {
                    e.stopPropagation();
                    selectComponent(c.id, c.label);
                  }}
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    void explainComponent(c.id, c.label, "explain");
                  }}
                  onMouseEnter={() => setHovered(c.id)}
                  onMouseLeave={() => setHovered((h) => (h === c.id ? null : h))}
                >
                  <title>{c.label}</title>
                  {c.prims.map((p, i) => primEl(p, i))}
                  <circle cx={c.cx} cy={c.cy} r={15} fill="transparent" stroke="none" />
                </g>
              );
            })}
          </g>
        </svg>

        <div className="absolute right-1.5 top-1.5 flex gap-1">
          <button type="button" aria-label="Zoom in" className={btn} onClick={() => setView((v) => ({ ...v, scale: Math.min(3, v.scale * 1.2) }))}>+</button>
          <button type="button" aria-label="Zoom out" className={btn} onClick={() => setView((v) => ({ ...v, scale: Math.max(0.55, v.scale / 1.2) }))}>−</button>
        </div>
        <span
          className={`absolute left-1.5 top-1.5 rounded-[3px] border px-1.5 py-px text-[7.5px] font-bold uppercase tracking-[0.1em] ${
            machineState === "SAFE_MODE"
              ? "border-critical-line bg-critical-wash text-critical"
              : machineState === "STOPPED"
                ? "border-hairline bg-surface text-ink-faint"
                : "border-accent-line bg-accent-wash text-accent-deep"
          }`}
        >
          {machineState === "STARTING" ? "Starting…" : machineState === "SAFE_MODE" ? "Safe Mode" : machineState === "STOPPED" ? "Stopped" : "Running"}
        </span>
        <div className="absolute bottom-1.5 right-1.5 flex gap-1">
          <button type="button" className="rounded-[3px] border border-hairline bg-surface px-1.5 py-0.5 text-[7.5px] font-semibold uppercase tracking-wide text-ink-soft hover:bg-surface-muted" onClick={() => setView({ ...DEFAULT_VIEW, scale: 1 })}>
            Fit machine
          </button>
          <button type="button" className="rounded-[3px] border border-hairline bg-surface px-1.5 py-0.5 text-[7.5px] font-semibold uppercase tracking-wide text-ink-soft hover:bg-surface-muted" onClick={() => setView(DEFAULT_VIEW)}>
            Reset view
          </button>
        </div>
      </div>

      <p className="text-[8.5px] leading-snug text-ink-faint">Drag to orbit · shift-drag to pan · wheel to zoom · click a component</p>

      {focusAsset && !selComp && (
        <div className="rounded-[4px] bg-accent-wash px-2 py-1.5" style={{ borderLeft: "3px solid var(--accent)" }}>
          <div className="text-[8px] font-bold uppercase tracking-[0.13em] text-accent-deep">AI Focus</div>
          <div className="text-[10.5px] font-medium text-[#1f4b46]">
            {focusNote ?? "Investigating"} · {scene.components.find((c) => c.id === focusAsset)?.label ?? focusAsset}
          </div>
        </div>
      )}

      {selComp && (
        <div className="rounded-[5px] border border-hairline bg-surface p-2.5">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-[0.1em] text-ink">{selComp.label}</span>
            <button type="button" aria-label="Close component panel" className="text-[9px] font-semibold uppercase text-ink-faint hover:text-ink" onClick={clearComponent}>
              Close
            </button>
          </div>
          <div className="mt-1 flex flex-col gap-0.5 text-[10.5px]">
            <div className="flex justify-between">
              <span className="text-ink-soft">Status</span>
              <span className={`font-semibold uppercase ${worstStatus(selComp) === "normal" ? "text-accent-deep" : worstStatus(selComp) === "critical" ? "text-critical" : "text-warn"}`}>
                {worstStatus(selComp) === "normal" ? "Nominal" : focusAsset === selComp.id ? "Degraded" : worstStatus(selComp)}
              </span>
            </div>
            {selComp.pvIds.slice(0, 2).map((id) => (
              <div key={id} className="flex justify-between">
                <span className="text-ink-soft">{context.processValues.find((p) => p.id === id)?.label ?? id}</span>
                <span className="font-mono tabular text-ink">{pvVal(id)}</span>
              </div>
            ))}
            <div className="flex justify-between">
              <span className="text-ink-soft">Related alarm</span>
              <span className={focusAsset === selComp.id && alarm ? "font-semibold text-warn" : "text-ink-faint"}>
                {focusAsset === selComp.id && alarm ? alarm.label : "None"}
              </span>
            </div>
          </div>
          {focusAsset === selComp.id && focusNote && (
            <p className="mt-1.5 rounded-[3px] bg-accent-wash px-2 py-1 text-[10px] text-[#1f4b46]">Copilot: {focusNote}.</p>
          )}
          <div className="mt-2 flex gap-1.5">
            <button
              type="button"
              aria-pressed={componentAction === "explain"}
              className={`flex-1 rounded-[3px] border px-2 py-1 text-[8.5px] font-semibold uppercase tracking-wide focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-1 ${
                componentAction === "explain" ? "border-ink bg-ink text-white" : "border-ink bg-surface text-ink hover:bg-surface-muted"
              }`}
              onClick={() => void explainComponent(selComp.id, selComp.label, "explain")}
            >
              Explain this component
            </button>
            <button
              type="button"
              aria-pressed={componentAction === "why"}
              className={`flex-1 rounded-[3px] border px-2 py-1 text-[8.5px] font-semibold uppercase tracking-wide focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-1 ${
                componentAction === "why" ? "border-ink bg-ink text-white" : "border-ink bg-surface text-ink hover:bg-surface-muted"
              }`}
              onClick={() => void explainComponent(selComp.id, selComp.label, "why")}
            >
              Why highlighted?
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
