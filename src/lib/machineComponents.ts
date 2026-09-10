/**
 * Schematic component maps for the interactive machine view.
 *
 * Data only (client-safe). Each device kind has a set of named components with
 * simple vector primitives and the process-value ids they relate to, so a click
 * can surface that component's live status.
 */

export type Prim =
  | { s: "rect"; x: number; y: number; w: number; h: number; r?: number }
  | { s: "circle"; cx: number; cy: number; r: number }
  | { s: "line"; x1: number; y1: number; x2: number; y2: number }
  | { s: "path"; d: string };

export interface MachineComponent {
  id: string;
  label: string;
  pvIds: string[];
  prims: Prim[];
  /** bounding box centre — for camera focus */
  cx: number;
  cy: number;
}

export interface MachineScene {
  viewBox: string;
  components: MachineComponent[];
  /** decorative, non-interactive lines (pipes, base) */
  frame: Prim[];
}

const PUMP: MachineScene = {
  viewBox: "0 0 240 150",
  frame: [
    { s: "path", d: "M18,120 L170,120 L196,106 L44,106 Z" },
    { s: "line", x1: 18, y1: 120, x2: 170, y2: 120 },
    { s: "line", x1: 150, y1: 90, x2: 150, y2: 55 },
    { s: "line", x1: 150, y1: 55, x2: 200, y2: 55 },
  ],
  components: [
    { id: "P-101-MOTOR", label: "Drive Motor", pvIds: ["speed"], cx: 78, cy: 90, prims: [{ s: "rect", x: 56, y: 74, w: 48, h: 32, r: 4 }, { s: "circle", cx: 104, cy: 90, r: 6 }] },
    { id: "P-101-COOLING", label: "Cooling System", pvIds: ["coolingFlow", "temperature"], cx: 44, cy: 90, prims: [{ s: "rect", x: 34, y: 68, w: 20, h: 44, r: 3 }, { s: "line", x1: 38, y1: 72, x2: 38, y2: 108 }, { s: "line", x1: 44, y1: 70, x2: 44, y2: 110 }, { s: "line", x1: 50, y1: 72, x2: 50, y2: 108 }] },
    { id: "P-101-PUMP", label: "Pump Body", pvIds: ["pressure", "flow"], cx: 140, cy: 90, prims: [{ s: "circle", cx: 140, cy: 90, r: 17 }, { s: "circle", cx: 140, cy: 90, r: 5 }] },
    { id: "P-101-SUCTION", label: "Suction Line", pvIds: ["flow"], cx: 200, cy: 90, prims: [{ s: "rect", x: 157, y: 84, w: 42, h: 12, r: 2 }] },
    { id: "P-101-DISCHARGE", label: "Discharge Line", pvIds: ["pressure"], cx: 175, cy: 55, prims: [{ s: "rect", x: 145, y: 50, w: 55, h: 10, r: 2 }] },
    { id: "P-101-TS", label: "Temperature Sensor", pvIds: ["temperature"], cx: 128, cy: 66, prims: [{ s: "circle", cx: 128, cy: 66, r: 4 }, { s: "line", x1: 128, y1: 70, x2: 133, y2: 78 }] },
    { id: "P-101-PS", label: "Pressure Sensor", pvIds: ["pressure"], cx: 150, cy: 46, prims: [{ s: "circle", cx: 150, cy: 46, r: 4 }, { s: "line", x1: 150, y1: 50, x2: 150, y2: 55 }] },
  ],
};

