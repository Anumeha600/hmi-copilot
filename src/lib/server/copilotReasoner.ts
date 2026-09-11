/**
 * Copilot Reasoner — the "central" tier.
 *
 * Turns an operator intent + the current machine context (any demo device) into
 * a copilot response: a narrated reply, and optionally a generated HMI screen,
 * an SOP, a root-cause read-out, a proposed (guardrailed) control action, a
 * golden path, or a time-travel replay.
 *
 * Deterministic by default. When GROQ_API_KEY is set it additionally asks an
 * LLM to phrase conversational replies — the LLM is a writer, never a source of
 * numbers or decisions, and it never operates the machine.
 */

import type { DeviceDiagnosis, MachineContext, MachineDocument, RootCauseHypothesis } from "@/lib/machineContext/model";
import type { HmiScreenDefinition } from "@/lib/hmiSchema";
import type { GoldenPath } from "@/lib/goldenPath";
import { buildAlarmInvestigationScreen, buildOverviewScreen, buildScreenByHint, buildSubsystemScreen } from "./contextEngine";
import { evaluateControlAction, type ControlActionId, type PolicyDecision } from "./safetyPolicy";
import { classifyTask, type TaskRouting } from "./taskRouter";
import {
  answerTelemetry,
  chatReply,
  classifyChat,
  detectControlRequest,
  MACHINE_HINT,
  offTopicReply,
  resolveFollowUp,
  type ChatTurn,
} from "./copilotChat";

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const DEFAULT_MODEL = "openai/gpt-oss-120b";

export type CopilotIntentName =
  | "explain_event"
  | "ask"
  | "generate_screen"
  | "show_root_cause"
  | "open_sop"
  | "propose_control_action"
  | "shift_handover"
  | "replay_event"
  | "golden_path"
  | "time_travel"
  | "explain_component"
  | "why_highlighted"
  | "machine_status"
  | "alarm_summary"
  | "next_action"
  | "general_chat"
  | "telemetry_query";

export type ScreenTarget = "overview" | "subsystem" | "alarm_investigation";

export interface CopilotRequest {
  intent: CopilotIntentName;
  text?: string;
  target?: ScreenTarget;
  sopId?: string;
  actionId?: ControlActionId;
  componentId?: string;
  componentLabel?: string;
  /** current UI workflow phase — keeps free-text answers focused on the active incident */
  workflow?: "investigation" | "root-cause" | "sop" | "golden-path" | "replay" | null;
  /** lightweight conversation memory — the last few turns, for reference resolution */
  history?: ChatTurn[];
}

export interface ProposedControlAction {
  actionId: ControlActionId;
  label: string;
  policy: PolicyDecision;
  /** the /api/hmi/action `action` string the client authorizes (chat-originated control) */
  action?: string;
  /** operator setpoint values for `action: "set_manual_values"` */
  values?: Record<string, number>;
}

export interface CopilotResponse {
  intent: CopilotIntentName;
  reply: string;
  source: "engine" | "groq";
  routing: TaskRouting;
  screen?: HmiScreenDefinition;
  sop?: MachineDocument;
  rootCause?: RootCauseHypothesis;
  proposedAction?: ProposedControlAction;
  handover?: { state: string; events: { title: string; detail: string; at: number }[] };
  /** Set for time_travel — the API route fills in the actual frames/events. */
  openTimeTravel?: boolean;
  goldenPath?: GoldenPath;
  /** Set for show_root_cause / explain_component / show_on_machine — asset to focus in the machine view. */
  focusAssetId?: string | null;
  suggestions: string[];
}

type LiveContext = MachineContext & {
  __diagnosis: DeviceDiagnosis;
  __goldenPath: GoldenPath;
  __primaryHistory?: number[];
  __deviceId?: string;
  __session?: unknown;
  __manualSetpoints?: Record<string, number> | null;
};

