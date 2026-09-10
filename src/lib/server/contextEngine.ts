/**
 * Context Engine — formats a per-device diagnosis into UI + generates the
 * dynamic HMI screens. The deterministic reasoning itself lives in the sim
 * engine (which owns the DeviceSpec); this module only shapes its output and
 * builds `HmiScreenDefinition`s. No LLM, no network.
 */

import type {
  Alarm,
  ContextEngineResult,
  DeviceDiagnosis,
  MachineContext,
  ProcessValue,
} from "@/lib/machineContext/model";
import type { HmiScreenDefinition, HmiWidget } from "@/lib/hmiSchema";

function pv(ctx: MachineContext, id: string): ProcessValue | undefined {
  return ctx.processValues.find((p) => p.id === id);
}
function activeAlarm(ctx: MachineContext): Alarm | null {
  return ctx.alarms.find((a) => a.state === "active") ?? null;
}

const STATE_LABEL: Record<string, string> = { STARTING: "Starting…", RUNNING: "Running", STOPPED: "Stopped", SAFE_MODE: "Safe Mode" };

export function statusToneFor(ms: string, alarm: boolean): "ok" | "warn" | "critical" | "idle" {
  if (ms === "SAFE_MODE") return "critical";
  if (ms === "STOPPED") return "idle";
  if (ms === "STARTING") return "ok";
  return alarm ? "warn" : "ok";
}

function statusHeader(ctx: MachineContext, kind: string, alarm: Alarm | null): HmiWidget {
  const ms = ctx.runtime.machineState;
  return {
    id: "status",
    kind: "statusHeader",
    label: kind,
    state: STATE_LABEL[ms] ?? "Running",
    tone: statusToneFor(ms, Boolean(alarm)),
  };
}

function overviewValues(ctx: MachineContext): HmiWidget {
  return {
    id: "values",
    kind: "valueGrid",
    values: ctx.processValues
      .filter((p) => OVERVIEW_IDS_BY_DEVICE(ctx).includes(p.id))
      .map((p) => ({ id: p.id, label: p.label, value: fmtVal(p), unit: p.unit || undefined, status: p.status })),
  };
}

/** Overview PV ids come from the spec via the tag list order — every PV that has a matching tag is "overview" unless it's an internal one. We keep it simple: show all PVs. */
function OVERVIEW_IDS_BY_DEVICE(ctx: MachineContext): string[] {
  return ctx.processValues.map((p) => p.id);
}

function fmtVal(p: ProcessValue): string {
  if (p.unit === "") return p.value === 1 ? "Active" : "Clear";
  return String(p.value);
}

function alarmBanner(a: Alarm): HmiWidget {
  return {
    id: "alarm",
    kind: "alarmBanner",
    label: a.label,
    detail: `Active · ${a.message}`,
    severity: a.severity,
  };
}

function controls(ctx: MachineContext): HmiWidget {
  const acts = ctx.operatorActions.filter((x) => x.kind === "control");
  const primary = acts[0];
  const secondary = acts[1] ?? acts[0];
  const toneOf = (id: string): "stop" | "start" | "neutral" =>
    /STOP|CLOSE/.test(id) ? "stop" : /START|OPEN/.test(id) ? "start" : "neutral";
  return {
    id: "controls",
    kind: "controlPair",
    primary: { actionId: primary.id, label: primary.label, tone: toneOf(primary.id), enabled: primary.enabled },
    secondary: { actionId: secondary.id, label: secondary.label, tone: toneOf(secondary.id), enabled: secondary.enabled },
    note: "Demo / simulation controls. Critical actions require operator authorization via the safety guardrail.",
  };
}

// ---------------------------------------------------------------------------
// Screen builders
// ---------------------------------------------------------------------------

export function buildOverviewScreen(ctx: MachineContext, diagnosis: DeviceDiagnosis, intent: string): HmiScreenDefinition {
  const alarm = activeAlarm(ctx);
  const widgets: HmiWidget[] = [statusHeader(ctx, diagnosis.deviceKind, alarm), overviewValues(ctx)];
  if (alarm) widgets.push(alarmBanner(alarm));
  widgets.push(controls(ctx));
  if (diagnosis.recommendedAction) widgets.push({ id: "guidance", kind: "guidanceNote", title: "AI Guidance", text: diagnosis.recommendedAction.text });

  return {
    screenId: "overview",
    screenTitle: `${diagnosis.deviceKind} Overview — ${ctx.machine.id}`,
    machineId: ctx.machine.id,
    intent,
    generatedAt: Date.now(),
    rationale: alarm
      ? `${diagnosis.deviceKind} is running with an active ${alarm.label} alarm — screen carries the process values that matter for this event, the alarm, controls, and the guidance for this condition.`
      : `${diagnosis.deviceKind} is running nominally — standard overview of the key process values and controls.`,
    widgets,
    footnote: "HMI adapted to current machine state",
  };
}