const MOTOR: MachineScene = {
  viewBox: "0 0 240 150",
  frame: [
    { s: "path", d: "M20,120 L200,120 L216,108 L36,108 Z" },
    { s: "line", x1: 20, y1: 120, x2: 200, y2: 120 },
  ],
  components: [
    { id: "M-201-MOTOR", label: "Motor Body", pvIds: ["current", "voltage", "temperature"], cx: 84, cy: 88, prims: [{ s: "rect", x: 52, y: 66, w: 64, h: 44, r: 5 }, { s: "line", x1: 60, y1: 66, x2: 60, y2: 110 }, { s: "line", x1: 68, y1: 66, x2: 68, y2: 110 }] },
    { id: "M-201-SHAFT", label: "Shaft", pvIds: ["rpm", "vibration"], cx: 128, cy: 88, prims: [{ s: "rect", x: 116, y: 84, w: 26, h: 8, r: 2 }] },
    { id: "M-201-COUPLING", label: "Coupling / Driven Load", pvIds: ["load", "vibration", "current"], cx: 168, cy: 88, prims: [{ s: "rect", x: 142, y: 74, w: 14, h: 28, r: 2 }, { s: "circle", cx: 182, cy: 88, r: 18 }, { s: "circle", cx: 182, cy: 88, r: 6 }] },
    { id: "M-201-CS", label: "Current Sensor", pvIds: ["current"], cx: 44, cy: 74, prims: [{ s: "circle", cx: 44, cy: 74, r: 4 }, { s: "line", x1: 44, y1: 78, x2: 52, y2: 82 }] },
    { id: "M-201-VS", label: "Vibration Sensor", pvIds: ["vibration"], cx: 84, cy: 60, prims: [{ s: "circle", cx: 84, cy: 60, r: 4 }, { s: "line", x1: 84, y1: 64, x2: 84, y2: 66 }] },
    { id: "M-201-TS", label: "Temperature Sensor", pvIds: ["temperature"], cx: 112, cy: 60, prims: [{ s: "circle", cx: 112, cy: 60, r: 4 }, { s: "line", x1: 112, y1: 64, x2: 110, y2: 66 }] },
  ],
};

const CONVEYOR: MachineScene = {
  viewBox: "0 0 240 150",
  frame: [
    { s: "line", x1: 20, y1: 128, x2: 60, y2: 128 },
    { s: "line", x1: 180, y1: 128, x2: 220, y2: 128 },
  ],
  components: [
    { id: "C-301-BELT", label: "Conveyor Belt", pvIds: ["beltSpeed", "productCount"], cx: 120, cy: 84, prims: [{ s: "rect", x: 40, y: 78, w: 160, h: 12, r: 6 }, { s: "line", x1: 40, y1: 96, x2: 200, y2: 96 }] },
    { id: "C-301-ROLLERS", label: "Rollers", pvIds: ["beltSpeed"], cx: 45, cy: 90, prims: [{ s: "circle", cx: 46, cy: 90, r: 12 }, { s: "circle", cx: 194, cy: 90, r: 12 }] },
    { id: "C-301-DRIVE", label: "Drive Motor", pvIds: ["motorLoad", "current"], cx: 194, cy: 112, prims: [{ s: "rect", x: 178, y: 100, w: 32, h: 24, r: 3 }] },
    { id: "C-301-DISCHARGE", label: "Discharge Chute", pvIds: ["beltSpeed", "motorLoad"], cx: 214, cy: 74, prims: [{ s: "path", d: "M202,72 L226,72 L220,92 L208,92 Z" }] },
    { id: "C-301-JAM", label: "Jam Sensor", pvIds: ["jamSensor"], cx: 172, cy: 66, prims: [{ s: "circle", cx: 172, cy: 66, r: 4 }, { s: "line", x1: 172, y1: 70, x2: 172, y2: 78 }] },
    { id: "C-301-LOAD", label: "Load Sensor", pvIds: ["motorLoad"], cx: 90, cy: 66, prims: [{ s: "circle", cx: 90, cy: 66, r: 4 }, { s: "line", x1: 90, y1: 70, x2: 90, y2: 78 }] },
  ],
};

