/**
 * Demo device catalogue.
 *
 * Five deterministic, SIMULATED machines. None is connected to a real PLC. Each
 * has its own telemetry shape, its own seeded incident, its own root-cause
 * hypothesis, SOP, golden path and contextual questions — so switching device
 * proves HMI Copilot adapts to machine context rather than being pump-specific.
 */

import type { AssetNode, MachineDocument } from "./model";
import type { GoldenPath } from "@/lib/goldenPath";

export type DeviceKind = "Pump" | "Motor" | "Conveyor" | "Compressor" | "Tank";
export type PvKind = "analog" | "counter" | "boolean";

export interface ProcessValueSpec {
  id: string;
  label: string;
  unit: string;
  kind: PvKind;
  nominal: number;
  stopped: number;
  /** value it drifts toward during the seeded incident (omit = stays nominal) */
  faultTarget?: number;
  normalLow: number;
  normalHigh: number;
  limitHigh?: number;
  limitLow?: number;
  noise: number;
  decimals: number;
  /** included in the generated overview screen */
  overview: boolean;
  /** per-tick increment for kind:"counter" while running & healthy */
  counterRate?: number;
  /** the value for kind:"boolean" during the seeded fault */
  booleanFaultState?: boolean;
}

/** One editable field in MANUAL mode. `pvId` must be a real process value. */
export interface ManualInputSpec {
  pvId: string;
  /** hard bounds for the numeric input — wider than the alarm limits so an operator can drive an incident */
  min: number;
  max: number;
  step: number;
}

export interface DeviceSpec {
  id: string;
  name: string;
  kind: DeviceKind;
  location: string;
  overviewTitle: string;
  controls: "startStop" | "valves";
  assets: AssetNode[];
  processValues: ProcessValueSpec[];
  /** Which process values the operator can enter directly when MODE = MANUAL. */
  manualInputs: ManualInputSpec[];
  alarm: {
    id: string;
    label: string;
    driverPvId: string;
    direction: "high" | "low";
    relatedPvIds: string[];
    /** driver-PV thresholds that set the alarm severity */
    severity: { medium: number; high: number; critical: number };
    focusAssetId: string;
    focusLabel: string;
  };
  rootCause: {
    cause: string;
    confidence: "low" | "medium" | "high";
    rationale: string;
    signalPvIds: string[];
  };
  recommendedAction: string;
  documents: MachineDocument[];
  goldenPath: GoldenPath;
  suggestions: string[];
}

// ---------------------------------------------------------------------------

