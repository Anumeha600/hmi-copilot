"use client";

import { AnimatePresence, motion } from "framer-motion";
import type { ReactNode } from "react";
import { clamp, thermalBand } from "@/lib/twinVisuals";

/** Shared gradients + filters mounted once per twin SVG root. */
export function TwinDefs({ idPrefix }: { idPrefix: string }) {
  return (
    <defs>
      <linearGradient id={`${idPrefix}-top`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#33496a" />
        <stop offset="100%" stopColor="#1c2d47" />
      </linearGradient>
      <linearGradient id={`${idPrefix}-front`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#182741" />
        <stop offset="100%" stopColor="#0c1a2c" />
      </linearGradient>
      <linearGradient id={`${idPrefix}-side`} x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stopColor="#0a1522" />
        <stop offset="100%" stopColor="#050b15" />
      </linearGradient>
      <radialGradient id={`${idPrefix}-cyl`} cx="35%" cy="30%" r="70%">
        <stop offset="0%" stopColor="#425a7c" />
        <stop offset="100%" stopColor="#101c2e" />
      </radialGradient>
      <filter id={`${idPrefix}-thermal-blur`} x="-50%" y="-50%" width="200%" height="200%">
        <feGaussianBlur stdDeviation="10" />
      </filter>
    </defs>
  );
}

interface IsoPanelProps {
  x: number;
  y: number;
  width: number;
  height: number;
  depth: number;
  idPrefix: string;
  stroke: string;
  strokeWidth: number;
  glow?: boolean;
  rx?: number;
}

/** Classic pseudo-3D box: front rect + top/side parallelograms sharing the same gradient family. */
export function IsoPanel({ x, y, width, height, depth, idPrefix, stroke, strokeWidth, glow, rx = 6 }: IsoPanelProps) {
  const skewX = depth * 0.6;
  const skewY = depth * 0.35;
  const topPoints = `${x},${y} ${x + skewX},${y - skewY} ${x + width + skewX},${y - skewY} ${x + width},${y}`;
  const sidePoints = `${x + width},${y} ${x + width + skewX},${y - skewY} ${x + width + skewX},${y - skewY + height} ${x + width},${y + height}`;
  return (
    <g>
      <polygon points={sidePoints} fill={`url(#${idPrefix}-side)`} stroke={stroke} strokeOpacity={0.5} strokeWidth={strokeWidth * 0.6} strokeLinejoin="round" />
      <polygon points={topPoints} fill={`url(#${idPrefix}-top)`} stroke={stroke} strokeOpacity={0.5} strokeWidth={strokeWidth * 0.6} strokeLinejoin="round" />
      <rect x={x} y={y} width={width} height={height} rx={rx} fill={`url(#${idPrefix}-front)`} stroke={stroke} strokeWidth={strokeWidth} />
      {glow && (
        <rect
          x={x}
          y={y}
          width={width}
          height={height}
          rx={rx}
          fill="none"
          stroke={stroke}
          strokeWidth={strokeWidth + 1}
          className="animate-pulse-glow"
          style={{ color: stroke }}
        />
      )}
    </g>
  );
}

interface IsoCylinderProps {
  x1: number;
  x2: number;
  cy: number;
  radius: number;
  idPrefix: string;
  stroke: string;
  strokeWidth: number;
  glow?: boolean;
  spin?: boolean;
  spinSeconds?: number;
  paused?: boolean;
  exploded?: boolean;
  explodeExtend?: number;
}

/** Horizontal cylinder (drive shaft): body + end-cap ellipse, with an optional spin highlight. */
export function IsoCylinder({
  x1,
  x2,
  cy,
  radius,
  idPrefix,
  stroke,
  strokeWidth,
  glow,
  spin,
  spinSeconds = 1,
  paused,
  exploded,
  explodeExtend = 0,
}: IsoCylinderProps) {
  const ex1 = exploded ? x1 - explodeExtend : x1;
  const ex2 = exploded ? x2 + explodeExtend : x2;
  const capRx = radius * 0.32;
  return (
    <g>
      <motion.rect
        y={cy - radius}
        height={radius * 2}
        rx={radius * 0.2}
        fill={`url(#${idPrefix}-cyl)`}
        stroke={stroke}
        strokeWidth={strokeWidth}
        initial={{ x: ex1, width: ex2 - ex1 }}
        animate={{ x: ex1, width: ex2 - ex1 }}
        transition={{ type: "spring", stiffness: 140, damping: 18 }}
      />
      <motion.ellipse
        cy={cy}
        rx={capRx}
        ry={radius}
        fill={`url(#${idPrefix}-cyl)`}
        stroke={stroke}
        strokeWidth={strokeWidth * 0.8}
        initial={{ cx: ex2 }}
        animate={{ cx: ex2 }}
        transition={{ type: "spring", stiffness: 140, damping: 18 }}
      />
      {spin && (
        <g
          className="twin-spin"
          style={{
            transformOrigin: `${ex2}px ${cy}px`,
            animationDuration: `${spinSeconds}s`,
            animationPlayState: paused ? "paused" : "running",
          }}
        >
          <line x1={ex2 - capRx * 0.6} y1={cy} x2={ex2 + capRx * 0.6} y2={cy} stroke="#8fb4dd" strokeWidth={2} opacity={0.7} />
          <line x1={ex2} y1={cy - radius * 0.7} x2={ex2} y2={cy + radius * 0.7} stroke="#8fb4dd" strokeWidth={1.5} opacity={0.4} />
        </g>
      )}
      {glow && (
        <motion.rect
          y={cy - radius}
          height={radius * 2}
          rx={radius * 0.2}
          fill="none"
          stroke={stroke}
          strokeWidth={strokeWidth + 1}
          className="animate-pulse-glow"
          style={{ color: stroke }}
          initial={{ x: ex1, width: ex2 - ex1 }}
          animate={{ x: ex1, width: ex2 - ex1 }}
          transition={{ type: "spring", stiffness: 140, damping: 18 }}
        />
      )}
    </g>
  );
}

interface BearingRingsProps {
  cx: number;
  cy: number;
  radius: number;
  stroke: string;
  strokeWidth: number;
  glow?: boolean;
  vibration: number;
  critical?: boolean;
  spinSeconds?: number;
  paused?: boolean;
}

/** Concentric bearing races; glow intensity tracks live vibration, forced red when critical. */
export function BearingRings({ cx, cy, radius, stroke, strokeWidth, glow, vibration, critical, spinSeconds = 3.4, paused }: BearingRingsProps) {
  const glowColor = critical ? "#ef4444" : stroke;
  const glowBlur = clamp(3 + vibration * 1.8, 3, 16);
  return (
    <g>
      <circle cx={cx} cy={cy} r={radius} fill="#0c1a2c" stroke={stroke} strokeWidth={strokeWidth} />
      <g
        className="twin-spin"
        style={{
          transformOrigin: `${cx}px ${cy}px`,
          animationDuration: `${spinSeconds}s`,
          animationPlayState: paused ? "paused" : "running",
        }}
      >
        {Array.from({ length: 8 }).map((_, i) => {
          const angle = (i / 8) * Math.PI * 2;
          return (
            <circle
              key={i}
              cx={cx + Math.cos(angle) * radius * 0.62}
              cy={cy + Math.sin(angle) * radius * 0.62}
              r={radius * 0.09}
              fill="#334155"
            />
          );
        })}
      </g>
      <circle cx={cx} cy={cy} r={radius * 0.62} fill="none" stroke="#334155" strokeWidth={2.5} />
      <circle cx={cx} cy={cy} r={radius * 0.2} fill="#334155" />
      {glow && (
        <circle
          cx={cx}
          cy={cy}
          r={radius}
          fill="none"
          stroke={glowColor}
          strokeWidth={strokeWidth + 1.5}
          className="animate-pulse-glow"
          style={{ color: glowColor, filter: `drop-shadow(0 0 ${glowBlur}px ${glowColor})` }}
        />
      )}
    </g>
  );
}

interface FanBladesProps {
  cx: number;
  cy: number;
  radius: number;
  bladeCount?: number;
  color: string;
  spinSeconds: number;
  paused?: boolean;
}

/** Multi-blade cooling fan; spin handled by a CSS animation so duration updates never jank. */
export function FanBlades({ cx, cy, radius, bladeCount = 7, color, spinSeconds, paused }: FanBladesProps) {
  const blades = Array.from({ length: bladeCount }).map((_, i) => (360 / bladeCount) * i);
  return (
    <g
      className="twin-spin"
      style={{
        transformOrigin: `${cx}px ${cy}px`,
        animationDuration: `${spinSeconds}s`,
        animationPlayState: paused ? "paused" : "running",
      }}
    >
      {blades.map((deg) => (
        <path
          key={deg}
          d={`M ${cx} ${cy} L ${cx + radius * 0.16} ${cy - radius * 0.12} Q ${cx + radius} ${cy - radius * 0.3} ${cx + radius * 0.88} ${cy} Q ${cx + radius} ${cy + radius * 0.3} ${cx + radius * 0.16} ${cy + radius * 0.12} Z`}
          fill={color}
          opacity={0.5}
          transform={`rotate(${deg} ${cx} ${cy})`}
        />
      ))}
    </g>
  );
}

export function Bolt({ cx, cy, r = 3.5 }: { cx: number; cy: number; r?: number }) {
  return (
    <g>
      <circle cx={cx} cy={cy} r={r} fill="#1e293b" stroke="#334155" strokeWidth={0.75} />
      <line x1={cx - r * 0.5} y1={cy} x2={cx + r * 0.5} y2={cy} stroke="#475569" strokeWidth={0.75} />
    </g>
  );
}

export function BoltRow({ x1, x2, y, count, r }: { x1: number; x2: number; y: number; count: number; r?: number }) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <Bolt key={i} cx={x1 + ((x2 - x1) / Math.max(count - 1, 1)) * i} cy={y} r={r} />
      ))}
    </>
  );
}

