"use client";

import { motion } from "framer-motion";
import type { ConnectionStatus } from "@/context/TelemetryContext";

interface LaneNode {
  title: string;
  subtitle: string;
}

interface Lane {
  key: string;
  color: string;
  from: LaneNode;
  arrowLabel: string;
  to: LaneNode;
  optional?: boolean;
}

const LANES: Lane[] = [
  {
    key: "telemetry",
    color: "#22d3ee",
    from: { title: "Telemetry Engine", subtitle: "DemoController · server tick" },
    arrowLabel: "SSE · every 1s",
    to: { title: "HMI Client", subtitle: "useTelemetry() · React" },
  },
  {
    key: "plc",
    color: "#38bdf8",
    from: { title: "Software PLC", subtitle: "lib/plc.ts · deterministic state machine" },
    arrowLabel: "frequency setpoint → motor process (VFD simulated)",
    to: { title: "Motor Process", subtitle: "RPM · current · temperature · vibration" },
  },
  {
    key: "sqlite",
    color: "#10b981",
    from: { title: "SQLite", subtitle: "maintenance_logs table" },
    arrowLabel: "writes on repair",
    to: { title: "History Page", subtitle: "GET /api/history" },
  },
  {
    key: "regression",
    color: "#f59e0b",
    from: { title: "Trend Regression", subtitle: "OLS slope · lib/rul.ts + lib/prediction.ts" },
    arrowLabel: "RUL · failure probability",
    to: { title: "Explainable Decision Support", subtitle: "AI Assistant · maintenance action" },
  },
  {
    key: "groq",
    color: "#a78bfa",
    from: { title: "Groq", subtitle: "LLM · format only" },
    arrowLabel: "rewrites JSON -> prose",
    to: { title: "Engineering Report", subtitle: "optional · on demand" },
    optional: true,
  },
];

const BOX_W = 230;
const BOX_H = 64;
const LEFT_X = 30;
const RIGHT_X = 470;
const ARROW_START = LEFT_X + BOX_W;
const ARROW_END = RIGHT_X;
const VIEW_W = 740;
const LANE_GAP = 130;
const TOP = 26;

interface ArchitectureDiagramProps {
  connectionStatus: ConnectionStatus;
  liveAlertCount: number;
}

export function ArchitectureDiagram({ connectionStatus, liveAlertCount }: ArchitectureDiagramProps) {
  const viewH = TOP + LANES.length * LANE_GAP + 10;
  const connected = connectionStatus === "connected";
  const sseColor = connected ? "#22d3ee" : connectionStatus === "disconnected" ? "#ef4444" : "#64748b";

  return (
    <svg viewBox={`0 0 ${VIEW_W} ${viewH}`} className="h-auto w-full select-none">
      {LANES.map((lane, i) => {
        const y = TOP + i * LANE_GAP;
        const midY = y + BOX_H / 2;
        const isTelemetryLane = lane.key === "telemetry";
        const strokeColor = isTelemetryLane ? sseColor : lane.color;
        const dashed = lane.optional;

        return (
          <g key={lane.key}>
            {/* From box */}
            <rect
              x={LEFT_X}
              y={y}
              width={BOX_W}
              height={BOX_H}
              rx={12}
              fill="#0c1a2c"
              stroke={lane.color}
              strokeWidth={dashed ? 1.5 : 1.75}
              strokeDasharray={dashed ? "5 4" : undefined}
              opacity={dashed ? 0.75 : 1}
            />
            <text x={LEFT_X + 16} y={midY - 4} fill="#e6edf7" fontSize="13" fontWeight={700}>
              {lane.from.title}
            </text>
            <text x={LEFT_X + 16} y={midY + 14} fill="#7f8ba3" fontSize="10.5">
              {lane.from.subtitle}
            </text>
            {isTelemetryLane && (
              <g>
                <circle cx={LEFT_X + BOX_W - 18} cy={y + 16} r="4" fill="#10b981" className="animate-pulse-glow" style={{ color: "#10b981" }} />
                <text x={LEFT_X + BOX_W - 28} y={y + 20} textAnchor="end" fill="#10b981" fontSize="9" fontWeight={700}>
                  LIVE
                </text>
              </g>
            )}

            {/* Arrow */}
            <line
              x1={ARROW_START}
              y1={midY}
              x2={ARROW_END - 10}
              y2={midY}
              stroke={strokeColor}
              strokeWidth={2}
              strokeDasharray={dashed ? "6 5" : isTelemetryLane ? "8 6" : undefined}
              markerEnd={`url(#arrowhead-${lane.key})`}
              opacity={dashed ? 0.75 : 1}
            >
              {isTelemetryLane && connected && (
                <animate attributeName="stroke-dashoffset" from="28" to="0" dur="1s" repeatCount="indefinite" />
              )}
            </line>
            <defs>
              <marker
                id={`arrowhead-${lane.key}`}
                markerWidth="8"
                markerHeight="8"
                refX="6"
                refY="4"
                orient="auto"
              >
                <path d="M0,0 L8,4 L0,8 Z" fill={strokeColor} opacity={dashed ? 0.75 : 1} />
              </marker>
            </defs>
            <text
              x={(ARROW_START + ARROW_END) / 2}
              y={midY - 10}
              textAnchor="middle"
              fill={strokeColor}
              fontSize="10"
              fontWeight={600}
            >
              {lane.arrowLabel}
            </text>

            {/* To box */}
            <rect
              x={RIGHT_X}
              y={y}
              width={BOX_W}
              height={BOX_H}
              rx={12}
              fill="#0c1a2c"
              stroke={lane.color}
              strokeWidth={dashed ? 1.5 : 1.75}
              strokeDasharray={dashed ? "5 4" : undefined}
              opacity={dashed ? 0.75 : 1}
            />
            <text x={RIGHT_X + 16} y={midY - 4} fill="#e6edf7" fontSize="13" fontWeight={700}>
              {lane.to.title}
            </text>
            <text x={RIGHT_X + 16} y={midY + 14} fill="#7f8ba3" fontSize="10.5">
              {lane.to.subtitle}
            </text>
            {isTelemetryLane && (
              <g>
                <circle cx={RIGHT_X + BOX_W - 18} cy={y + 16} r="4" fill={sseColor} />
                <text x={RIGHT_X + BOX_W - 28} y={y + 20} textAnchor="end" fill={sseColor} fontSize="9" fontWeight={700}>
                  {connectionStatus.toUpperCase()}
                </text>
              </g>
            )}
            {lane.key === "regression" && liveAlertCount > 0 && (
              <g>
                <circle cx={RIGHT_X + BOX_W - 16} cy={y + 16} r="9" fill="#f59e0b" />
                <text x={RIGHT_X + BOX_W - 16} y={y + 19} textAnchor="middle" fill="#07111f" fontSize="10" fontWeight={800}>
                  {liveAlertCount}
                </text>
              </g>
            )}
          </g>
        );
      })}
    </svg>
  );
}

export function ArchitectureDiagramCaption() {
  return (
    <motion.p
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: 0.2 }}
      className="mt-3 text-xs text-slate-500"
    >
      All five pipelines are driven by the same server-side tick — the diagram above reflects the
      live connection state and current alert count, not a static illustration. Prediction is
      computed locally from telemetry (OLS trend regression → RUL / failure probability). The
      LLM is optional and only formats engineering reports — it never computes a number.
    </motion.p>
  );
}