const PUMP: DeviceSpec = {
  id: "P-101",
  name: "Pump Station P-101",
  kind: "Pump",
  location: "Utilities Area · Riverside Plant",
  overviewTitle: "Pump Overview — P-101",
  controls: "startStop",
  assets: [
    { id: "P-101", name: "Pump Station P-101", kind: "unit", parentId: null },
    { id: "P-101-PUMP", name: "Centrifugal Pump", kind: "equipment", parentId: "P-101" },
    { id: "P-101-MOTOR", name: "Drive Motor", kind: "equipment", parentId: "P-101" },
    { id: "P-101-COOLING", name: "Cooling System", kind: "equipment", parentId: "P-101" },
  ],
  processValues: [
    { id: "temperature", label: "Temperature", unit: "°C", kind: "analog", nominal: 57, stopped: 38, faultTarget: 72, normalLow: 40, normalHigh: 60, limitHigh: 65, noise: 0.3, decimals: 1, overview: true },
    { id: "pressure", label: "Pressure", unit: "bar", kind: "analog", nominal: 4.2, stopped: 0, normalLow: 3.6, normalHigh: 4.8, limitHigh: 5.5, limitLow: 3.2, noise: 0.03, decimals: 2, overview: true },
    { id: "flow", label: "Flow", unit: "L/min", kind: "analog", nominal: 38, stopped: 0, normalLow: 32, normalHigh: 44, limitLow: 28, noise: 0.2, decimals: 0, overview: true },
    { id: "speed", label: "Speed", unit: "RPM", kind: "analog", nominal: 1450, stopped: 0, normalLow: 1380, normalHigh: 1500, noise: 2, decimals: 0, overview: true },
    { id: "coolingFlow", label: "Cooling-water flow", unit: "L/min", kind: "analog", nominal: 16, stopped: 0, faultTarget: 7.5, normalLow: 12, normalHigh: 22, limitLow: 12, noise: 0.1, decimals: 1, overview: true },
  ],
  manualInputs: [
    { pvId: "temperature", min: 20, max: 120, step: 1 },
    { pvId: "speed", min: 0, max: 2000, step: 10 },
    { pvId: "pressure", min: 0, max: 10, step: 0.1 },
    { pvId: "flow", min: 0, max: 80, step: 1 },
  ],
  alarm: {
    id: "HIGH_TEMPERATURE",
    label: "High Temperature",
    driverPvId: "temperature",
    direction: "high",
    relatedPvIds: ["temperature", "coolingFlow", "pressure", "flow", "speed"],
    severity: { medium: 65, high: 70, critical: 80 },
    focusAssetId: "P-101-COOLING",
    focusLabel: "Cooling System",
  },
  rootCause: {
    cause: "Reduced cooling performance",
    confidence: "high",
    rationale:
      "Temperature is rising while the pump's hydraulic output is unchanged. Heat generation is normal for the duty point, so the fault is on the heat-removal side — most likely a restricted or under-supplied cooling loop.",
    signalPvIds: ["temperature", "coolingFlow", "pressure", "flow"],
  },
  recommendedAction: "Inspect the cooling system and verify operating load.",
  documents: [
    {
      id: "SOP-COOL-01",
      title: "SOP — High Discharge Temperature on Pump Station",
      kind: "SOP",
      appliesTo: ["HIGH_TEMPERATURE", "P-101-COOLING"],
      summary: "Response procedure when discharge temperature exceeds the limit while flow and pressure remain within range.",
      steps: [
        "Confirm the high-temperature alarm against the local gauge.",
        "Verify cooling-water supply valve HV-104 is fully open; check the strainer differential.",
        "Check cooling-water flow FI-104 against its 12 L/min minimum.",
        "Inspect the cooling loop for fouling, air lock, or a throttled return line.",
        "Confirm the operating load is within the pump curve.",
        "If temperature does not fall within 10 minutes, request maintenance and prepare a controlled stop.",
      ],
    },
  ],
  goldenPath: {
    conditionId: "HIGH_TEMPERATURE",
    title: "High Temperature — resolution path",
    source: "SOP-COOL-01 + recorded resolution sequence (previous shifts)",
    priorResolutions: 6,
    steps: [
      { n: 1, title: "Check cooling system", instruction: "Open the cooling system view and confirm supply valve HV-104 is open.", screen: "subsystem", highlight: { widgetId: "status", machineAsset: "P-101-COOLING" } },
      { n: 2, title: "Verify cooling flow", instruction: "Check cooling-water flow against its 12 L/min minimum.", screen: "subsystem", highlight: { valueId: "coolingFlow", machineAsset: "P-101-COOLING" } },
      { n: 3, title: "Check operating load", instruction: "Confirm process flow is within the pump's rated duty band.", screen: "overview", highlight: { valueId: "flow", machineAsset: "P-101-PUMP" } },
      { n: 4, title: "Confirm temperature recovers", instruction: "Watch discharge temperature fall back under the 65 °C limit.", screen: "overview", highlight: { valueId: "temperature", machineAsset: "P-101-PUMP" } },
      { n: 5, title: "Acknowledge alarm", instruction: "With temperature recovered and cause addressed, acknowledge the alarm.", screen: "alarm_investigation", highlight: { actionId: "ACK" } },
    ],
  },
  suggestions: [
    "Why is temperature rising?",
    "What happened before the alarm?",
    "How do I resolve this?",
    "Show me the cooling system.",
  ],
};

