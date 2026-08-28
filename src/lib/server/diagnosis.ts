import type { TelemetryPayload } from "@/types";

export interface DiagnosisComponent {
  id: string;
  name: string;
  health: number;
  status: string;
  failureProbability: number;
  remainingHours: number;
  /** Regression-derived RUL fields (lib/rul.ts) — same numbers shown in the UI, never recomputed by the LLM. */
  rulLabel: string;
  trendDescription: string;
  predictionConfidence: number;
}

export interface DiagnosisAlert {
  title: string;
  severity: string;
  confidence: number;
  rootCause: string;
  timeToFailureHours: number | null;
  recommendedAction: string;
}

export interface DiagnosisReport {
  generatedAt: string;
  phase: string;
  machineHealth: number;
  machineStatus: string;
  sensors: { temperature: number; vibration: number; current: number; rpm: number };
  components: DiagnosisComponent[];
  activeAlerts: DiagnosisAlert[];
  trend: { rising: boolean; confidence: number; timeToFailureHours: number | null };
  operator: { cognitiveLoad: number; loadLevel: string };
}

/**
 * Extracts a structured, already-computed diagnosis snapshot from live telemetry.
 * Every value here comes from the local regression/rule engine (lib/demo.ts) —
 * nothing in this object is inferred; it is purely a re-shape for reporting.
 */
export function buildDiagnosis(payload: TelemetryPayload): DiagnosisReport {
  return {
    generatedAt: new Date(payload.timestamp || Date.now()).toISOString(),
    phase: payload.demo.phaseLabel,
    machineHealth: payload.health,
    machineStatus: payload.status,
    sensors: {
      temperature: payload.temperature,
      vibration: payload.vibration,
      current: payload.current,
      rpm: payload.rpm,
    },
    components: Object.values(payload.componentHealths).map((c) => ({
      id: c.id,
      name: c.name,
      health: c.health,
      status: c.status,
      failureProbability: c.failureProbability,
      remainingHours: c.remainingHours,
      rulLabel: payload.componentRUL[c.id].rulLabel,
      trendDescription: payload.componentRUL[c.id].trendDescription,
      predictionConfidence: payload.componentRUL[c.id].confidence,
    })),
    activeAlerts: payload.alerts.map((a) => ({
      title: a.title,
      severity: a.severity,
      confidence: a.confidence,
      rootCause: a.rootCause,
      timeToFailureHours: a.timeToFailureHours,
      recommendedAction: a.recommendedAction,
    })),
    trend: {
      rising: payload.bearingPrediction.rising,
      confidence: payload.bearingPrediction.confidence,
      timeToFailureHours: payload.bearingPrediction.timeToFailureHours,
    },
    operator: {
      cognitiveLoad: payload.operator.cognitiveLoad,
      loadLevel: payload.operator.loadLevel,
    },
  };
}

/** Deterministic, non-LLM report used whenever Groq is unavailable — same data, template-formatted. */
export function buildFallbackReport(diagnosis: DiagnosisReport): string {
  const lines: string[] = [];

  lines.push("ENGINEERING MAINTENANCE REPORT");
  lines.push(`Generated: ${new Date(diagnosis.generatedAt).toLocaleString()}`);
  lines.push("");
  lines.push(`MACHINE STATUS: ${diagnosis.machineStatus.toUpperCase()} — Health ${diagnosis.machineHealth}% (phase: ${diagnosis.phase})`);
  lines.push("");
  lines.push("SENSOR READINGS");
  lines.push(`  Temperature: ${diagnosis.sensors.temperature.toFixed(1)} °C`);
  lines.push(`  Vibration:   ${diagnosis.sensors.vibration.toFixed(2)} mm/s`);
  lines.push(`  Current:     ${diagnosis.sensors.current.toFixed(2)} A`);
  lines.push(`  RPM:         ${Math.round(diagnosis.sensors.rpm)}`);
  lines.push("");
  lines.push("COMPONENT HEALTH");
  for (const c of diagnosis.components) {
    lines.push(
      `  ${c.name}: ${c.health}% (${c.status}) — model-estimated failure probability ${c.failureProbability}%, RUL ${c.rulLabel} (${c.trendDescription}, confidence ${c.predictionConfidence}%)`
    );
  }
  lines.push("");
  if (diagnosis.activeAlerts.length === 0) {
    lines.push("ACTIVE ALERTS: None. All components trending within nominal bounds.");
  } else {
    lines.push("ACTIVE ALERTS");
    for (const a of diagnosis.activeAlerts) {
      lines.push(`  [${a.severity.toUpperCase()}] ${a.title} (confidence ${a.confidence}%)`);
      lines.push(`    Root cause: ${a.rootCause}`);
      lines.push(`    Time to failure: ${a.timeToFailureHours != null ? `${a.timeToFailureHours.toFixed(1)} hrs` : "n/a"}`);
      lines.push(`    Recommended action: ${a.recommendedAction}`);
    }
  }
  lines.push("");
  lines.push(
    `TREND ANALYSIS: ${diagnosis.trend.rising ? "Degrading trend detected" : "No sustained degrading trend"} (confidence ${diagnosis.trend.confidence}%)`
  );
  lines.push("");
  lines.push(`OPERATOR LOAD: ${diagnosis.operator.loadLevel.toUpperCase()} (score ${diagnosis.operator.cognitiveLoad})`);

  return lines.join("\n");
}