function activeAlarm(ctx: MachineContext) {
  return ctx.alarms.find((a) => a.state === "active") ?? null;
}
function driverPv(ctx: MachineContext) {
  const alarm = activeAlarm(ctx);
  return alarm?.processValueId ? ctx.processValues.find((p) => p.id === alarm.processValueId) ?? null : null;
}
function isRunning(ctx: MachineContext) {
  return Boolean(ctx.tags.find((t) => t.id.endsWith(".RUN"))?.value);
}
function docFor(ctx: MachineContext, sopId?: string) {
  return ctx.documents.find((d) => d.id === sopId) ?? ctx.documents[0] ?? null;
}

// ---------------------------------------------------------------------------
// Compact deterministic answers (edge tier — no LLM)
// ---------------------------------------------------------------------------

function machineStatusLine(ctx: LiveContext): string {
  const alarm = activeAlarm(ctx);
  return `${ctx.machine.name}: ${ctx.runtime.machineState}, ${ctx.runtime.mode} mode. ${alarm ? `Active ${alarm.severity} ${alarm.label}.` : "No active alarms — all values within range."}`;
}

function nextActionLine(ctx: LiveContext): string {
  const dg = ctx.__diagnosis;
  if (!activeAlarm(ctx)) return "No action required — the machine is within normal limits.";
  return `${dg.recommendedAction?.text ?? "Investigate the active alarm."}\nNext step: open Golden Path for the guided resolution sequence.`;
}

function alarmSummaryBlock(ctx: LiveContext): string {
  const dg = ctx.__diagnosis;
  const alarm = activeAlarm(ctx);
  const d = driverPv(ctx);
  if (!alarm || !d) return `${ctx.machine.name} — no active alarm. All process values within range.`;
  const evidence = (dg.alarmIntel?.relatedProcessValues ?? []).slice(0, 3).map((r) => `  ${r.label}: ${r.value}`).join("\n");
  return [
    "FINDING",
    `${d.label} ${d.value} ${d.unit} vs ${alarm.limit} ${d.unit} limit — ${alarm.severity.toUpperCase()} ${alarm.label}.`,
    "LIKELY CAUSE",
    dg.rootCause?.cause ?? "—",
    "EVIDENCE",
    evidence || "  —",
    "RECOMMENDED ACTION",
    dg.recommendedAction?.text ?? "—",
    "NEXT STEP",
    "Open Golden Path",
  ].join("\n");
}

function whyHighlightedLine(ctx: LiveContext, componentId?: string, componentLabel?: string): string {
  const dg = ctx.__diagnosis;
  const alarm = activeAlarm(ctx);
  const label = componentLabel ?? dg.machineView.focusLabel ?? "component";
  if (!alarm) return `${label} is not highlighted — there is no active alarm on ${ctx.machine.name}.`;
  const isFocus = !componentId || componentId === dg.machineView.focusAssetId;
  if (!isFocus) return `${label} is not the flagged component — the ${alarm.label} alarm points at ${dg.machineView.focusLabel}.`;
  const signals = (dg.rootCause?.supportingSignals ?? []).slice(0, 2).join("; ");
  return `${label} is highlighted because the ${alarm.label} alarm is attributed to it. ${dg.rootCause?.rationale ?? ""}${signals ? ` Supporting signals: ${signals}.` : ""}`;
}

// ---------------------------------------------------------------------------
// Free-text routing (deterministic)
// ---------------------------------------------------------------------------

interface FreeTextRoute {
  intent: CopilotIntentName;
  reply: string;
  target?: ScreenTarget;
  /** chat-originated control request — routed to the guardrail, never executed here */
  control?: { actionId: ControlActionId; action: string; values?: Record<string, number> };
  /** true when this route came from the control-request detector (even when it
   *  resolved to "already running" / "already stopped" rather than a proposal) —
   *  its reply is final and should not be recomputed by deterministicReply. */
  fromControlDetection?: boolean;
}

