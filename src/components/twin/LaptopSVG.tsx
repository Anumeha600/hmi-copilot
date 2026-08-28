"use client";

import type { LaptopComponentId, MachineStatus, SensorReading, TwinComponentDisplay } from "@/types";
import { STATUS_COLOR, clamp, simulatedFanSeconds } from "@/lib/twinVisuals";
import { Bolt, ExplodeGroup, FanBlades, IsoPanel, ThermalOverlay, TwinDefs } from "@/components/twin/primitives";

const ID_PREFIX = "laptop-twin";

interface LaptopSVGProps {
  components: Record<LaptopComponentId, TwinComponentDisplay>;
  selected: LaptopComponentId | null;
  onSelect: (id: LaptopComponentId) => void;
  reading: SensorReading;
  machineStatus: MachineStatus;
  thermalView: boolean;
  exploded: boolean;
}

export function LaptopSVG({ components, selected, onSelect, reading, machineStatus, thermalView, exploded }: LaptopSVGProps) {
  const colorFor = (id: LaptopComponentId) => STATUS_COLOR[components[id].status];
  const glowing = (id: LaptopComponentId) => components[id].status !== "normal";
  const strokeFor = (id: LaptopComponentId) => (selected === id ? 3.5 : 1.5);

  const paused = machineStatus === "safe_mode";
  const fanSeconds = simulatedFanSeconds(components.fan.health);
  const cpuGlowBlur = clamp(((100 - components.cpu.health) / 100) * 22, 4, 22);
  const batteryHealth = components.battery.health;
  const batteryCritical = components.battery.status === "critical";

  return (
    <svg viewBox="0 0 640 320" className="h-auto w-full select-none">
      <TwinDefs idPrefix={ID_PREFIX} />

      {/* Chassis / Motherboard base */}
      <g onClick={() => onSelect("motherboard")} className="cursor-pointer" tabIndex={0} role="button" aria-label="Motherboard">
        <ExplodeGroup exploded={exploded} dx={0} dy={25} connectorFrom={{ x: 320, y: 50 }} connectorTo={{ x: 320, y: 50 }}>
          <IsoPanel x={55} y={50} width={530} height={210} depth={18} idPrefix={ID_PREFIX} stroke={colorFor("motherboard")} strokeWidth={strokeFor("motherboard")} glow={glowing("motherboard")} rx={10} />
          {[0, 1, 2, 3, 4].map((i) => (
            <line key={i} x1={80} y1={78 + i * 34} x2={560} y2={78 + i * 34} stroke="rgba(148,197,255,0.05)" strokeWidth="1" />
          ))}
          <Bolt cx={72} cy={64} r={3} />
          <Bolt cx={568} cy={64} r={3} />
          <Bolt cx={72} cy={246} r={3} />
          <Bolt cx={568} cy={246} r={3} />
          <text x="575" y="66" textAnchor="end" fill="#475569" fontSize="10" fontWeight={600} letterSpacing="0.5">
            MOTHERBOARD
          </text>
        </ExplodeGroup>
      </g>

      {/* CPU */}
      <g onClick={() => onSelect("cpu")} className="cursor-pointer" tabIndex={0} role="button" aria-label="CPU">
        <ExplodeGroup exploded={exploded} dx={0} dy={-50} connectorFrom={{ x: 150, y: 95 }} connectorTo={{ x: 150, y: 95 }}>
          <IsoPanel x={100} y={95} width={100} height={95} depth={16} idPrefix={ID_PREFIX} stroke={colorFor("cpu")} strokeWidth={strokeFor("cpu")} rx={8} />
          <rect
            x={100}
            y={95}
            width={100}
            height={95}
            rx={8}
            fill="none"
            stroke={colorFor("cpu")}
            strokeWidth={2}
            style={{ filter: `drop-shadow(0 0 ${cpuGlowBlur}px ${colorFor("cpu")})` }}
          />
          {[0, 1, 2, 3, 4].map((i) => (
            <line key={i} x1={112 + i * 18} y1={104} x2={112 + i * 18} y2={180} stroke="#334155" strokeWidth="2" />
          ))}
          <text x="150" y="207" textAnchor="middle" fill="#94a3b8" fontSize="12" fontWeight={700} letterSpacing="0.5">
            CPU
          </text>
        </ExplodeGroup>
      </g>

      {/* RAM */}
      <g onClick={() => onSelect("ram")} className="cursor-pointer" tabIndex={0} role="button" aria-label="RAM">
        <ExplodeGroup exploded={exploded} dx={0} dy={-45} connectorFrom={{ x: 253, y: 80 }} connectorTo={{ x: 253, y: 80 }}>
          {/* Invisible hit-target spanning both sticks and the gap between them, so the whole bounding box is clickable. */}
          <rect x={220} y={75} width={62} height={135} fill="transparent" style={{ pointerEvents: "all" }} />
          <IsoPanel x={225} y={80} width={20} height={120} depth={10} idPrefix={ID_PREFIX} stroke={colorFor("ram")} strokeWidth={strokeFor("ram")} glow={glowing("ram")} rx={4} />
          <IsoPanel x={255} y={80} width={20} height={120} depth={10} idPrefix={ID_PREFIX} stroke={colorFor("ram")} strokeWidth={strokeFor("ram")} glow={glowing("ram")} rx={4} />
          <text x="253" y="208" textAnchor="middle" fill="#94a3b8" fontSize="12" fontWeight={700} letterSpacing="0.5">
            RAM
          </text>
        </ExplodeGroup>
      </g>

      {/* SSD */}
      <g onClick={() => onSelect("ssd")} className="cursor-pointer" tabIndex={0} role="button" aria-label="SSD">
        <ExplodeGroup exploded={exploded} dx={30} dy={-30} connectorFrom={{ x: 355, y: 150 }} connectorTo={{ x: 355, y: 150 }}>
          <IsoPanel x={310} y={150} width={90} height={34} depth={10} idPrefix={ID_PREFIX} stroke={colorFor("ssd")} strokeWidth={strokeFor("ssd")} glow={glowing("ssd")} rx={5} />
          <text x="355" y="203" textAnchor="middle" fill="#94a3b8" fontSize="12" fontWeight={700} letterSpacing="0.5">
            SSD
          </text>
        </ExplodeGroup>
      </g>

      {/* Cooling Fan */}
      <g onClick={() => onSelect("fan")} className="cursor-pointer" tabIndex={0} role="button" aria-label="Cooling Fan">
        <ExplodeGroup exploded={exploded} dx={45} dy={-20} connectorFrom={{ x: 446, y: 120 }} connectorTo={{ x: 490, y: 120 }}>
          <circle cx="490" cy="120" r="44" fill="#111e30" stroke={colorFor("fan")} strokeWidth={strokeFor("fan")} />
          {glowing("fan") && (
            <circle cx="490" cy="120" r="44" fill="none" stroke={colorFor("fan")} strokeWidth={2.5} className="animate-pulse-glow" style={{ color: colorFor("fan") }} />
          )}
          <FanBlades cx={490} cy={120} radius={32} color={colorFor("fan")} spinSeconds={fanSeconds} paused={paused} />
          <circle cx="490" cy="120" r="6" fill="#334155" />
          <text x="490" y="182" textAnchor="middle" fill="#94a3b8" fontSize="12" fontWeight={700} letterSpacing="0.5">
            FAN
          </text>
        </ExplodeGroup>
      </g>

      {/* Battery — fill level + color visibly degrade with health */}
      <g onClick={() => onSelect("battery")} className="cursor-pointer" tabIndex={0} role="button" aria-label="Battery">
        <ExplodeGroup exploded={exploded} dx={-15} dy={40} connectorFrom={{ x: 310, y: 215 }} connectorTo={{ x: 310, y: 215 }}>
          <IsoPanel x={100} y={215} width={420} height={34} depth={8} idPrefix={ID_PREFIX} stroke={colorFor("battery")} strokeWidth={strokeFor("battery")} glow={glowing("battery")} rx={6} />
          <rect
            x={106}
            y={221}
            width={Math.max(0, (408 * clamp(batteryHealth, 0, 100)) / 100)}
            height={22}
            rx={3}
            fill={colorFor("battery")}
            opacity={0.55}
          />
          {batteryCritical &&
            Array.from({ length: 10 }).map((_, i) => (
              <line
                key={i}
                x1={110 + i * 40}
                y1={221}
                x2={100 + i * 40}
                y2={243}
                stroke="#ef4444"
                strokeWidth={2}
                opacity={0.35}
              />
            ))}
          <text x="310" y="238" textAnchor="middle" fill="#e2e8f0" fontSize="12" fontWeight={700} letterSpacing="0.5">
            BATTERY {Math.round(batteryHealth)}%
          </text>
        </ExplodeGroup>
      </g>

      <ThermalOverlay
        idPrefix={ID_PREFIX}
        visible={thermalView}
        temperature={reading.temperature}
        shapes={[
          { kind: "rect", x: 100, y: 95, width: 100, height: 95, rx: 12 },
          { kind: "rect", x: 55, y: 50, width: 530, height: 210, rx: 16 },
        ]}
      />
    </svg>
  );
}