const MOTOR: DeviceSpec = {
  id: "M-201",
  name: "Drive Motor M-201",
  kind: "Motor",
  location: "Line 2 · Riverside Plant",
  overviewTitle: "Motor Overview — M-201",
  controls: "startStop",
  assets: [
    { id: "M-201", name: "Drive Motor M-201", kind: "unit", parentId: null },
    { id: "M-201-MOTOR", name: "AC Motor", kind: "equipment", parentId: "M-201" },
    { id: "M-201-COUPLING", name: "Coupling / Driven Load", kind: "equipment", parentId: "M-201" },
    { id: "M-201-BEARING", name: "Drive-end Bearing", kind: "component", parentId: "M-201-MOTOR" },
  ],
  processValues: [
    { id: "current", label: "Current", unit: "A", kind: "analog", nominal: 12.4, stopped: 0.3, faultTarget: 18.4, normalLow: 9, normalHigh: 14.5, limitHigh: 16, noise: 0.15, decimals: 1, overview: true },
    { id: "voltage", label: "Voltage", unit: "V", kind: "analog", nominal: 402, stopped: 0, normalLow: 390, normalHigh: 415, noise: 1.2, decimals: 0, overview: true },
    { id: "rpm", label: "RPM", unit: "RPM", kind: "analog", nominal: 1480, stopped: 0, faultTarget: 1420, normalLow: 1440, normalHigh: 1500, limitLow: 1400, noise: 3, decimals: 0, overview: true },
    { id: "vibration", label: "Vibration", unit: "mm/s", kind: "analog", nominal: 2.5, stopped: 0, faultTarget: 7.2, normalLow: 0, normalHigh: 4.5, limitHigh: 6, noise: 0.15, decimals: 1, overview: true },
    { id: "load", label: "Load", unit: "%", kind: "analog", nominal: 66, stopped: 0, faultTarget: 95, normalLow: 30, normalHigh: 85, limitHigh: 100, noise: 0.8, decimals: 0, overview: true },
    { id: "torque", label: "Shaft Torque", unit: "Nm", kind: "analog", nominal: 84, stopped: 0, faultTarget: 176, normalLow: 45, normalHigh: 130, limitHigh: 155, noise: 1.5, decimals: 0, overview: false },
    { id: "temperature", label: "Temperature", unit: "°C", kind: "analog", nominal: 60, stopped: 30, faultTarget: 74, normalLow: 40, normalHigh: 75, limitHigh: 90, noise: 0.3, decimals: 0, overview: false },
  ],
  manualInputs: [
    { pvId: "temperature", min: 20, max: 140, step: 1 },
    { pvId: "rpm", min: 0, max: 1800, step: 10 },
    { pvId: "torque", min: 0, max: 220, step: 5 },
    { pvId: "current", min: 0, max: 30, step: 0.1 },
  ],
  alarm: {
    id: "OVERCURRENT",
    label: "Motor Overcurrent",
    driverPvId: "current",
    direction: "high",
    relatedPvIds: ["current", "rpm", "torque", "vibration", "load", "temperature"],
    severity: { medium: 16, high: 18, critical: 21 },
    focusAssetId: "M-201-COUPLING",
    focusLabel: "Coupling / Driven Load",
  },
  rootCause: {
    cause: "Mechanical overload",
    confidence: "high",
    rationale:
      "Motor current is rising while speed is falling and shaft torque and vibration are increasing. The motor is drawing more torque to hold speed against a load that has stiffened — consistent with an obstruction or seized element in the driven equipment, not an electrical fault.",
    signalPvIds: ["current", "rpm", "torque", "vibration", "load"],
  },
  recommendedAction: "Inspect the connected load for obstruction or binding before restarting.",
  documents: [
    {
      id: "SOP-MOT-03",
      title: "SOP — Motor Overcurrent / Suspected Mechanical Overload",
      kind: "SOP",
      appliesTo: ["OVERCURRENT", "M-201-COUPLING"],
      summary: "Response when motor current exceeds limit with falling speed and rising vibration.",
      steps: [
        "Confirm overcurrent against the local ammeter; note current, speed and vibration.",
        "Do not restart repeatedly — repeated starts into an overload damage the winding.",
        "Isolate and lock off the motor; rotate the shaft by hand to check for binding.",
        "Inspect the coupling and driven equipment for obstruction, product build-up or bearing seizure.",
        "Clear the obstruction, verify free rotation, then restart and confirm current returns below 14.5 A.",
      ],
    },
  ],
  goldenPath: {
    conditionId: "OVERCURRENT",
    title: "Motor Overcurrent — resolution path",
    source: "SOP-MOT-03 + recorded resolution sequence (previous shifts)",
    priorResolutions: 4,
    steps: [
      { n: 1, title: "Review the overcurrent evidence", instruction: "Check current against the 16 A limit alongside the speed drop.", screen: "alarm_investigation", highlight: { valueId: "current", machineAsset: "M-201-MOTOR" } },
      { n: 2, title: "Check speed and vibration", instruction: "Confirm RPM has fallen and vibration risen — the signature of a stiffening load.", screen: "overview", highlight: { valueId: "vibration", machineAsset: "M-201-COUPLING" } },
      { n: 3, title: "Stop the motor", instruction: "Command a controlled stop before inspecting; do not restart into the overload.", screen: "overview", highlight: { actionId: "STOP", machineAsset: "M-201-MOTOR" } },
      { n: 4, title: "Inspect the driven load", instruction: "Isolate, then check the coupling and driven equipment for obstruction or binding.", screen: "subsystem", highlight: { widgetId: "status", machineAsset: "M-201-COUPLING" } },
      { n: 5, title: "Acknowledge alarm", instruction: "Once the obstruction is cleared and rotation is free, acknowledge the alarm.", screen: "alarm_investigation", highlight: { actionId: "ACK" } },
    ],
  },
  suggestions: [
    "Why is current high?",
    "Is this likely mechanical overload?",
    "Show me the motor controls.",
    "What happened before the alarm?",
  ],
};