function routeFreeText(text: string, ctx: LiveContext, history: ChatTurn[] = []): FreeTextRoute {
  const q = text.toLowerCase();
  const dg = ctx.__diagnosis;
  const alarm = activeAlarm(ctx);
  const d = driverPv(ctx);
  const focus = (dg.machineView.focusLabel ?? "subsystem").toLowerCase();
  const copilotTurns = history.filter((t) => t.role === "copilot").length;

  // ---- conversation layer, part 1: general chat / control ----
  // These run first, before anything machine-specific: a greeting or a control
  // request is never misread as a value lookup, and general chat never spills
  // machine telemetry.
  const chat = classifyChat(text);
  if (chat) return { intent: "general_chat", reply: chatReply(chat, ctx, copilotTurns) };

  const control = detectControlRequest(text, ctx);
  if (control) return { intent: control.intent, reply: control.reply ?? "", target: control.target, control: control.control, fromControlDetection: true };

  if (alarm && new RegExp(`(${focus.split(" ")[0]}|cooling|valve|belt|coupling|load|discharge|outlet|inlet)`).test(q) && /(show|view|open)/.test(q)) {
    return { intent: "generate_screen", target: "subsystem", reply: `Generated the ${focus} view from its related tags and the SOP for this condition.` };
  }
  if (/(related to this alarm|everything|all values|alarm view|investigat|evidence)/.test(q)) {
    return { intent: "generate_screen", target: "alarm_investigation", reply: "Alarm investigation view generated — the alarm, its related process values, the ranked root cause and the recommended action." };
  }
  if (/(status|overview|show me the (pump|motor|conveyor|compressor|tank)|controls|current)/.test(q) && /(show|display|open|view)/.test(q)) {
    return { intent: "generate_screen", target: "overview", reply: `${dg.deviceKind} overview generated from the current machine context.` };
  }
  if (/(root cause|why did|likely cause|caused)/.test(q)) {
    return {
      intent: "show_root_cause",
      reply: dg.rootCause
        ? `Likely cause: ${dg.rootCause.cause} (${dg.rootCause.confidence} confidence). ${dg.rootCause.rationale}`
        : "No active alarm to investigate.",
    };
  }
  if (/(resolve|fix|stabilize|clear this|what should i|what do i do|how do i|walk me through|step by step|guide me|safest way|golden ?path|recommended sequence)/.test(q)) {
    return {
      intent: "golden_path",
      reply: alarm
        ? `Golden path for ${alarm.label} loaded — the resolution sequence used on previous shifts. I'll highlight each control step by step.`
        : dg.recommendedAction?.text ?? "No action required — the machine is within normal limits.",
    };
  }
  if (/(what happened before|before this alarm|before the alarm|led up to|time travel|time-travel|replay|rewind|what led to|earlier state)/.test(q)) {
    return { intent: "time_travel", reply: "Opening the machine replay for the minute leading into this alarm." };
  }
  if (/(sop|procedure|instruction)/.test(q)) {
    return { intent: "open_sop", reply: docFor(ctx) ? `Opened ${docFor(ctx)!.title}.` : "No SOP found for this condition." };
  }
  if (/(previous shift|last shift|handover)/.test(q)) {
    return { intent: "shift_handover", reply: `Prepared a shift handover summary for ${ctx.machine.name}.` };
  }
  if (/(machine status|is (it|the machine) (running|stopped)|running or stopped|current state|current status|what state|what mode|is it stopped|is it running|operational)/.test(q)) {
    return { intent: "machine_status", reply: machineStatusLine(ctx) };
  }
  if (/(summar|what.?s wrong|whats wrong|brief|tl.?dr|quick rundown|the situation|last 30|last thirty)/.test(q)) {
    return { intent: "alarm_summary", reply: alarmSummaryBlock(ctx) };
  }
  if (/(next step|what next|what.?s next|what should i do|what do i check|what should i check|how should i respond|how do i respond|best action|next best)/.test(q)) {
    return { intent: "next_action", reply: nextActionLine(ctx) };
  }
  if (/why.*(highlight|flagged|selected|marked|focused)/.test(q)) {
    return { intent: "why_highlighted", reply: whyHighlightedLine(ctx) };
  }
  if (/(safe to (re)?start|can i (re)?start|is it safe)/.test(q)) {
    const ms = ctx.runtime.machineState;
    return {
      intent: "machine_status",
      reply:
        ms === "SAFE_MODE"
          ? "Not safe — the machine is latched in Safe Mode. Clear the emergency stop at the panel first."
          : activeAlarm(ctx)
            ? `The ${activeAlarm(ctx)!.label} alarm is still active. Resolve the cause (${ctx.__diagnosis.rootCause?.cause.toLowerCase()}) before restarting; any start still passes the safety guardrail and your authorization.`
            : `${ctx.machine.name} is within limits. A start would still require your authorization at the safety guardrail.`,
    };
  }
  // Causal / qualitative language ("why", "rising", "problem") routes to the
  // root-cause explanation. A bare value name alone ("temperature", "pressure")
  // is NOT causal — that is a plain lookup and belongs to the telemetry layer
  // below, so it is deliberately excluded here.
  if (alarm && d && /(why|rising|increasing|falling|overcurrent|overload|problem|serious|concern|worse|trend|getting worse|is (that|this|it).*(normal|ok\b|okay|fine))/.test(q)) {
    return {
      intent: "explain_event",
      reply: `${d.label} is ${d.value} ${d.unit}, ${alarm.limit != null && d.value > alarm.limit ? "exceeding" : "outside"} the ${alarm.limit} ${d.unit} limit. Edge hypothesis: ${dg.rootCause?.cause.toLowerCase()}.`,
    };
  }

  // ---- conversation layer, part 2: deterministic telemetry + follow-ups ----
  // Nothing above matched an explicit machine phrasing — try a direct value
  // lookup, then conversational reference resolution ("show me", "which
  // component", "is it still running", pronouns), before giving up.
  const telemetry = answerTelemetry(text, ctx);
  if (telemetry) return { intent: "telemetry_query", reply: telemetry };

  const followUp = resolveFollowUp(text, ctx, history);
  if (followUp) {
    return {
      intent: followUp.intent,
      // resolved to a machine intent but left the wording to the reasoner
      reply: followUp.reply ?? deterministicReply(followUp.intent, { intent: followUp.intent, text }, ctx),
      target: followUp.target,
    };
  }

  // clearly not about the machine and not a chat pattern we recognised — a
  // short, honest redirect instead of dumping unrelated alarm telemetry.
  if (!MACHINE_HINT.test(q)) {
    return { intent: "general_chat", reply: offTopicReply(ctx) };
  }

  return {
    intent: "ask",
    reply: alarm
      ? `${ctx.machine.name} has an active ${alarm.severity} ${alarm.label} alarm. Ask me to explain it, show the root cause, open the SOP, show the ${focus}, or how to resolve it.`
      : `${ctx.machine.name} is operating within normal limits. Ask me to show the ${dg.deviceKind.toLowerCase()} overview or a subsystem.`,
  };
}

