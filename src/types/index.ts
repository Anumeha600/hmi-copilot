export type ComponentId = "bearing" | "motor" | "shaft" | "fan";

export type MachineStatus = "normal" | "warning" | "critical" | "safe_mode";

export type Severity = "info" | "warning" | "critical";

export type LoadLevel = "low" | "medium" | "high";

export interface SensorReading {
  timestamp: number;
  temperature: number;
  vibration: number;
  current: number;
  rpm: number;
}

export interface HealthPoint {
  timestamp: number;
  health: number;
}

export interface ComponentHealth {
  id: ComponentId;
  name: string;
  health: number;
  failureProbability: number;
  remainingHours: number;
  recommendation: string;
  status: MachineStatus;
}

export interface Alert {
  id: string;
  ruleId: string;
  title: string;
  severity: Severity;
  confidence: number;
  trendDurationHours: number;
  rootCause: string;
  timeToFailureHours: number | null;
  recommendedAction: string;
  timestamp: number;
  firstTriggeredAt: number;
  componentId: ComponentId;
  acknowledged: boolean;
}

export interface MaintenanceLogEntry {
  id: string;
  timestamp: number;
  componentId: ComponentId;
  action: string;
  healthBefore: number;
  healthAfter: number;
}

export interface OperatorState {
  cognitiveLoad: number;
  loadLevel: LoadLevel;
  responseTimeMs: number;
  ignoredAlerts: number;
  alertFrequency: number;
}

export interface TrendPrediction {
  slopePerTick: number;
  rising: boolean;
  sustainedTicks: number;
  timeToFailureHours: number | null;
  confidence: number;
}

export type DemoPhase = "healthy" | "rising" | "fault" | "recovery" | "stable";

export type DemoPhaseName = "healthy" | "early_warning" | "critical" | "maintenance" | "recovery";

export type DeviceProfile = "motor" | "laptop";

export type LaptopComponentId = "cpu" | "ram" | "ssd" | "battery" | "fan" | "motherboard";

export type TwinComponentId = ComponentId | LaptopComponentId;

export interface TwinMetric {
  label: string;
  value: number;
  unit: string;
}

/** Profile-agnostic shape the inspection drawer renders — built from either
 *  the Motor's componentHealths or the Laptop's derived mapping. */
export interface TwinComponentDisplay {
  id: TwinComponentId;
  name: string;
  status: MachineStatus;
  health: number;
  failureProbability: number;
  remainingHours: number;
  recommendation: string;
  metrics: TwinMetric[];
  /** RUL trend info — undefined when there's no single underlying sensor to regress (e.g. laptop RAM/SSD blends). */
  trend?: {
    description: string;
    confidence: number;
  };
  /** Formatted RUL label ("4.8 hrs" / "> 24 hrs" / "Indeterminate" / "Model data insufficient"). */
  rulLabel?: string;
  /** True when this component maps to laptop telemetry that is simulated/derived rather than a real industrial sensor. */
  simulatedTelemetry?: boolean;
}

export interface DemoStatus {
  /** True from the first Start press until Reset — distinct from `running`, which pauses. */
  active: boolean;
  running: boolean;
  phase: DemoPhaseName;
  phaseLabel: string;
  /** 0-1 progress within the current phase. */
  phaseProgress: number;
  /** 0-1 progress across the full 30s loop. */
  totalProgress: number;
  loopCount: number;
  maintenanceInProgress: boolean;
}

export interface SimulationSnapshot {
  reading: SensorReading;
  health: number;
  status: MachineStatus;
  phase: DemoPhase;
  componentHealths: Record<ComponentId, ComponentHealth>;
  alerts: Alert[];
  maintenanceLog: MaintenanceLogEntry[];
  operator: OperatorState;
  history: SensorReading[];
  healthHistory: HealthPoint[];
  bearingPrediction: TrendPrediction;
}

