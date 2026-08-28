export const TICK_MS = 1000;

/** Each 1s real-time tick represents this many simulated plant seconds.
 *  Lets a ~2.5 minute demo loop narrate failures that would realistically
 *  take hours, while trend math stays a genuine regression, not a script. */
export const SIMULATED_SECONDS_PER_TICK = 180;

export const HISTORY_LENGTH = 120;
export const TREND_WINDOW = 18;

export const NOMINAL = {
  temperature: 48,
  vibration: 2.2,
  current: 10.5,
  rpm: 1490,
};

export const THRESHOLDS = {
  temperature: { warning: 65, critical: 82 },
  vibration: { warning: 5, critical: 8 },
  current: { warning: 14, critical: 17 },
  rpm: { warningLow: 1420, criticalLow: 1370 },
};

export const CYCLE_LENGTH = 150;

export const PHASE_BOUNDS = {
  healthy: [0, 24] as [number, number],
  rising: [24, 68] as [number, number],
  fault: [68, 95] as [number, number],
  recovery: [95, 128] as [number, number],
  stable: [128, 150] as [number, number],
};

export const COMPONENT_NAMES: Record<string, string> = {
  bearing: "Bearing",
  motor: "Drive Motor",
  shaft: "Drive Shaft",
  fan: "Cooling Fan",
};