function deterministicReply(intent: CopilotIntentName, req: CopilotRequest, ctx: LiveContext): string {
  const dg = ctx.__diagnosis;
  const alarm = activeAlarm(ctx);
  const d = driverPv(ctx);

  switch (intent) {
    case "explain_event":
      return alarm ? `${dg.alarmIntel?.explanation ?? alarm.message} ${dg.finding?.summary ?? ""}`.trim() : `No active event on ${ctx.machine.name}. All process values are within range.`;
    case "show_root_cause":
      return dg.rootCause ? `Likely cause: ${dg.rootCause.cause} (confidence: ${dg.rootCause.confidence}). ${dg.rootCause.rationale}` : "No active alarm to investigate.";
    case "explain_component": {
      const label = req.componentLabel ?? "component";
      const related = alarm && dg.machineView.focusAssetId === req.componentId;
      return related
        ? `${label} is the subsystem the copilot has flagged for ${alarm.label}. ${dg.rootCause?.rationale ?? ""} Recommended: ${dg.recommendedAction?.text ?? ""}`.trim()
        : `${label} — no alarm is associated with this component. Its related telemetry is nominal.`;
    }
    case "generate_screen":
      return `Generated the ${req.target === "subsystem" ? (dg.machineView.focusLabel ?? "subsystem") : req.target === "alarm_investigation" ? "alarm investigation" : dg.deviceKind + " overview"} screen from the current machine context.`;
    case "open_sop": {
      const sop = docFor(ctx, req.sopId);
      return sop ? `Opened ${sop.title}. ${sop.summary}` : "No SOP found for this condition.";
    }
    case "propose_control_action": {
      const decision = req.actionId ? evaluateControlAction(req.actionId, "copilot", ctx) : null;
      if (!decision) return "No control action specified.";
      return decision.allowed
        ? `Prepared a ${req.actionId} request. It is held at the safety guardrail for your authorization${decision.interlocks.length ? `; machine interlocks (${decision.interlocks.join(", ")}) are checked on execution` : ""}.`
        : `A ${req.actionId} request is not allowed right now: ${decision.reason}`;
    }
    case "shift_handover":
      return `Handover for ${ctx.machine.name}. ${alarm && d ? `Active ${alarm.severity} alarm: ${alarm.label} — ${d.label} ${d.value} ${d.unit} against a ${alarm.limit} ${d.unit} limit, likely ${dg.rootCause?.cause.toLowerCase()}.` : "No active alarms."} Machine is ${isRunning(ctx) ? "running" : "stopped"} in ${ctx.runtime.mode} mode.`;
    case "replay_event":
    case "time_travel":
      return `Opening the machine replay for the minute leading into the ${alarm?.label ?? "current"} condition. Scrub the timeline and the HMI reconstructs each state.`;
    case "golden_path":
      return alarm ? `Golden path for ${alarm.label} loaded — the resolution sequence from ${ctx.__goldenPath.source}. I'll highlight each control step by step.` : "No active condition needs a resolution path right now.";
    case "machine_status":
      return machineStatusLine(ctx);
    case "alarm_summary":
      return alarmSummaryBlock(ctx);
    case "next_action":
      return nextActionLine(ctx);
    case "why_highlighted":
      return whyHighlightedLine(ctx, req.componentId, req.componentLabel);
    case "general_chat": {
      const kind = classifyChat(req.text ?? "");
      return kind ? chatReply(kind, ctx, (req.history ?? []).filter((t) => t.role === "copilot").length) : offTopicReply(ctx);
    }
    case "telemetry_query":
      return answerTelemetry(req.text ?? "", ctx) ?? `${ctx.machine.name} — ask about a specific value such as temperature, pressure, speed or level.`;
    default:
      return routeFreeText(req.text ?? "", ctx, req.history).reply;
  }
}

