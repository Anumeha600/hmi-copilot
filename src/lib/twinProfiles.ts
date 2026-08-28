import { statusFromHealth } from "./health";
import type {
  ComponentHealth,
  ComponentId,
  ComponentRUL,
  DeviceProfile,
  LaptopComponentId,
  MachineStatus,
  SensorReading,
  TrendDirection,
  TwinComponentDisplay,
  TwinMetric,
} from "@/types";

function clamp(value: number, min = 0, max = 100): number {
  return Math.min(max, Math.max(min, value));
}

function remainingHoursFor(status: MachineStatus, health: number): number {
  return status === "normal" ? 720 + health * 4 : status === "warning" ? 24 + health : Math.max(1, health / 3);
}

function directionWord(direction: TrendDirection): string {
  switch (direction) {
    case "increasing":
      return "Increasing";
    case "decreasing":
      return "Decreasing";
    case "improving":
      return "Improving";
    case "stable":
      return "Stable";
    default:
      return "Indeterminate";
  }
}

function buildDisplay(
  id: TwinComponentDisplay["id"],
  name: string,
  health: number,
  metrics: TwinMetric[],
  recommendation: string,
  healthyNote: string
): TwinComponentDisplay {
  const clamped = clamp(health);
  const status = statusFromHealth(clamped);
  return {
    id,
    name,
    status,
    health: Math.round(clamped),
    failureProbability: Math.round(clamp(100 - clamped)),
    remainingHours: Math.round(remainingHoursFor(status, clamped) * 10) / 10,
    recommendation: status === "normal" ? healthyNote : recommendation,
    metrics,
  };
}

// ---------- Industrial Motor profile — unchanged narrative, reuses componentHealths as-is ----------

const MOTOR_METRICS: Record<ComponentId, (r: SensorReading) => TwinMetric[]> = {
  bearing: (r) => [
    { label: "Vibration", value: r.vibration, unit: "mm/s" },
    { label: "Temperature", value: r.temperature, unit: "°C" },
  ],
  motor: (r) => [
    { label: "Current", value: r.current, unit: "A" },
    { label: "Temperature", value: r.temperature, unit: "°C" },
  ],
  shaft: (r) => [
    { label: "Vibration", value: r.vibration, unit: "mm/s" },
    { label: "RPM", value: r.rpm, unit: "rpm" },
  ],
  fan: (r) => [
    { label: "Temperature", value: r.temperature, unit: "°C" },
    { label: "RPM", value: r.rpm, unit: "rpm" },
  ],
};

export function motorProfileComponents(
  componentHealths: Record<ComponentId, ComponentHealth>,
  reading: SensorReading,
  componentRUL: Record<ComponentId, ComponentRUL>
): TwinComponentDisplay[] {
  return (Object.keys(componentHealths) as ComponentId[]).map((id) => {
    const c = componentHealths[id];
    const rul = componentRUL[id];
    return {
      id: c.id,
      name: c.name,
      status: c.status,
      health: c.health,
      failureProbability: c.failureProbability,
      remainingHours: c.remainingHours,
      recommendation: c.recommendation,
      metrics: MOTOR_METRICS[id](reading),
      trend: { description: rul.trendDescription, confidence: rul.confidence },
      rulLabel: rul.rulLabel,
      simulatedTelemetry: false,
    };
  });
}

// ---------- Laptop profile — new telemetry mapping over the same simulation output ----------

interface LaptopMapEntry {
  id: LaptopComponentId;
  name: string;
  health: (bearing: number, motor: number, shaft: number, fan: number, overall: number) => number;
  temperature: (r: SensorReading) => number;
  utilizationBaseline: number;
  utilizationScale: number;
  recommendation: string;
  healthyNote: string;
  /** Which motor component's real sensor trend this laptop part's RUL is borrowed from — undefined for blended parts with no single underlying signal. */
  sourceComponent?: ComponentId;
  trendLabel?: string;
}