const COMPRESSOR: MachineScene = {
  viewBox: "0 0 240 150",
  frame: [
    { s: "path", d: "M22,122 L198,122 L214,110 L38,110 Z" },
    { s: "line", x1: 150, y1: 84, x2: 150, y2: 52 },
    { s: "line", x1: 150, y1: 52, x2: 205, y2: 52 },
  ],
  components: [
    { id: "CP-401-STAGE", label: "Compression Stage", pvIds: ["dischargePressure", "load"], cx: 110, cy: 88, prims: [{ s: "rect", x: 84, y: 66, w: 52, h: 44, r: 5 }, { s: "circle", cx: 110, cy: 88, r: 12 }] },
    { id: "CP-401-MOTOR", label: "Motor", pvIds: ["rpm", "load"], cx: 58, cy: 88, prims: [{ s: "rect", x: 36, y: 72, w: 42, h: 32, r: 4 }] },
    { id: "CP-401-COOLER", label: "Aftercooler", pvIds: ["temperature"], cx: 150, cy: 92, prims: [{ s: "rect", x: 138, y: 78, w: 24, h: 28, r: 3 }, { s: "line", x1: 143, y1: 82, x2: 143, y2: 102 }, { s: "line", x1: 150, y1: 82, x2: 150, y2: 102 }, { s: "line", x1: 157, y1: 82, x2: 157, y2: 102 }] },
    { id: "CP-401-OUTLET", label: "Discharge / Outlet Valve", pvIds: ["outletValve", "dischargePressure"], cx: 178, cy: 52, prims: [{ s: "rect", x: 148, y: 47, w: 44, h: 10, r: 2 }, { s: "path", d: "M172,44 L184,44 L178,58 Z" }, { s: "path", d: "M172,60 L184,60 L178,46 Z" }] },
    { id: "CP-401-PS", label: "Pressure Sensor", pvIds: ["dischargePressure"], cx: 150, cy: 44, prims: [{ s: "circle", cx: 150, cy: 44, r: 4 }] },
  ],
};

const TANK: MachineScene = {
  viewBox: "0 0 240 160",
  frame: [
    { s: "line", x1: 20, y1: 70, x2: 62, y2: 70 },
    { s: "line", x1: 178, y1: 118, x2: 220, y2: 118 },
  ],
  components: [
    { id: "T-501", label: "Tank Body", pvIds: ["level", "pressure"], cx: 120, cy: 92, prims: [{ s: "rect", x: 72, y: 44, w: 96, h: 96, r: 6 }] },
    { id: "T-501-LS", label: "Level Sensor", pvIds: ["level"], cx: 168, cy: 60, prims: [{ s: "circle", cx: 168, cy: 60, r: 4 }, { s: "line", x1: 168, y1: 64, x2: 162, y2: 68 }] },
    { id: "T-501-INLET", label: "Inlet", pvIds: ["inletFlow"], cx: 60, cy: 70, prims: [{ s: "rect", x: 44, y: 65, w: 30, h: 10, r: 2 }] },
    { id: "T-501-INLET-VALVE", label: "Inlet Valve FV-501", pvIds: ["inletValve", "inletFlow"], cx: 54, cy: 70, prims: [{ s: "path", d: "M48,66 L60,66 L54,76 Z" }, { s: "path", d: "M48,78 L60,78 L54,68 Z" }] },
    { id: "T-501-OUTLET", label: "Outlet", pvIds: ["outletFlow"], cx: 178, cy: 118, prims: [{ s: "rect", x: 166, y: 113, w: 26, h: 10, r: 2 }] },
    { id: "T-501-OUTLET-VALVE", label: "Outlet Valve FV-502", pvIds: ["outletValve", "outletFlow"], cx: 160, cy: 118, prims: [{ s: "path", d: "M154,114 L166,114 L160,124 Z" }, { s: "path", d: "M154,126 L166,126 L160,116 Z" }] },
  ],
};

const SCENES: Record<string, MachineScene> = { Pump: PUMP, Motor: MOTOR, Conveyor: CONVEYOR, Compressor: COMPRESSOR, Tank: TANK };

export function sceneFor(kind: string): MachineScene {
  return SCENES[kind] ?? PUMP;
}