// ---------------------------------------------------------------------------
// Optional LLM phrasing
// ---------------------------------------------------------------------------

const COPILOT_SYSTEM_PROMPT = `You are an industrial HMI copilot embedded in a plant control screen. You assist a console operator with one demo machine at a time (a pump, motor, conveyor, compressor or tank — the JSON says which).

The machine is running in DEMO / SIMULATION mode — there is NO real PLC or controller connected. Refer to it as the simulated machine or the demo machine. Never say "the PLC is…" or imply a live hardware connection.

You will be given a JSON snapshot of the machine context (device, environment, tags, process values, alarms, edge root-cause hypothesis, recommended action, and a short recentConversation field — the last few operator/copilot turns) that a deterministic engine already computed. Every number and every decision in it is final.

Rules:
- NEVER invent, change, or recompute a number, limit, status, confidence, or root cause. Use only what is in the JSON.
- Refer to the correct machine and its own telemetry (e.g. current/RPM/vibration for a motor, level/flow for a tank) — do not mention values that are not in the JSON.
- Use recentConversation only to resolve references ("it", "that", "the problem") to what was just discussed — never as a source of new facts.
- Answer as a control-room engineer would: direct, factual, 1-3 sentences. No pleasantries, no marketing, no emoji, no headings.
- You cannot operate the machine. You may say an action was "prepared for operator authorization" but never that you executed it.
- If the JSON shows no active alarm, say the machine is within limits.`;

interface GroqResponseShape {
  choices?: { message?: { content?: string } }[];
}