const LAPTOP_MAP: LaptopMapEntry[] = [
  {
    id: "cpu",
    name: "CPU",
    health: (bearing) => bearing,
    temperature: (r) => r.temperature + 12,
    utilizationBaseline: 18,
    utilizationScale: 0.9,
    recommendation: "Check thermal paste and clean intake vents — CPU is thermal throttling.",
    healthyNote: "No action needed — CPU operating within nominal thermal range.",
    sourceComponent: "bearing",
    trendLabel: "Utilization trend",
  },
  {
    id: "motherboard",
    name: "Motherboard",
    health: (_bearing, _motor, shaft) => shaft,
    temperature: (r) => r.temperature + 4,
    utilizationBaseline: 10,
    utilizationScale: 0.5,
    recommendation: "Inspect power delivery traces and capacitors for wear.",
    healthyNote: "No action needed — board power delivery nominal.",
    sourceComponent: "shaft",
    trendLabel: "Power delivery trend",
  },
  {
    id: "fan",
    name: "Cooling Fan",
    health: (_bearing, _motor, _shaft, fan) => fan,
    temperature: (r) => r.temperature,
    utilizationBaseline: 30,
    utilizationScale: 0.7,
    recommendation: "Clear dust from fan blades and heatsink fins.",
    healthyNote: "No action needed — airflow nominal.",
    sourceComponent: "fan",
    trendLabel: "Thermal trend",
  },
  {
    id: "battery",
    name: "Battery",
    health: (_bearing, motor) => motor,
    temperature: (r) => r.temperature - 4,
    utilizationBaseline: 20,
    utilizationScale: 0.6,
    recommendation: "Run a battery calibration cycle and check cell health.",
    healthyNote: "No action needed — discharge rate nominal.",
    sourceComponent: "motor",
    trendLabel: "Degradation trend",
  },
  {
    id: "ram",
    name: "RAM",
    health: (_bearing, _motor, _shaft, fan, overall) => 0.5 * overall + 0.5 * fan,
    temperature: (r) => r.temperature - 2,
    utilizationBaseline: 35,
    utilizationScale: 0.3,
    recommendation: "Run a memory diagnostic to rule out failing modules.",
    healthyNote: "No action needed — memory access nominal.",
    // Blend of overall + fan health — no single underlying sensor to regress, so RUL is intentionally not projected.
  },
  {
    id: "ssd",
    name: "SSD",
    health: (_bearing, motor, _shaft, _fan, overall) => 0.5 * overall + 0.5 * motor,
    temperature: (r) => r.temperature - 6,
    utilizationBaseline: 15,
    utilizationScale: 0.4,
    recommendation: "Back up data and run a S.M.A.R.T. health check.",
    healthyNote: "No action needed — storage I/O nominal.",
    // Blend of overall + motor health — no single underlying sensor to regress, so RUL is intentionally not projected.
  },
];

export function laptopProfileComponents(
  componentHealths: Record<ComponentId, ComponentHealth>,
  overallHealth: number,
  reading: SensorReading,
  componentRUL: Record<ComponentId, ComponentRUL>
): TwinComponentDisplay[] {
  const bearing = componentHealths.bearing.health;
  const motor = componentHealths.motor.health;
  const shaft = componentHealths.shaft.health;
  const fan = componentHealths.fan.health;

  return LAPTOP_MAP.map((entry) => {
    const health = clamp(entry.health(bearing, motor, shaft, fan, overallHealth));
    const temperature = Math.round(entry.temperature(reading) * 10) / 10;
    const utilization = Math.round(clamp(entry.utilizationBaseline + (100 - health) * entry.utilizationScale));
    const display = buildDisplay(
      entry.id,
      entry.name,
      health,
      [
        { label: "Temperature", value: temperature, unit: "°C" },
        { label: "Utilization", value: utilization, unit: "%" },
      ],
      entry.recommendation,
      entry.healthyNote
    );
    display.simulatedTelemetry = true;
    if (entry.sourceComponent && entry.trendLabel) {
      const rul = componentRUL[entry.sourceComponent];
      display.trend = { description: `${entry.trendLabel}: ${directionWord(rul.direction)}`, confidence: rul.confidence };
      display.rulLabel = rul.dataSufficient ? rul.rulLabel : "Model data insufficient";
    } else {
      display.trend = { description: "Model data insufficient", confidence: 0 };
      display.rulLabel = "Model data insufficient";
    }
    return display;
  });
}

export function componentsForProfile(
  profile: DeviceProfile,
  componentHealths: Record<ComponentId, ComponentHealth>,
  overallHealth: number,
  reading: SensorReading,
  componentRUL: Record<ComponentId, ComponentRUL>
): TwinComponentDisplay[] {
  return profile === "motor"
    ? motorProfileComponents(componentHealths, reading, componentRUL)
    : laptopProfileComponents(componentHealths, overallHealth, reading, componentRUL);
}