/**
 * Wire format streamed by GET /api/telemetry (one SSE `data:` frame per tick).
 * The server is the sole source of truth: every field here is fully computed
 * server-side, so the client never re-derives simulation logic.
 */
export interface TelemetryPayload {
  timestamp: number;
  phase: DemoPhaseName;
  health: number;
  temperature: number;
  vibration: number;
  current: number;
  rpm: number;
  bearingHealth: number;
  motorHealth: number;
  shaftHealth: number;
  fanHealth: number;
  batteryHealth: number;
  operatorLoad: LoadLevel;
  timeToFailure: number | null;

  status: MachineStatus;
  ambientPhase: DemoPhase;
  componentHealths: Record<ComponentId, ComponentHealth>;
  alerts: Alert[];
  operator: OperatorState;
  bearingPrediction: TrendPrediction;
  componentRUL: Record<ComponentId, ComponentRUL>;
  history: SensorReading[];
  healthHistory: HealthPoint[];
  maintenanceLog: MaintenanceLogEntry[];
  demo: DemoStatus;
  plc: PLCTelemetry;
}

export type TrendDirection = "increasing" | "decreasing" | "improving" | "stable" | "indeterminate";

/**
 * Remaining Useful Life for a single component, derived from a real OLS trend
 * regression (lib/prediction.ts's linearRegressionSlope) over its dominant live
 * sensor signal. Computed in lib/rul.ts — never a scripted or hardcoded number.
 */
export interface ComponentRUL {
  componentId: ComponentId;
  metricLabel: string;
  unit: string;
  current: number;
  slopePerTick: number;
  /** Slope converted to simulated-plant units per hour, for human-readable rate display. */
  slopePerSimulatedHour: number;
  r2: number;
  warningThreshold: number;
  criticalThreshold: number;
  degrading: boolean;
  direction: TrendDirection;
  trendDescription: string;
  /** Raw regression-projected hours until the critical threshold is crossed, uncapped. Null when no confident projection exists. */
  rulHours: number | null;
  /** Display-ready label: precise hours when <= 24h, "> 24 hrs" when far off or stable, "Indeterminate" when the fit can't support a projection. */
  rulLabel: string;
  rulReason: string | null;
  /** Model-estimated failure probability — reused as-is from the existing health-band formula (100 - health) in lib/health.ts, not reinvented here. */
  failureProbability: number;
  confidence: number;
  dataSufficient: boolean;
}

export type PLCStatus = "STOPPED" | "STARTING" | "RUNNING" | "FAULT" | "SAFE_MODE";
export type PLCOperatingMode = "AUTO" | "MANUAL" | "STOPPED" | "SAFE_MODE";
export type MotorCommand = "RUN" | "STOP";
export type InterlockStatus = "OK" | "TRIPPED";
export type OverloadStatus = "NORMAL" | "OVERLOAD";

/**
 * Software PLC / Virtual PLC — a simulated industrial control layer, not a
 * connection to physical PLC hardware. See lib/plc.ts.
 */
export interface PLCTelemetry {
  status: PLCStatus;
  mode: PLCOperatingMode;
  motorCommand: MotorCommand;
  frequencySetpoint: number;
  actualFrequency: number;
  permissive: boolean;
  interlockStatus: InterlockStatus;
  overloadStatus: OverloadStatus;
  emergencyStop: boolean;
  faultCode: string | null;
  scanTime: number;
  cycleCount: number;
  /** True when the scripted demo owns the process — PLC is a synchronized read-only mirror and its own controls are disabled. */
  demoSynced: boolean;
}

/** Row shape returned by GET /api/history — persisted in the maintenance_logs SQLite table. */
export interface MaintenanceLogRecord {
  id: string;
  timestamp: number;
  phase: string;
  component: string;
  health: number;
  vibration: number;
  temperature: number;
  action: string;
  rul: number | null;
  failureProbability: number | null;
  predictionConfidence: number | null;
  trend: string | null;
}
