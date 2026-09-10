/**
 * Machine Context Model.
 *
 * A profile-agnostic description of one machine's runtime context — asset
 * hierarchy, PLC tags, I/O, process values, alarms, operating modes, operator
 * actions and documentation. The telemetry engine produces one of these each
 * tick; the context engine and the copilot read it.
 *
 * It is shaped so a real industrial source (OPC UA / Modbus TCP / MQTT / REST)
 * can replace the simulator later without touching anything downstream. Until
 * then `runtime.connectivity` is always `"simulation"` — the app never claims a
 * real PLC connection.
 */

import type { AlarmSeverity, HmiScreenDefinition } from "@/lib/hmiSchema";

export type { AlarmSeverity };

export type ProcessValueStatus = "normal" | "high" | "low" | "critical";
export type AlarmState = "active" | "acknowledged" | "cleared";
export type OperatingMode = "AUTO" | "MANUAL" | "STOPPED" | "SAFE_MODE";
export type TagQuality = "good" | "stale" | "bad";

export interface AssetNode {
  id: string;
  name: string;
  kind: "site" | "area" | "unit" | "equipment" | "component";
  parentId: string | null;
}

export interface PlcTag {
  id: string;
  address: string;
  label: string;
  datatype: "BOOL" | "INT" | "REAL" | "STRING";
  value: number | boolean | string;
  unit?: string;
  quality: TagQuality;
}

export interface IoPoint {
  id: string;
  channel: string;
  direction: "input" | "output";
  label: string;
  state: number | boolean;
  unit?: string;
}

export interface ProcessValue {
  id: string;
  label: string;
  value: number;
  unit: string;
  status: ProcessValueStatus;
  normalLow: number;
  normalHigh: number;
  limitHigh?: number;
  limitLow?: number;
  tagId: string;
}

export interface Alarm {
  id: string;
  label: string;
  severity: AlarmSeverity;
  state: AlarmState;
  /** operator has acknowledged this alarm (it is still active until the cause clears) */
  acknowledged: boolean;
  message: string;
  triggeredAt: number;
  processValueId: string | null;
  limit: number | null;
  unit: string | null;
  relatedProcessValueIds: string[];
}

export interface OperatorAction {
  id: string;
  label: string;
  kind: "control" | "acknowledge" | "navigate";
  targetTagId?: string;
  /** Critical actions must pass the safety & policy guardrail + operator authorization. */
  critical: boolean;
  enabled: boolean;
  disabledReason?: string;
}

export interface MachineDocument {
  id: string;
  title: string;
  kind: "SOP" | "manual" | "drawing" | "datasheet";
  appliesTo: string[];
  summary: string;
  steps?: string[];
}

export type MachineState = "STARTING" | "RUNNING" | "STOPPED" | "SAFE_MODE";

export interface RuntimeContext {
  mode: OperatingMode;
  /** Live run state of the machine, including the brief STARTING transient. */
  machineState: MachineState;
  shift: string;
  operator: string;
  connectivity: "simulation";
  lastContextSyncAt: number;
  activeScreenId: string | null;
}

export interface MachineContext {
  machine: {
    id: string;
    name: string;
    type: string;
    location: string;
  };
  assets: AssetNode[];
  tags: PlcTag[];
  io: IoPoint[];
  processValues: ProcessValue[];
  alarms: Alarm[];
  operatingModes: OperatingMode[];
  operatorActions: OperatorAction[];
  documents: MachineDocument[];
  runtime: RuntimeContext;
  generatedAt: number;
}

export interface MachineEvent {
  id: string;
  kind: "alarm" | "mode_change" | "operator_action" | "copilot_action";
  severity: AlarmSeverity | "info";
  title: string;
  detail: string;
  at: number;
  alarmId?: string;
}

// ---------------------------------------------------------------------------
// Context engine output — deterministic reasoning over a MachineContext.
// ---------------------------------------------------------------------------

export interface ContextAnalysisRow {
  label: string;
  value: string;
  status: "normal" | "elevated" | "high" | "info";
}

export interface RootCauseHypothesis {
  cause: string;
  confidence: "low" | "medium" | "high";
  rationale: string;
  supportingSignals: string[];
}

export interface AlarmIntelligence {
  alarmId: string;
  label: string;
  severity: AlarmSeverity;
  explanation: string;
  relatedProcessValues: { label: string; value: string; status: ProcessValueStatus }[];
}

export interface RecommendedAction {
  text: string;
  sopId: string | null;
}

export interface CopilotFinding {
  summary: string;
  whatIFound: string[];
  nextAction: string;
}

export interface CopilotActivityStep {
  id: string;
  label: string;
  state: "done" | "active";
  /** epoch ms — set on the first (event-detected) step so the stream can timestamp itself */
  at?: number;
}

export interface MachineViewFocus {
  focusAssetId: string | null;
  focusLabel: string | null;
  note: string | null;
}

export interface ContextEngineResult {
  currentEvent: {
    title: string;
    severity: AlarmSeverity | "info";
    alarmId: string | null;
  } | null;
  activity: CopilotActivityStep[];
  contextAnalysis: ContextAnalysisRow[];
  alarmIntel: AlarmIntelligence | null;
  rootCause: RootCauseHypothesis | null;
  recommendedAction: RecommendedAction | null;
  finding: CopilotFinding | null;
  machineView: MachineViewFocus;
  defaultScreen: HmiScreenDefinition;
  /** Kind of the active device — "Pump", "Motor", "Conveyor", "Compressor", "Tank". */
  deviceKind: string;
  /** Contextual question chips for the active machine. */
  suggestions: string[];
}

/**
 * Per-device diagnosis, computed by the sim engine (it owns the spec) and handed
 * to the context engine, which only formats it and builds screens.
 */
export interface DeviceDiagnosis {
  deviceKind: string;
  currentEvent: ContextEngineResult["currentEvent"];
  activity: CopilotActivityStep[];
  contextAnalysis: ContextAnalysisRow[];
  alarmIntel: AlarmIntelligence | null;
  rootCause: RootCauseHypothesis | null;
  recommendedAction: RecommendedAction | null;
  finding: CopilotFinding | null;
  machineView: MachineViewFocus;
  suggestions: string[];
}

export interface DeviceOption {
  id: string;
  name: string;
  kind: string;
}

/** Adapter listing for the future real-connectivity layer — display only. */
export const CONNECTIVITY_ADAPTERS = [
  { id: "opcua", label: "OPC UA", status: "planned" as const },
  { id: "modbus", label: "Modbus TCP", status: "planned" as const },
  { id: "mqtt", label: "MQTT", status: "planned" as const },
  { id: "rest", label: "REST API", status: "planned" as const },
];
