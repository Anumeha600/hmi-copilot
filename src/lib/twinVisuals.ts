import type { MachineStatus } from "@/types";
import { NOMINAL } from "./constants";

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Single source of truth for status → color across the Digital Twin visuals. */
export const STATUS_COLOR: Record<MachineStatus, string> = {
  normal: "#10b981",
  warning: "#f59e0b",
  critical: "#ef4444",
  safe_mode: "#94a3b8",
};

export type ThermalLabel = "cool" | "warm" | "hot" | "critical";

export interface ThermalBand {
  label: ThermalLabel;
  color: string;
  opacity: number;
}

/** Maps a live temperature reading to the spec's four-tier heatmap band. */
export function thermalBand(temperature: number): ThermalBand {
  if (temperature > 75) return { label: "critical", color: "#ef4444", opacity: 0.5 };
  if (temperature > 65) return { label: "hot", color: "#f97316", opacity: 0.4 };
  if (temperature > 55) return { label: "warm", color: "#facc15", opacity: 0.28 };
  return { label: "cool", color: "#38bdf8", opacity: 0.16 };
}

/** Continuous inverse mapping from live RPM to a CSS animation-duration (seconds). */
export function fanSpinSeconds(rpm: number, nominal: number = NOMINAL.rpm): number {
  if (rpm <= 5) return 6;
  const ratio = nominal / Math.max(rpm, 50);
  return clamp(0.7 * ratio, 0.35, 4);
}

/** Laptop fan has no telemetry RPM — derive a simulated speed from its health score. */
export function simulatedFanSeconds(health: number): number {
  const rpm = 1200 + clamp(health, 0, 100) * 24;
  return fanSpinSeconds(rpm, 3000);
}

export function visualStatusLabel(status: MachineStatus): string {
  switch (status) {
    case "normal":
      return "Healthy";
    case "warning":
      return "Degraded";
    case "critical":
      return "Critical";
    case "safe_mode":
      return "Safe Mode";
  }
}
