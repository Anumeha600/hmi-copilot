"use client";

import { motion } from "framer-motion";
import type { ComponentHealth, ComponentId, MachineStatus, SensorReading } from "@/types";
import { STATUS_COLOR, fanSpinSeconds } from "@/lib/twinVisuals";
import { BearingRings, Bolt, BoltRow, ExplodeGroup, FanBlades, IsoCylinder, IsoPanel, ThermalOverlay, TwinDefs } from "@/components/twin/primitives";

const ID_PREFIX = "motor-twin";

interface MachineSVGProps {
  componentHealths: Record<ComponentId, ComponentHealth>;
  selected: ComponentId | null;
  onSelect: (id: ComponentId) => void;
  reading: SensorReading;
  machineStatus: MachineStatus;
  thermalView: boolean;
  exploded: boolean;
}

export function MachineSVG({
  componentHealths,
  selected,
  onSelect,
  reading,
  machineStatus,
  thermalView,
  exploded,
}: MachineSVGProps) {
  const colorFor = (id: ComponentId) => STATUS_COLOR[componentHealths[id].status];
  const glowing = (id: ComponentId) => componentHealths[id].status !== "normal";
  const strokeFor = (id: ComponentId) => (selected === id ? 3.5 : 1.5);

  const paused = machineStatus === "safe_mode" || reading.rpm <= 0;
  const spinSeconds = fanSpinSeconds(reading.rpm);

  return (
    <svg viewBox="0 0 640 320" className="h-auto w-full select-none">
      <TwinDefs idPrefix={ID_PREFIX} />

      {/* Base plate */}
      <rect x="30" y="252" width="580" height="16" rx="5" fill="#0c1a2c" stroke="rgba(148,197,255,0.15)" />
      <BoltRow x1={60} x2={580} y={260} count={10} />

      {/* Shaft — drawn first so motor/bearing/fan layer above it */}
      <g onClick={() => onSelect("shaft")} className="cursor-pointer" tabIndex={0} role="button" aria-label="Drive Shaft">
        <IsoCylinder
          x1={205}
          x2={295}
          cy={175}
          radius={9}
          idPrefix={ID_PREFIX}
          stroke={colorFor("shaft")}
          strokeWidth={strokeFor("shaft")}
          glow={glowing("shaft")}
          spin={!paused}
          spinSeconds={spinSeconds}
          paused={paused}
          exploded={exploded}
          explodeExtend={35}
        />
        <IsoCylinder
          x1={385}
          x2={475}
          cy={175}
          radius={9}
          idPrefix={ID_PREFIX}
          stroke={colorFor("shaft")}
          strokeWidth={strokeFor("shaft")}
          spin={!paused}
          spinSeconds={spinSeconds}
          paused={paused}
          exploded={exploded}
          explodeExtend={35}
        />
      </g>

      {/* Motor */}
      <g onClick={() => onSelect("motor")} className="cursor-pointer" tabIndex={0} role="button" aria-label="Drive Motor">
        <ExplodeGroup exploded={exploded} dx={-45} dy={-15} connectorFrom={{ x: 220, y: 175 }} connectorTo={{ x: 145, y: 175 }}>
          <motion.g
            animate={{ opacity: paused ? 1 : [1, 0.95, 1] }}
            transition={{ duration: 2.4, repeat: paused ? 0 : Infinity, ease: "easeInOut" }}
          >
            <IsoPanel x={70} y={120} width={150} height={110} depth={28} idPrefix={ID_PREFIX} stroke={colorFor("motor")} strokeWidth={strokeFor("motor")} glow={glowing("motor")} rx={12} />
          </motion.g>
          <BoltRow x1={85} x2={205} y={135} count={2} />
          <BoltRow x1={85} x2={205} y={215} count={2} />
          <text x="145" y="245" textAnchor="middle" fill="#94a3b8" fontSize="13" fontWeight={700} letterSpacing="0.5">
            MOTOR
          </text>
        </ExplodeGroup>
      </g>

      {/* Bearing */}
      <g onClick={() => onSelect("bearing")} className="cursor-pointer" tabIndex={0} role="button" aria-label="Bearing">
        <ExplodeGroup exploded={exploded} dx={0} dy={-55} connectorFrom={{ x: 340, y: 175 }} connectorTo={{ x: 340, y: 175 }}>
          <BearingRings
            cx={340}
            cy={175}
            radius={50}
            stroke={colorFor("bearing")}
            strokeWidth={strokeFor("bearing")}
            glow={glowing("bearing")}
            vibration={reading.vibration}
            critical={componentHealths.bearing.status === "critical"}
            spinSeconds={paused ? 3.4 : 3.4}
            paused={paused}
          />
          <text x="340" y="243" textAnchor="middle" fill="#94a3b8" fontSize="13" fontWeight={700} letterSpacing="0.5">
            BEARING
          </text>
        </ExplodeGroup>
      </g>

      {/* Cooling Fan */}
      <g onClick={() => onSelect("fan")} className="cursor-pointer" tabIndex={0} role="button" aria-label="Cooling Fan">
        <ExplodeGroup exploded={exploded} dx={55} dy={15} connectorFrom={{ x: 465, y: 175 }} connectorTo={{ x: 520, y: 175 }}>
          <circle cx="520" cy="175" r="55" fill="#0c1a2c" stroke={colorFor("fan")} strokeWidth={strokeFor("fan")} />
          {glowing("fan") && (
            <circle cx="520" cy="175" r="55" fill="none" stroke={colorFor("fan")} strokeWidth={2.5} className="animate-pulse-glow" style={{ color: colorFor("fan") }} />
          )}
          <FanBlades cx={520} cy={175} radius={42} color={colorFor("fan")} spinSeconds={spinSeconds} paused={paused} />
          <circle cx="520" cy="175" r="8" fill="#334155" />
          <Bolt cx={520} cy={128} r={3} />
          <Bolt cx={520} cy={222} r={3} />
          <text x="520" y="248" textAnchor="middle" fill="#94a3b8" fontSize="13" fontWeight={700} letterSpacing="0.5">
            COOLING FAN
          </text>
        </ExplodeGroup>
      </g>

      <ThermalOverlay
        idPrefix={ID_PREFIX}
        visible={thermalView}
        temperature={reading.temperature}
        shapes={[
          { kind: "rect", x: 70, y: 100, width: 150, height: 145, rx: 16 },
          { kind: "circle", cx: 340, cy: 175, r: 58 },
          { kind: "circle", cx: 520, cy: 175, r: 62 },
        ]}
      />
    </svg>
  );
}
