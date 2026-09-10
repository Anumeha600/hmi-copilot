/**
 * Dynamic HMI screen schema.
 *
 * The context engine (and, when available, the LLM reasoner) emit an
 * `HmiScreenDefinition` — a plain data description of a screen. The HMI renderer
 * turns it into UI. The renderer runs no inference: every screen shown at
 * runtime is one of these objects.
 */

export type AlarmSeverity = "low" | "medium" | "high" | "critical";

export type WidgetKind =
  | "statusHeader"
  | "valueGrid"
  | "alarmBanner"
  | "controlPair"
  | "guidanceNote"
  | "trend"
  | "sopExcerpt"
  | "rootCausePanel"
  | "contextList";

interface BaseWidget {
  id: string;
  kind: WidgetKind;
}

export interface StatusHeaderWidget extends BaseWidget {
  kind: "statusHeader";
  label: string;
  state: string;
  tone: "ok" | "warn" | "critical" | "idle";
}

export interface ValueGridEntry {
  /** process-value id, so golden-path highlighting can target one row */
  id?: string;
  label: string;
  value: string;
  unit?: string;
  status?: "normal" | "high" | "low" | "critical";
}

export interface ValueGridWidget extends BaseWidget {
  kind: "valueGrid";
  title?: string;
  values: ValueGridEntry[];
}

export interface AlarmBannerWidget extends BaseWidget {
  kind: "alarmBanner";
  label: string;
  detail: string;
  severity: AlarmSeverity;
}

export interface ControlButtonSpec {
  actionId: string;
  label: string;
  tone: "stop" | "start" | "neutral";
  enabled: boolean;
}

export interface ControlPairWidget extends BaseWidget {
  kind: "controlPair";
  primary: ControlButtonSpec;
  secondary: ControlButtonSpec;
  note?: string;
}

export interface GuidanceNoteWidget extends BaseWidget {
  kind: "guidanceNote";
  title: string;
  text: string;
}

export interface TrendWidget extends BaseWidget {
  kind: "trend";
  title: string;
  series: { label: string; unit: string; points: number[] };
  limit?: number;
}

export interface SopExcerptWidget extends BaseWidget {
  kind: "sopExcerpt";
  sopId: string;
  title: string;
  steps: string[];
}

export interface RootCausePanelWidget extends BaseWidget {
  kind: "rootCausePanel";
  cause: string;
  confidence: "low" | "medium" | "high";
  rationale: string;
  signals: string[];
}

export interface ContextListWidget extends BaseWidget {
  kind: "contextList";
  title: string;
  rows: { label: string; value: string }[];
}

export type HmiWidget =
  | StatusHeaderWidget
  | ValueGridWidget
  | AlarmBannerWidget
  | ControlPairWidget
  | GuidanceNoteWidget
  | TrendWidget
  | SopExcerptWidget
  | RootCausePanelWidget
  | ContextListWidget;

export interface HmiScreenDefinition {
  screenId: string;
  screenTitle: string;
  machineId: string;
  /** The operator request or machine trigger this screen was assembled for. */
  intent: string;
  generatedAt: number;
  /** One line: why the engine selected these widgets for the current situation. */
  rationale: string;
  widgets: HmiWidget[];
  footnote: string;
}

/** The widget kinds the LLM reasoner is allowed to emit — keeps generated screens inside the renderer's vocabulary. */
export const ALLOWED_WIDGET_KINDS: WidgetKind[] = [
  "statusHeader",
  "valueGrid",
  "alarmBanner",
  "controlPair",
  "guidanceNote",
  "trend",
  "sopExcerpt",
  "rootCausePanel",
  "contextList",
];