const CONVEYOR: DeviceSpec = {
  id: "C-301",
  name: "Transfer Conveyor C-301",
  kind: "Conveyor",
  location: "Packing Line · Riverside Plant",
  overviewTitle: "Conveyor Overview — C-301",
  controls: "startStop",
  assets: [
    { id: "C-301", name: "Transfer Conveyor C-301", kind: "unit", parentId: null },
    { id: "C-301-BELT", name: "Belt", kind: "equipment", parentId: "C-301" },
    { id: "C-301-DRIVE", name: "Drive Motor", kind: "equipment", parentId: "C-301" },
    { id: "C-301-DISCHARGE", name: "Discharge Chute", kind: "equipment", parentId: "C-301" },
  ],
  processValues: [
    { id: "beltSpeed", label: "Belt Speed", unit: "m/s", kind: "analog", nominal: 1.2, stopped: 0, faultTarget: 0.15, normalLow: 0.9, normalHigh: 1.35, limitLow: 0.6, noise: 0.02, decimals: 2, overview: true },
    { id: "motorLoad", label: "Motor Load", unit: "%", kind: "analog", nominal: 55, stopped: 0, faultTarget: 98, normalLow: 25, normalHigh: 80, limitHigh: 90, noise: 1, decimals: 0, overview: true },
    { id: "current", label: "Drive Current", unit: "A", kind: "analog", nominal: 8.1, stopped: 0.2, faultTarget: 14.2, normalLow: 5, normalHigh: 11, limitHigh: 12, noise: 0.12, decimals: 1, overview: true },
    { id: "vibration", label: "Vibration", unit: "mm/s", kind: "analog", nominal: 1.8, stopped: 0, faultTarget: 5.5, normalLow: 0, normalHigh: 4, limitHigh: 5, noise: 0.1, decimals: 1, overview: false },
    { id: "productCount", label: "Product Count", unit: "units", kind: "counter", nominal: 0, stopped: 0, counterRate: 0.7, normalLow: 0, normalHigh: 1e9, noise: 0, decimals: 0, overview: true },
    { id: "jamSensor", label: "Jam Sensor", unit: "", kind: "boolean", nominal: 0, stopped: 0, booleanFaultState: true, normalLow: 0, normalHigh: 0, noise: 0, decimals: 0, overview: true },
  ],
  manualInputs: [
    { pvId: "beltSpeed", min: 0, max: 2.5, step: 0.05 },
    { pvId: "current", min: 0, max: 20, step: 0.1 },
    { pvId: "motorLoad", min: 0, max: 120, step: 1 },
  ],
  alarm: {
    id: "BELT_JAM",
    label: "Belt Jam / Overload",
    driverPvId: "current",
    direction: "high",
    relatedPvIds: ["current", "motorLoad", "beltSpeed", "jamSensor", "vibration"],
    severity: { medium: 12, high: 13.5, critical: 15 },
    focusAssetId: "C-301-DISCHARGE",
    focusLabel: "Discharge Chute",
  },
  rootCause: {
    cause: "Downstream obstruction",
    confidence: "high",
    rationale:
      "Belt speed has collapsed to near zero while motor load and current climbed to their limits and the jam sensor is active. The drive is straining against a stalled belt — product is backed up at the discharge, not a drive fault.",
    signalPvIds: ["beltSpeed", "motorLoad", "current", "jamSensor"],
  },
  recommendedAction: "Stop the conveyor and clear the obstruction at the discharge chute before restarting.",
  documents: [
    {
      id: "SOP-CONV-02",
      title: "SOP — Conveyor Belt Jam / Drive Overload",
      kind: "SOP",
      appliesTo: ["BELT_JAM", "C-301-DISCHARGE"],
      summary: "Response when drive current/load are at limit with belt speed collapsed and the jam sensor active.",
      steps: [
        "Command a controlled stop; confirm the belt is stationary.",
        "Isolate and lock off the drive before approaching the belt.",
        "Inspect the discharge chute and transfer point for backed-up or wedged product.",
        "Clear the obstruction and check the belt tracks freely by hand.",
        "Restart and confirm belt speed recovers to ~1.2 m/s and current returns below 11 A.",
      ],
    },
  ],
  goldenPath: {
    conditionId: "BELT_JAM",
    title: "Belt Jam — resolution path",
    source: "SOP-CONV-02 + recorded resolution sequence (previous shifts)",
    priorResolutions: 9,
    steps: [
      { n: 1, title: "Confirm the jam", instruction: "Belt speed near zero with drive current at limit and jam sensor active.", screen: "alarm_investigation", highlight: { valueId: "beltSpeed", machineAsset: "C-301-BELT" } },
      { n: 2, title: "Stop the conveyor", instruction: "Command a controlled stop before anyone approaches the belt.", screen: "overview", highlight: { actionId: "STOP", machineAsset: "C-301-DRIVE" } },
      { n: 3, title: "Check the discharge chute", instruction: "Inspect the discharge and transfer point for backed-up product.", screen: "subsystem", highlight: { widgetId: "status", machineAsset: "C-301-DISCHARGE" } },
      { n: 4, title: "Confirm current recovers", instruction: "After clearing, restart and watch drive current fall back below 11 A.", screen: "overview", highlight: { valueId: "current", machineAsset: "C-301-DRIVE" } },
      { n: 5, title: "Acknowledge alarm", instruction: "With the belt running normally, acknowledge the jam alarm.", screen: "alarm_investigation", highlight: { actionId: "ACK" } },
    ],
  },
  suggestions: [
    "Why did the conveyor stop?",
    "Show me the jam condition.",
    "How do I clear this fault?",
    "What happened before the alarm?",
  ],
};

