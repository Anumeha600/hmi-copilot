/**
 * Edge / Central task router.
 *
 * The HMI runs on low-compute hardware, so the copilot splits work:
 *
 *   Machine Context → Edge Context Engine → is this task SIMPLE or COMPLEX?
 *     SIMPLE  → handled locally by the deterministic rule engine (no network)
 *     COMPLEX → routed to central AI reasoning (LLM, when available)
 *
 * This is a deterministic classifier, not a model. Nothing here claims an ML
 * model runs on a microcontroller — the "edge" tier is the rule engine in
 * contextEngine.ts.
 */

import type { CopilotIntentName } from "./copilotReasoner";

export type TaskTier = "edge" | "central";

export interface TaskRouting {
  tier: TaskTier;
  /** Short description of the task class, e.g. "Alarm mapping + SOP retrieval". */
  task: string;
  /** Where it is handled. */
  handledBy: string;
  /** True when a central route was wanted but no LLM is configured, so it fell back to edge. */
  degradedToEdge: boolean;
}

const CENTRAL_INTENTS = new Set<CopilotIntentName>(["explain_event", "show_root_cause", "shift_handover"]);

const EDGE_TASK_LABELS: Partial<Record<CopilotIntentName, string>> = {
  generate_screen: "Dynamic HMI generation",
  open_sop: "Alarm-to-SOP mapping",
  propose_control_action: "Guardrail policy check",
  replay_event: "Event replay reconstruction",
  ask: "Machine-state recognition + context filtering",
};

const CENTRAL_TASK_LABELS: Partial<Record<CopilotIntentName, string>> = {
  explain_event: "Natural-language explanation",
  show_root_cause: "Multi-variable root-cause investigation",
  shift_handover: "Cross-shift operational reasoning",
};

/** Free-text that clearly needs multi-variable reasoning still routes central even under `ask`. */
function textWantsCentral(text: string): boolean {
  return /(why|root cause|explain|correlat|because|reason|previous shift|handover)/i.test(text);
}

export function classifyTask(intent: CopilotIntentName, text: string | undefined, hasLLM: boolean): TaskRouting {
  const wantsCentral = CENTRAL_INTENTS.has(intent) || (intent === "ask" && textWantsCentral(text ?? ""));

  if (!wantsCentral) {
    return {
      tier: "edge",
      task: EDGE_TASK_LABELS[intent] ?? "Alarm mapping + SOP retrieval",
      handledBy: "Local edge · deterministic rule engine",
      degradedToEdge: false,
    };
  }

  if (wantsCentral && !hasLLM) {
    return {
      tier: "edge",
      task: CENTRAL_TASK_LABELS[intent] ?? "Multi-variable root-cause investigation",
      handledBy: "Local edge · rule-engine fallback (central AI not configured)",
      degradedToEdge: true,
    };
  }

  return {
    tier: "central",
    task: CENTRAL_TASK_LABELS[intent] ?? "Multi-variable root-cause investigation",
    handledBy: "Central AI · plant reasoning server",
    degradedToEdge: false,
  };
}

/** The routing shown on the idle copilot panel while it is holding an active event. */
export function idleRouting(hasActiveAlarm: boolean, hasLLM: boolean): TaskRouting {
  const central = hasLLM ? "central AI available" : "central AI not configured";
  if (!hasActiveAlarm) {
    return { tier: "edge", task: "Machine-state monitoring", handledBy: `Local edge · deterministic rule engine (${central})`, degradedToEdge: false };
  }
  return {
    tier: "edge",
    task: "Alarm mapping + SOP retrieval",
    handledBy: `Local edge · deterministic rule engine (${central})`,
    degradedToEdge: false,
  };
}