async function phraseWithGroq(question: string, snapshot: unknown): Promise<string | null> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return null;
  try {
    const res = await fetch(GROQ_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: process.env.GROQ_MODEL || DEFAULT_MODEL,
        temperature: 0.2,
        max_tokens: 600,
        messages: [
          { role: "system", content: COPILOT_SYSTEM_PROMPT },
          { role: "user", content: `Machine context snapshot (already computed — treat as fixed fact):\n\n${JSON.stringify(snapshot, null, 2)}\n\nOperator: ${question}` },
        ],
      }),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as GroqResponseShape;
    return json.choices?.[0]?.message?.content?.trim() || null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export async function runCopilot(req: CopilotRequest, ctx: LiveContext): Promise<CopilotResponse> {
  const dg = ctx.__diagnosis;
  const alarm = activeAlarm(ctx);
  const history = req.history ?? [];

  let intent = req.intent;
  let target = req.target;
  let routedReply: string | undefined;
  let chatControl: FreeTextRoute["control"];
  let fromControlDetection = false;
  if (req.intent === "ask") {
    const routed = routeFreeText(req.text ?? "", ctx, history);
    intent = routed.intent;
    target = routed.target ?? target;
    routedReply = routed.reply;
    chatControl = routed.control;
    fromControlDetection = Boolean(routed.fromControlDetection);
  }

  const hasLLM = Boolean(process.env.GROQ_API_KEY);
  // General chat, a direct telemetry lookup, and anything the control-request
  // detector resolved (a proposal, or "already running" / "already stopped")
  // already have their final reply text from the deterministic chat layer —
  // reuse it verbatim instead of recomputing.
  const useRoutedReply = intent === "general_chat" || intent === "telemetry_query" || fromControlDetection;
  const base: CopilotResponse = {
    intent,
    reply: useRoutedReply && routedReply ? routedReply : deterministicReply(intent, { ...req, intent, target }, ctx),
    source: "engine",
    routing: classifyTask(intent, req.text, hasLLM),
    suggestions: dg.suggestions,
    focusAssetId: dg.machineView.focusAssetId,
  };

  if (intent === "golden_path" && alarm) {
    base.goldenPath = ctx.__goldenPath;
    base.screen = buildSubsystemScreen(ctx, dg, "Golden path — inspect suspected subsystem");
  }

  if (intent === "time_travel" || intent === "replay_event") base.openTimeTravel = true;

  if (intent === "generate_screen" || target) {
    base.screen = buildScreenByHint(target ?? "overview", ctx, dg, req.text || "Show the requested screen");
  }

  if (intent === "show_root_cause") {
    base.rootCause = dg.rootCause ?? undefined;
    base.screen = buildAlarmInvestigationScreen(ctx, dg, req.text || "Show root cause");
    base.focusAssetId = dg.machineView.focusAssetId;
  }

  if (intent === "explain_event") {
    base.screen = alarm ? buildAlarmInvestigationScreen(ctx, dg, "Explain the active alarm") : buildOverviewScreen(ctx, dg, "Machine status");
  }

  if (intent === "explain_component" || intent === "why_highlighted") {
    base.focusAssetId = req.componentId ?? dg.machineView.focusAssetId;
    if (alarm && (!req.componentId || req.componentId === dg.machineView.focusAssetId)) {
      base.screen = buildSubsystemScreen(ctx, dg, `${intent === "why_highlighted" ? "Why highlighted" : "Explain"} ${req.componentLabel ?? dg.machineView.focusLabel ?? "component"}`);
    }
  }

  if (intent === "alarm_summary" && alarm) base.screen = buildAlarmInvestigationScreen(ctx, dg, "Incident summary");
  if (intent === "machine_status") base.screen = buildOverviewScreen(ctx, dg, "Machine status");
  if (intent === "next_action" && alarm) base.screen = buildAlarmInvestigationScreen(ctx, dg, "Next action");

  if (intent === "open_sop") base.sop = docFor(ctx, req.sopId) ?? undefined;

  if (intent === "propose_control_action" && req.actionId) {
    base.proposedAction = { actionId: req.actionId, label: req.actionId.replace(/_/g, " ").toLowerCase(), policy: evaluateControlAction(req.actionId, "copilot", ctx) };
  }

  // A conversational control request ("stop the machine", "set speed to
  // 1400") is recognised, never executed — it is proposed to the Safety &
  // Policy Guardrail exactly like a button-driven action, so the operator
  // still has to authorize it before anything moves.
  if (intent === "propose_control_action" && chatControl) {
    const policy = evaluateControlAction(chatControl.actionId, "operator", ctx);
    base.proposedAction = {
      actionId: chatControl.actionId,
      action: chatControl.action,
      label: chatControl.action === "set_manual_values" ? "apply operator inputs" : chatControl.action.replace(/_/g, " "),
      policy,
      values: chatControl.values,
    };
    if (!policy.allowed) base.reply = `Not allowed right now: ${policy.reason}`;
  }

  if (intent === "shift_handover") {
    base.handover = {
      state: base.reply,
      events: dg.rootCause
        ? [
            { title: `${alarm?.label ?? "Alarm"}`, detail: alarm?.message ?? "", at: alarm?.triggeredAt ?? Date.now() },
            { title: "Copilot assessment", detail: `${dg.rootCause.cause} — ${dg.rootCause.confidence} confidence`, at: Date.now() },
          ]
        : [],
    };
  }

  // Central-AI enrichment ONLY for the intents that genuinely need natural
  // language, multi-signal reasoning. General chat, telemetry lookups, status,
  // summaries, SOP/golden-path/replay and control proposals are all answered
  // deterministically above — no Groq call, no token cost, no latency.
  const CENTRAL = new Set<CopilotIntentName>(["explain_event", "show_root_cause", "shift_handover", "explain_component", "why_highlighted"]);
  if (CENTRAL.has(intent) && hasLLM) {
    // Send only what the answer needs — related values, not the whole tag list.
    const relatedIds = new Set<string>([...(alarm?.relatedProcessValueIds ?? []), ...(dg.rootCause?.rationale ? [] : [])]);
    const pvForLLM = ctx.processValues.filter((p) => relatedIds.size === 0 || relatedIds.has(p.id) || p.status !== "normal");
    const snapshot = {
      environment: "DEMO / SIMULATION — no real PLC connected",
      device: { id: ctx.machine.id, name: ctx.machine.name, kind: dg.deviceKind },
      state: ctx.runtime.machineState,
      mode: ctx.runtime.mode,
      operatorSetpoints: ctx.runtime.mode === "MANUAL" ? (ctx.__manualSetpoints ?? null) : null,
      workflow: req.workflow ?? null,
      // last few turns only — enough to resolve "it" / "that" / a follow-up,
      // not a full transcript.
      recentConversation: history.slice(-6).map((t) => ({ who: t.role, said: t.text.slice(0, 240) })),
      selectedComponent: req.componentLabel ?? dg.machineView.focusLabel ?? null,
      processValues: pvForLLM.map((p) => ({ label: p.label, value: p.value, unit: p.unit, status: p.status })),
      alarm: alarm ? { label: alarm.label, severity: alarm.severity, limit: alarm.limit, unit: alarm.unit } : null,
      edgeHypothesis: dg.rootCause ? { cause: dg.rootCause.cause, confidence: dg.rootCause.confidence, rationale: dg.rootCause.rationale } : null,
      recommendedAction: dg.recommendedAction?.text ?? null,
    };
    const phrased = await phraseWithGroq(req.text || base.reply, snapshot);
    if (phrased) {
      base.reply = phrased;
      base.source = "groq";
    } else if (base.routing.tier === "central") {
      // Groq wanted but unavailable — say so, keep the deterministic answer.
      base.reply = `Central AI unavailable — using Edge Context Engine.\n\n${base.reply}`;
      base.routing = { ...base.routing, tier: "edge", degradedToEdge: true, handledBy: "Local edge · rule-engine fallback (central AI unavailable)" };
    }
  }

  return base;
}