const COMPRESSOR: DeviceSpec = {
  id: "CP-401",
  name: "Air Compressor CP-401",
  kind: "Compressor",
  location: "Compressor House · Riverside Plant",
  overviewTitle: "Compressor Overview — CP-401",
  controls: "startStop",
  assets: [
    { id: "CP-401", name: "Air Compressor CP-401", kind: "unit", parentId: null },
    { id: "CP-401-STAGE", name: "Compression Stage", kind: "equipment", parentId: "CP-401" },
    { id: "CP-401-OUTLET", name: "Discharge / Outlet Valve", kind: "equipment", parentId: "CP-401" },
    { id: "CP-401-COOLER", name: "Aftercooler", kind: "equipment", parentId: "CP-401" },
  ],
  processValues: [
    { id: "dischargePressure", label: "Discharge Pressure", unit: "bar", kind: "analog", nominal: 7.5, stopped: 0.2, faultTarget: 9.6, normalLow: 6.5, normalHigh: 8.5, limitHigh: 9.0, noise: 0.05, decimals: 1, overview: true },
    { id: "temperature", label: "Temperature", unit: "°C", kind: "analog", nominal: 64, stopped: 32, faultTarget: 79, normalLow: 45, normalHigh: 78, limitHigh: 95, noise: 0.4, decimals: 0, overview: true },
    { id: "rpm", label: "RPM", unit: "RPM", kind: "analog", nominal: 2950, stopped: 0, faultTarget: 2985, normalLow: 2850, normalHigh: 3000, noise: 4, decimals: 0, overview: true },
    { id: "load", label: "Load", unit: "%", kind: "analog", nominal: 70, stopped: 0, faultTarget: 93, normalLow: 30, normalHigh: 88, limitHigh: 100, noise: 1, decimals: 0, overview: true },
    { id: "outletValve", label: "Outlet Valve", unit: "%", kind: "analog", nominal: 100, stopped: 100, faultTarget: 45, normalLow: 80, normalHigh: 100, limitLow: 60, noise: 0, decimals: 0, overview: true },
  ],
  manualInputs: [
    { pvId: "temperature", min: 20, max: 130, step: 1 },
    { pvId: "rpm", min: 0, max: 3300, step: 10 },
    { pvId: "dischargePressure", min: 0, max: 14, step: 0.1 },
  ],
  alarm: {
    id: "HIGH_DISCHARGE_PRESSURE",
    label: "High Discharge Pressure",
    driverPvId: "dischargePressure",
    direction: "high",
    relatedPvIds: ["dischargePressure", "outletValve", "temperature", "load"],
    severity: { medium: 9.0, high: 9.4, critical: 10 },
    focusAssetId: "CP-401-OUTLET",
    focusLabel: "Discharge / Outlet Valve",
  },
  rootCause: {
    cause: "Restricted outlet",
    confidence: "medium",
    rationale:
      "Discharge pressure is above limit while the compressor is running at normal speed. The outlet valve is only 45% open and load has risen — the compressor is working against a throttled or partially closed discharge, raising pressure and temperature.",
    signalPvIds: ["dischargePressure", "outletValve", "temperature", "load"],
  },
  recommendedAction: "Check the discharge line and outlet valve position; confirm downstream demand and open the valve to its normal position.",
  documents: [
    {
      id: "SOP-COMP-01",
      title: "SOP — Compressor High Discharge Pressure",
      kind: "SOP",
      appliesTo: ["HIGH_DISCHARGE_PRESSURE", "CP-401-OUTLET"],
      summary: "Response when discharge pressure exceeds limit at normal speed.",
      steps: [
        "Confirm high discharge pressure against the local gauge.",
        "Check the outlet / discharge valve position and any downstream isolation valves.",
        "Verify downstream air demand — a closed receiver or blocked main raises pressure.",
        "Open the outlet valve to its normal position and confirm pressure falls below 8.5 bar.",
        "If pressure stays high with the valve open, unload the compressor and request maintenance.",
      ],
    },
  ],
  goldenPath: {
    conditionId: "HIGH_DISCHARGE_PRESSURE",
    title: "High Discharge Pressure — resolution path",
    source: "SOP-COMP-01 + recorded resolution sequence (previous shifts)",
    priorResolutions: 3,
    steps: [
      { n: 1, title: "Confirm the pressure", instruction: "Discharge pressure is above the 9.0 bar limit at normal RPM.", screen: "alarm_investigation", highlight: { valueId: "dischargePressure", machineAsset: "CP-401-STAGE" } },
      { n: 2, title: "Check the outlet valve", instruction: "The outlet valve is only 45% open — the likely restriction.", screen: "subsystem", highlight: { valueId: "outletValve", machineAsset: "CP-401-OUTLET" } },
      { n: 3, title: "Check downstream demand", instruction: "Confirm the receiver and distribution main are not isolated.", screen: "subsystem", highlight: { widgetId: "status", machineAsset: "CP-401-OUTLET" } },
      { n: 4, title: "Confirm pressure recovers", instruction: "With the valve opened, watch discharge pressure fall below 8.5 bar.", screen: "overview", highlight: { valueId: "dischargePressure", machineAsset: "CP-401-STAGE" } },
      { n: 5, title: "Acknowledge alarm", instruction: "Once pressure is back in range, acknowledge the alarm.", screen: "alarm_investigation", highlight: { actionId: "ACK" } },
    ],
  },
  suggestions: [
    "Why is pressure high?",
    "Show me the valve state.",
    "How do I resolve this?",
    "What happened before the alarm?",
  ],
};