export function buildSubsystemScreen(ctx: MachineContext, diagnosis: DeviceDiagnosis, intent: string): HmiScreenDefinition {
  const alarm = activeAlarm(ctx);
  const focus = diagnosis.machineView.focusLabel ?? "Subsystem";
  const relatedIds = alarm?.relatedProcessValueIds ?? [];
  const sop = ctx.documents[0];

  const widgets: HmiWidget[] = [
    {
      id: "status",
      kind: "statusHeader",
      label: focus,
      state: alarm ? "Under investigation" : "Nominal",
      tone: alarm ? "warn" : "ok",
    },
    {
      id: "values",
      kind: "valueGrid",
      title: `${focus} — related values`,
      values: relatedIds
        .map((id) => pv(ctx, id))
        .filter((p): p is ProcessValue => Boolean(p))
        .map((p) => ({ id: p.id, label: p.label, value: fmtVal(p), unit: p.unit || undefined, status: p.status })),
    },
    {
      id: "contextlist",
      kind: "contextList",
      title: "Related tags",
      rows: ctx.tags
        .filter((t) => relatedIds.some((id) => t.id.toUpperCase().includes(id.toUpperCase())))
        .slice(0, 5)
        .map((t) => ({ label: t.label, value: `${t.value}${t.unit ? " " + t.unit : ""}` })),
    },
  ];
  if (sop) widgets.push({ id: "sop", kind: "sopExcerpt", sopId: sop.id, title: sop.title, steps: (sop.steps ?? []).slice(0, 4) });

  return {
    screenId: "subsystem",
    screenTitle: `${focus} — ${ctx.machine.id}`,
    machineId: ctx.machine.id,
    intent,
    generatedAt: Date.now(),
    rationale: `Operator asked for the ${focus.toLowerCase()} — screen assembled from its related tags, the process values it affects, and the relevant SOP steps.`,
    footnote: `HMI adapted — ${focus.toLowerCase()} view generated at runtime`,
    widgets,
  };
}

export function buildAlarmInvestigationScreen(ctx: MachineContext, diagnosis: DeviceDiagnosis, intent: string): HmiScreenDefinition {
  const alarm = activeAlarm(ctx);
  const widgets: HmiWidget[] = [];
  if (alarm) {
    widgets.push(alarmBanner(alarm));
    widgets.push({
      id: "related",
      kind: "valueGrid",
      title: "Values related to this alarm",
      values: alarm.relatedProcessValueIds
        .map((id) => pv(ctx, id))
        .filter((p): p is ProcessValue => Boolean(p))
        .map((p) => ({ id: p.id, label: p.label, value: fmtVal(p), unit: p.unit || undefined, status: p.status })),
    });
  }
  if (diagnosis.rootCause) {
    widgets.push({
      id: "rootcause",
      kind: "rootCausePanel",
      cause: diagnosis.rootCause.cause,
      confidence: diagnosis.rootCause.confidence,
      rationale: diagnosis.rootCause.rationale,
      signals: diagnosis.rootCause.supportingSignals,
    });
  }
  if (diagnosis.recommendedAction) widgets.push({ id: "guidance", kind: "guidanceNote", title: "Recommended action", text: diagnosis.recommendedAction.text });

  return {
    screenId: "alarm-investigation",
    screenTitle: alarm ? `${alarm.label} — Investigation` : "Alarm Investigation",
    machineId: ctx.machine.id,
    intent,
    generatedAt: Date.now(),
    rationale: "Everything related to the active alarm on one screen — the alarm, the process values it depends on, the ranked root cause, and the recommended action.",
    footnote: "HMI adapted — alarm investigation view generated at runtime",
    widgets,
  };
}

export function buildScreenByHint(
  hint: "overview" | "subsystem" | "alarm_investigation",
  ctx: MachineContext,
  diagnosis: DeviceDiagnosis,
  intent: string
): HmiScreenDefinition {
  if (hint === "subsystem") return buildSubsystemScreen(ctx, diagnosis, intent);
  if (hint === "alarm_investigation") return buildAlarmInvestigationScreen(ctx, diagnosis, intent);
  return buildOverviewScreen(ctx, diagnosis, intent);
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export function runContextEngine(ctx: MachineContext, diagnosis: DeviceDiagnosis): ContextEngineResult {
  return {
    currentEvent: diagnosis.currentEvent,
    activity: diagnosis.activity,
    contextAnalysis: diagnosis.contextAnalysis,
    alarmIntel: diagnosis.alarmIntel,
    rootCause: diagnosis.rootCause,
    recommendedAction: diagnosis.recommendedAction,
    finding: diagnosis.finding,
    machineView: diagnosis.machineView,
    defaultScreen: buildOverviewScreen(
      ctx,
      diagnosis,
      diagnosis.currentEvent?.alarmId ? `${diagnosis.currentEvent.title} on ${ctx.machine.id}` : `${diagnosis.deviceKind} running nominally`
    ),
    deviceKind: diagnosis.deviceKind,
    suggestions: diagnosis.suggestions,
  };
}