interface ExplodeGroupProps {
  exploded: boolean;
  dx: number;
  dy?: number;
  connectorFrom?: { x: number; y: number };
  connectorTo?: { x: number; y: number };
  children: ReactNode;
}

/** Translates a component assembly outward when exploded, with a dashed connector back to its mount. */
export function ExplodeGroup({ exploded, dx, dy = 0, connectorFrom, connectorTo, children }: ExplodeGroupProps) {
  return (
    <>
      <AnimatePresence>
        {exploded && connectorFrom && connectorTo && (
          <motion.line
            x1={connectorFrom.x}
            y1={connectorFrom.y}
            x2={connectorTo.x + dx}
            y2={connectorTo.y + dy}
            stroke="rgba(148,197,255,0.35)"
            strokeWidth={1.5}
            strokeDasharray="4 4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          />
        )}
      </AnimatePresence>
      <motion.g animate={{ x: exploded ? dx : 0, y: exploded ? dy : 0 }} transition={{ type: "spring", stiffness: 120, damping: 16 }}>
        {children}
      </motion.g>
    </>
  );
}

type ThermalShape =
  | { kind: "rect"; x: number; y: number; width: number; height: number; rx?: number }
  | { kind: "circle"; cx: number; cy: number; r: number };

interface ThermalOverlayProps {
  idPrefix: string;
  visible: boolean;
  temperature: number;
  shapes: ThermalShape[];
}

/** Translucent heatmap layer derived from the live temperature reading — not a decorative gradient. */
export function ThermalOverlay({ idPrefix, visible, temperature, shapes }: ThermalOverlayProps) {
  const band = thermalBand(temperature);
  return (
    <AnimatePresence>
      {visible && (
        <motion.g
          initial={{ opacity: 0 }}
          animate={{ opacity: band.opacity }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.35 }}
          style={{ mixBlendMode: "screen" }}
        >
          {shapes.map((s, i) =>
            s.kind === "rect" ? (
              <rect
                key={i}
                x={s.x}
                y={s.y}
                width={s.width}
                height={s.height}
                rx={s.rx ?? 10}
                fill={band.color}
                filter={`url(#${idPrefix}-thermal-blur)`}
              />
            ) : (
              <circle key={i} cx={s.cx} cy={s.cy} r={s.r} fill={band.color} filter={`url(#${idPrefix}-thermal-blur)`} />
            )
          )}
        </motion.g>
      )}
    </AnimatePresence>
  );
}
