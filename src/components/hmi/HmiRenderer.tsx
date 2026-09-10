"use client";

import type { HmiScreenDefinition, HmiWidget } from "@/lib/hmiSchema";
import type { HighlightTarget } from "@/context/HmiCopilotContext";

interface RendererProps {
  screen: HmiScreenDefinition;
  highlight: HighlightTarget | null;
  stepLabel?: string | null;
  onAction?: (actionId: string) => void;
  readOnly?: boolean;
}

const STATUS_TEXT: Record<string, string> = {
  normal: "text-ink",
  high: "text-warn",
  low: "text-warn",
  critical: "text-critical",
};

function Focused({ on, label, children }: { on: boolean; label?: string | null; children: React.ReactNode }) {
  if (!on) return <>{children}</>;
  return (
    <div className="relative rounded-[5px]" style={{ boxShadow: "inset 0 0 0 1.5px var(--accent)" }}>
      {label && (
        <span className="absolute -top-2 left-2 z-10 rounded-[3px] bg-accent px-1.5 py-px text-[8px] font-semibold uppercase tracking-wider text-white">
          {label}
        </span>
      )}
      <div className="p-1">{children}</div>
    </div>
  );
}

function Widget({ w, highlight, stepLabel, onAction, readOnly }: { w: HmiWidget } & Omit<RendererProps, "screen">) {
  const hlWidget = highlight?.widgetId === w.id;

  switch (w.kind) {
    case "statusHeader": {
      const tone =
        w.tone === "ok" ? "text-accent-deep" : w.tone === "warn" ? "text-warn" : w.tone === "critical" ? "text-critical" : "text-ink-faint";
      return (
        <Focused on={hlWidget} label={stepLabel}>
          <div className="flex items-center justify-between rounded-[5px] border border-hairline px-3 py-2.5">
            <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-faint">{w.label}</span>
            <span className={`flex items-center gap-2 text-[13px] font-semibold ${tone}`}>
              <span
                className={`h-2 w-2 rounded-full ${w.tone === "critical" ? "bg-critical" : w.tone === "warn" ? "bg-warn" : w.tone === "ok" ? "bg-accent hmi-live-dot" : "bg-ink-faint"}`}
              />
              {w.state}
            </span>
          </div>
        </Focused>
      );
    }

    case "valueGrid":
      return (
        <div className="rounded-[5px] border border-hairline">
          {w.title && <div className="border-b border-hairline-soft px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.13em] text-ink-faint">{w.title}</div>}
          <div className="flex flex-col">
            {w.values.map((v, i) => {
              const on = Boolean(v.id && highlight?.valueId === v.id);
              return (
                <div key={i} className={`flex items-center justify-between px-3 py-2 text-[12px] ${i > 0 ? "border-t border-hairline-soft" : ""}`}>
                  <span className="text-ink-soft">{v.label}</span>
                  <Focused on={on} label={stepLabel}>
                    <span className={`font-mono tabular text-[12.5px] font-medium ${STATUS_TEXT[v.status ?? "normal"] ?? "text-ink"}`}>
                      {v.value}
                      {v.unit ? ` ${v.unit}` : ""}
                    </span>
                  </Focused>
                </div>
              );
            })}
          </div>
        </div>
      );

    case "alarmBanner":
      return (
        <Focused on={hlWidget} label={stepLabel}>
          <div className="flex items-start gap-2.5 rounded-[5px] border border-warn-line bg-warn-wash px-3 py-2.5" style={{ borderLeftWidth: 3 }}>
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" className="mt-px shrink-0" aria-hidden>
              <path d="M8 2.4 14.2 13H1.8L8 2.4Z" stroke="var(--warn)" strokeWidth="1.4" strokeLinejoin="round" />
              <path d="M8 6.6v3" stroke="var(--warn)" strokeWidth="1.4" strokeLinecap="round" />
              <circle cx="8" cy="11.3" r=".9" fill="var(--warn)" />
            </svg>
            <div>
              <div className="text-[12px] font-bold uppercase tracking-wide text-warn">{w.label}</div>
              <div className="mt-px font-mono text-[10.5px] text-warn-deep">{w.detail}</div>
            </div>
          </div>
        </Focused>
      );

    case "controlPair": {
      const btn = (spec: typeof w.primary) => {
        const on = highlight?.actionId === spec.actionId;
        const disabled = readOnly || !spec.enabled;
        // AVAILABLE: light+readable+clickable (or dark navy when it is the primary action);
        // UNAVAILABLE: genuinely muted + not-allowed cursor.
        const base = disabled
          ? "bg-surface-muted text-ink-faint border-hairline cursor-not-allowed"
          : spec.tone === "stop"
            ? "bg-ink text-white border-ink hover:bg-[#22323f]"
            : "bg-surface text-ink border-ink hover:bg-surface-muted";
        return (
          <Focused on={on} label={stepLabel}>
            <button
              type="button"
              disabled={disabled}
              aria-disabled={disabled}
              title={disabled && !readOnly ? "Not available in the current machine state" : undefined}
              onClick={() => onAction?.(spec.actionId)}
              className={`flex flex-1 items-center justify-center gap-2 rounded-[5px] border px-3 py-2.5 text-[11px] font-bold uppercase tracking-[0.09em] transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-1 ${base}`}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${disabled ? "bg-ink-faint" : spec.tone === "stop" ? "bg-[#ff6b6b]" : "bg-accent"}`} />
              {spec.label}
            </button>
          </Focused>
        );
      };
      return (
        <div>
          <div className="flex gap-2">
            {btn(w.primary)}
            {btn(w.secondary)}
          </div>
          {w.note && <p className="mt-1.5 text-[10px] leading-snug text-ink-faint">{w.note}</p>}
        </div>
      );
    }

    case "guidanceNote":
      return (
        <Focused on={hlWidget} label={stepLabel}>
          <div className="rounded-[5px] border border-accent-line bg-accent-wash px-3 py-2.5" style={{ borderLeftWidth: 3 }}>
            <div className="mb-1 text-[9px] font-bold uppercase tracking-[0.13em] text-accent-deep">{w.title} · advisory only</div>
            <p className="text-[12px] leading-snug text-[#1f4b46]">{w.text}</p>
          </div>
        </Focused>
      );

    case "trend": {
      const pts = w.series.points;
      const max = Math.max(...pts, w.limit ?? -Infinity);
      const min = Math.min(...pts);
      const range = max - min || 1;
      const path = pts
        .map((p, i) => `${(i / Math.max(pts.length - 1, 1)) * 100},${28 - ((p - min) / range) * 24}`)
        .join(" ");
      const limitY = w.limit != null ? 28 - ((w.limit - min) / range) * 24 : null;
      return (
        <div className="rounded-[5px] border border-hairline p-3">
          <div className="mb-1.5 flex items-center justify-between text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-faint">
            <span>{w.title}</span>
            <span className="font-mono text-ink">{pts[pts.length - 1]?.toFixed(1)} {w.series.unit}</span>
          </div>
          <svg viewBox="0 0 100 30" preserveAspectRatio="none" className="h-12 w-full">
            {limitY != null && <line x1="0" y1={limitY} x2="100" y2={limitY} stroke="var(--warn-line)" strokeWidth="0.6" strokeDasharray="2 1.5" />}
            <polyline points={path} fill="none" stroke="var(--accent)" strokeWidth="1" />
          </svg>
        </div>
      );
    }

    case "sopExcerpt":
      return (
        <div className="rounded-[5px] border border-hairline">
          <div className="border-b border-hairline-soft px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.13em] text-ink-faint">{w.title}</div>
          <ol className="flex flex-col gap-1.5 px-3 py-2.5">
            {w.steps.map((s, i) => (
              <li key={i} className="flex gap-2 text-[11.5px] leading-snug text-ink-soft">
                <span className="font-mono text-ink-faint">{i + 1}.</span>
                <span>{s}</span>
              </li>
            ))}
          </ol>
        </div>
      );

    case "rootCausePanel":
      return (
        <Focused on={hlWidget} label={stepLabel}>
          <div className="rounded-[5px] border border-hairline p-3">
            <div className="text-[9px] font-semibold uppercase tracking-[0.13em] text-ink-faint">Likely cause</div>
            <div className="mt-0.5 flex items-center gap-2">
              <span className="text-[13px] font-semibold text-ink">{w.cause}</span>
              <span className="inline-flex items-end gap-0.5" aria-hidden>
                {[4, 7, 10].map((h, i) => (
                  <span
                    key={i}
                    className="w-[3px] rounded-[1px]"
                    style={{ height: h, background: i < (w.confidence === "high" ? 3 : w.confidence === "medium" ? 2 : 1) ? "var(--accent)" : "var(--hairline)" }}
                  />
                ))}
              </span>
              <span className="text-[11px] capitalize text-accent-deep">{w.confidence}</span>
            </div>
            <p className="mt-1.5 text-[11.5px] leading-snug text-ink-soft">{w.rationale}</p>
            {w.signals.length > 0 && (
              <ul className="mt-1.5 flex flex-col gap-0.5">
                {w.signals.map((s, i) => (
                  <li key={i} className="flex gap-1.5 text-[10.5px] text-ink-faint">
                    <span className="text-accent">›</span>
                    {s}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Focused>
      );

    case "contextList":
      return (
        <div className="rounded-[5px] border border-hairline">
          <div className="border-b border-hairline-soft px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.13em] text-ink-faint">{w.title}</div>
          <div className="flex flex-col">
            {w.rows.map((r, i) => (
              <div key={i} className={`flex items-center justify-between px-3 py-1.5 text-[11px] ${i > 0 ? "border-t border-hairline-soft" : ""}`}>
                <span className="text-ink-soft">{r.label}</span>
                <span className="font-mono tabular text-ink">{r.value}</span>
              </div>
            ))}
          </div>
        </div>
      );

    default:
      return null;
  }
}

export function HmiRenderer({ screen, highlight, stepLabel, onAction, readOnly }: RendererProps) {
  return (
    <div className="flex flex-col gap-3">
      {screen.widgets.map((w) => (
        <Widget key={w.id} w={w} highlight={highlight} stepLabel={stepLabel} onAction={onAction} readOnly={readOnly} />
      ))}
    </div>
  );
}