const TANK: DeviceSpec = {
  id: "T-501",
  name: "Buffer Tank T-501",
  kind: "Tank",
  location: "Process Area · Riverside Plant",
  overviewTitle: "Tank Overview — T-501",
  controls: "valves",
  assets: [
    { id: "T-501", name: "Buffer Tank T-501", kind: "unit", parentId: null },
    { id: "T-501-INLET", name: "Inlet Valve FV-501", kind: "equipment", parentId: "T-501" },
    { id: "T-501-OUTLET", name: "Outlet Valve FV-502", kind: "equipment", parentId: "T-501" },
  ],
  processValues: [
    { id: "level", label: "Level", unit: "%", kind: "analog", nominal: 55, stopped: 55, faultTarget: 92, normalLow: 25, normalHigh: 80, limitHigh: 90, limitLow: 15, noise: 0.3, decimals: 0, overview: true },
    { id: "inletFlow", label: "Inlet Flow", unit: "L/min", kind: "analog", nominal: 40, stopped: 0, faultTarget: 55, normalLow: 20, normalHigh: 60, noise: 0.5, decimals: 0, overview: true },
    { id: "outletFlow", label: "Outlet Flow", unit: "L/min", kind: "analog", nominal: 40, stopped: 0, faultTarget: 24, normalLow: 20, normalHigh: 60, noise: 0.5, decimals: 0, overview: true },
    { id: "pressure", label: "Pressure", unit: "bar", kind: "analog", nominal: 1.8, stopped: 1.0, faultTarget: 2.4, normalLow: 1.2, normalHigh: 2.2, limitHigh: 2.6, noise: 0.02, decimals: 1, overview: true },
    { id: "inletValve", label: "Inlet Valve", unit: "", kind: "boolean", nominal: 1, stopped: 0, normalLow: 0, normalHigh: 1, noise: 0, decimals: 0, overview: true },
    { id: "outletValve", label: "Outlet Valve", unit: "%", kind: "analog", nominal: 100, stopped: 0, faultTarget: 55, normalLow: 60, normalHigh: 100, limitLow: 60, noise: 0, decimals: 0, overview: true },
  ],
  manualInputs: [
    { pvId: "level", min: 0, max: 100, step: 1 },
    { pvId: "inletFlow", min: 0, max: 100, step: 1 },
    { pvId: "outletFlow", min: 0, max: 100, step: 1 },
    { pvId: "outletValve", min: 0, max: 100, step: 1 },
  ],
  alarm: {
    id: "HIGH_LEVEL",
    label: "High Level",
    driverPvId: "level",
    direction: "high",
    relatedPvIds: ["level", "inletFlow", "outletFlow", "outletValve"],
    severity: { medium: 90, high: 94, critical: 98 },
    focusAssetId: "T-501-OUTLET",
    focusLabel: "Outlet Valve FV-502",
  },
  rootCause: {
    cause: "Inlet / outlet imbalance",
    confidence: "high",
    rationale:
      "Level is climbing because inlet flow (55 L/min) exceeds outlet flow (24 L/min). The outlet valve is throttled to 55%, so the tank is filling faster than it drains — a flow-balance problem, not an instrument fault.",
    signalPvIds: ["level", "inletFlow", "outletFlow", "outletValve"],
  },
  recommendedAction: "Open the outlet valve or reduce inlet flow to restore the flow balance and bring level back toward 55%.",
  documents: [
    {
      id: "SOP-TANK-04",
      title: "SOP — Buffer Tank High Level",
      kind: "SOP",
      appliesTo: ["HIGH_LEVEL", "T-501-OUTLET"],
      summary: "Response when tank level exceeds the high limit with inlet flow exceeding outlet flow.",
      steps: [
        "Confirm the high-level alarm against the local sight glass.",
        "Compare inlet and outlet flow; identify which side is out of balance.",
        "Open the outlet valve FV-502 toward 100% and confirm outlet flow rises.",
        "If level keeps climbing, throttle or close the inlet valve FV-501.",
        "Confirm level trends back toward the 55% working setpoint.",
      ],
    },
  ],
  goldenPath: {
    conditionId: "HIGH_LEVEL",
    title: "High Level — resolution path",
    source: "SOP-TANK-04 + recorded resolution sequence (previous shifts)",
    priorResolutions: 5,
    steps: [
      { n: 1, title: "Confirm the imbalance", instruction: "Inlet flow exceeds outlet flow — the tank is filling faster than it drains.", screen: "alarm_investigation", highlight: { valueId: "inletFlow", machineAsset: "T-501" } },
      { n: 2, title: "Check the outlet valve", instruction: "The outlet valve is throttled to 55% — open it toward 100%.", screen: "overview", highlight: { actionId: "OPEN_OUTLET", machineAsset: "T-501-OUTLET" } },
      { n: 3, title: "Watch outlet flow rise", instruction: "Confirm outlet flow increases as the valve opens.", screen: "overview", highlight: { valueId: "outletFlow", machineAsset: "T-501-OUTLET" } },
      { n: 4, title: "Confirm level recovers", instruction: "Watch level trend back down toward the 55% setpoint.", screen: "overview", highlight: { valueId: "level", machineAsset: "T-501" } },
      { n: 5, title: "Acknowledge alarm", instruction: "Once level is back in range, acknowledge the high-level alarm.", screen: "alarm_investigation", highlight: { actionId: "ACK" } },
    ],
  },
  suggestions: [
    "Why is level increasing?",
    "How do I stabilize the tank?",
    "Show me the valve states.",
    "What happened before the alarm?",
  ],
};

export const DEVICE_SPECS: DeviceSpec[] = [PUMP, MOTOR, CONVEYOR, COMPRESSOR, TANK];

export const DEVICE_IDS = DEVICE_SPECS.map((d) => d.id);

export function getDeviceSpec(id: string): DeviceSpec {
  return DEVICE_SPECS.find((d) => d.id === id) ?? PUMP;
}

/** Classify one operator-entered value against a process value's operating envelope. */
export function classifyManualValue(pv: ProcessValueSpec, v: number): "invalid" | "unsafe" | "abnormal" | "ok" {
  if (!Number.isFinite(v)) return "invalid";
  if ((pv.limitHigh != null && v > pv.limitHigh) || (pv.limitLow != null && v < pv.limitLow)) return "unsafe";
  if (v > pv.normalHigh || v < pv.normalLow) return "abnormal";
  return "ok";
}

export const DEVICE_OPTIONS = DEVICE_SPECS.map((d) => ({ id: d.id, name: d.name, kind: d.kind }));
