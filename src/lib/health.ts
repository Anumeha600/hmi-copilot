import type { ComponentHealth, ComponentId, MachineStatus, SensorReading } from "@/types";
import { COMPONENT_NAMES, NOMINAL, THRESHOLDS } from "./constants";

function clamp(value: number, min = 0, max = 100): number {
  return Math.min(max, Math.max(min, value));
}

/** Maps a value's overshoot past nominal, relative to the critical band, to a 0-100 health score. */
function bandHealth(value: number, nominal: number, critical: number): number {
  const span = Math.abs(critical - nominal);
  if (span === 0) return 100;
  const overshoot = Math.abs(value - nominal) / span;
  return clamp(100 - overshoot * 100);
}

export function statusFromHealth(health: number): MachineStatus {
  if (health >= 85) return "normal";
  if (health >= 55) return "warning";
  return "critical";
}

/** Shared by the ambient sensor-derived formula and the scripted demo controller. */
export function buildComponentHealth(
  id: ComponentId,
  health: number,
  recommendation: string,
  healthyNote: string
): ComponentHealth {
  const clamped = clamp(health);
  const status = statusFromHealth(clamped);
  const failureProbability = clamp(100 - clamped);
  const remainingHours =
    status === "normal" ? 720 + clamped * 4 : status === "warning" ? 24 + clamped : Math.max(1, clamped / 3);
  return {
    id,
    name: COMPONENT_NAMES[id],
    health: Math.round(clamped),
    failureProbability: Math.round(failureProbability),
    remainingHours: Math.round(remainingHours * 10) / 10,
    recommendation: status === "normal" ? healthyNote : recommendation,
    status,
  };
}

export function computeComponentHealths(
  reading: SensorReading
): Record<ComponentId, ComponentHealth> {
  const bearingHealth = clamp(
    0.85 * bandHealth(reading.vibration, NOMINAL.vibration, THRESHOLDS.vibration.critical) +
      0.15 * bandHealth(reading.temperature, NOMINAL.temperature, THRESHOLDS.temperature.critical)
  );

  const motorHealth = clamp(
    0.6 * bandHealth(reading.current, NOMINAL.current, THRESHOLDS.current.critical) +
      0.4 * bandHealth(reading.temperature, NOMINAL.temperature, THRESHOLDS.temperature.critical)
  );

  const shaftHealth = clamp(
    0.6 * bandHealth(reading.vibration, NOMINAL.vibration, THRESHOLDS.vibration.critical) +
      0.4 * bandHealth(reading.rpm, NOMINAL.rpm, THRESHOLDS.rpm.criticalLow)
  );

  const fanHealth = clamp(
    0.75 * bandHealth(reading.temperature, NOMINAL.temperature, THRESHOLDS.temperature.critical) +
      0.25 * bandHealth(reading.rpm, NOMINAL.rpm, THRESHOLDS.rpm.criticalLow)
  );

  return {
    bearing: buildComponentHealth(
      "bearing",
      bearingHealth,
      "Inspect and lubricate bearing; schedule replacement if vibration persists.",
      "No action needed — operating within nominal range."
    ),
    motor: buildComponentHealth(
      "motor",
      motorHealth,
      "Check winding temperature and load coupling.",
      "No action needed — current draw nominal."
    ),
    shaft: buildComponentHealth(
      "shaft",
      shaftHealth,
      "Inspect shaft alignment and coupling for excess play.",
      "No action needed — rotational stability nominal."
    ),
    fan: buildComponentHealth(
      "fan",
      fanHealth,
      "Clear airflow path and verify fan speed against setpoint.",
      "No action needed — thermal management nominal."
    ),
  };
}

export function computeOverallHealth(componentHealths: Record<ComponentId, ComponentHealth>): number {
  const weighted =
    componentHealths.bearing.health * 0.45 +
    componentHealths.shaft.health * 0.2 +
    componentHealths.fan.health * 0.15 +
    componentHealths.motor.health * 0.2;
  return clamp(Math.round(weighted));
}
