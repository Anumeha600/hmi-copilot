/**
 * Copilot conversation layer — deterministic, edge-tier (no LLM, no network).
 *
 * This sits IN FRONT of the machine-reasoning router (`routeFreeText` in
 * copilotReasoner.ts) so that a free-text operator message is understood before
 * any Groq call is considered:
 *
 *   1. general chat      — "hi", "thanks", "what can you do", "tell me a joke"
 *                          → a natural reply, NEVER machine telemetry
 *   2. control request   — "stop the machine", "set speed to 1400"
 *                          → recognised and handed to the Safety & Policy
 *                            Guardrail; never executed here
 *   3. telemetry query   — "what's the temperature", "what is high"
 *                          → answered straight from the live MachineContext
 *   4. follow-up refs    — "what happened before that", "show me",
 *                          "which component" → resolved against the recent
 *                          conversation + the live context
 *
 * Machine numbers are only ever read from the context that a deterministic
 * engine already computed — nothing here invents a value.
 */

import type { DeviceDiagnosis, MachineContext, ProcessValue } from "@/lib/machineContext/model";
import type { CopilotIntentName, ScreenTarget } from "./copilotReasoner";
import type { ControlActionId } from "./safetyPolicy";

/** Lightweight conversation memory — the last few turns, client-supplied. */
export interface ChatTurn {
  role: "operator" | "copilot" | "system";
  text: string;
}

export type ChatContext = MachineContext & { __diagnosis?: DeviceDiagnosis };

/** A resolved free-text route. `reply` is filled here for chat/telemetry/control;
 *  for machine intents it may be left undefined and the reasoner phrases it. */
export interface ChatRoute {
  intent: CopilotIntentName;
  reply?: string;
  target?: ScreenTarget;
  /** control requests only — routed through the guardrail, never executed here */
  control?: {
    actionId: ControlActionId;
    /** the /api/hmi/action `action` string the client authorizes */
    action: string;
    values?: Record<string, number>;
  };
}

// ---------------------------------------------------------------------------
// shared helpers
// ---------------------------------------------------------------------------

function activeAlarm(ctx: MachineContext) {
  return ctx.alarms.find((a) => a.state === "active") ?? null;
}
function isRunning(ctx: MachineContext) {
  return Boolean(ctx.tags.find((t) => t.id.endsWith(".RUN"))?.value);
}

/** Words that mean "this is about the machine" — used to keep small talk and
 *  the machine domain apart. */
export const MACHINE_HINT =
  /\b(temp|temperature|pressure|current|amp|amps|amperage|rpm|speed|vibration|vibe|load|torque|level|flow|coolant|cooling|valve|alarm|fault|trip|interlock|run|running|stopp?ed|start|motor|pump|conveyor|compressor|tank|belt|jam|discharge|inlet|outlet|suction|setpoint|set ?point|sop|golden ?path|root ?cause|evidence|status|incident|overheat|overload|overcurrent|resolve|acknowledge)\b/i;

// ---------------------------------------------------------------------------
// 1. general chat
// ---------------------------------------------------------------------------

export type ChatKind = "greeting" | "thanks" | "bye" | "capabilities" | "identity" | "insult" | "joke" | "smalltalk";

const JOKES = [
  "Why did the motor apply for a job? It wanted to improve its current situation. 😄",
  "I asked the pressure transmitter to relax. It said it was already under a lot of tension.",
  "Why don't conveyor belts get promoted? They always take the path of least resistance.",
  "A centrifugal pump walks into a bar. Bartender: \"Why the long face?\" Pump: \"Low suction head.\"",
];

export function classifyChat(text: string): ChatKind | null {
  const q = text.trim().toLowerCase().replace(/[!.]+$/, "");
  if (!q) return null;
  const words = q.split(/\s+/).length;
  const machineish = MACHINE_HINT.test(q);

  if (!machineish && words <= 6 && /^(hi+|hey+|hello+|yo|hiya|howdy|sup|good (morning|afternoon|evening)|greetings|morning|evening)\b/.test(q))
    return "greeting";
  if (!machineish && /\b(thanks|thank you|thankyou|thx|ty|cheers|appreciate (it|that)|much appreciated|nice one|perfect thanks|great,? thanks|that helps)\b/.test(q))
    return "thanks";
  if (!machineish && words <= 7 && /\b(bye|goodbye|see ya|see you|catch you later|later|that'?s all|we'?re done|done for now|end of shift|signing off)\b/.test(q))
    return "bye";
  if (/(what can you do|what do you do|how can you help|what are you (able|capable) (to|of)|your capabilities|what can i ask|what else can you|help me out|^\/?help$|what are you for|how do you work|what do you know)/.test(q))
    return "capabilities";
  if (/\b(dumb|stupid|useless|idiot|moron|rubbish|garbage|trash|worthless|pointless|terrible)\b/.test(q) && (words <= 8 || /\byou\b/.test(q)))
    return "insult";
  if (/(who are you|what are you|are you (a )?(bot|ai|robot|real|human|person|chat ?gpt|gpt|llm|sentient|conscious|alive|there|awake|listening)|do you have a name|what'?s your name|are you a (machine|program))/.test(q))
    return "identity";
  if (/(tell me a joke|another joke|say something funny|make me laugh|know any jokes|got a joke|be funny)/.test(q))
    return "joke";
  if (!machineish && words <= 5 && /(how are you|how'?s it going|how do you do|you good|you ok|you there|what'?s up|whats up|nice|cool|great|awesome|got it|understood|makes sense|alright|okay|ok then|good (job|work|stuff)|well done|fair enough|no worries)/.test(q))
    return "smalltalk";
  return null;
}

export function chatReply(kind: ChatKind, ctx: MachineContext, copilotTurns = 0): string {
  const name = ctx.machine.name;
  switch (kind) {
    case "greeting":
      return `Hello! I'm your HMI Copilot. I'm on ${name} right now — ask me about its status, an alarm, a component, or what to do next.`;
    case "thanks":
      return "You're welcome.";
    case "bye":
      return "Take care — I'll keep watching the machine.";
    case "capabilities":
      return `I can check machine status and live values, explain alarms and components, work out the likely cause from the signals, walk you through the SOP or Golden Path, show what changed before an event, and route control requests through the Safety & Policy Guardrail. Right now I'm watching ${name}.`;
    case "identity":
      return `I'm the HMI Copilot — a conversational assistant built into this control screen. I reason about the active machine (${name}) from its live context, and I can chat too. Ask me about the machine, an alarm, a component, or your next step.`;
    case "insult":
      return "Hopefully not 😄 Try me — ask about the machine, an alarm, a component, or what you should do next.";
    case "joke":
      return JOKES[copilotTurns % JOKES.length];
    case "smalltalk":
      return `All good here — ${name} is on screen and I'm reading its context. What do you need?`;
  }
}

/** The gentle redirect for a clearly off-topic question we can't route. */
export function offTopicReply(ctx: MachineContext): string {
  return `That's outside my industrial HMI role, but I can help with ${ctx.machine.name} — its status, alarms, components, troubleshooting, and operator workflows.`;
}

// ---------------------------------------------------------------------------
// 2. deterministic telemetry answers
// ---------------------------------------------------------------------------

/** Extra words that point at a specific process value, keyed by PV id. */
const PV_TERMS: Record<string, string[]> = {
  temperature: ["temp", "temperature", "hot", "heat", "overheat", "thermal", "how hot"],
  pressure: ["pressure", "psi", "bar", "head"],
  dischargePressure: ["discharge pressure", "discharge", "delivery pressure", "pressure"],
  current: ["current", "amp", "amps", "amperage", "draw", "amperes"],
  voltage: ["voltage", "volt", "volts", "supply voltage"],
  rpm: ["rpm", "revs", "rotational speed", "rotation", "shaft speed", "speed"],
  speed: ["speed", "how fast", "rpm"],
  beltSpeed: ["belt speed", "belt", "conveyor speed", "line speed", "speed"],
  vibration: ["vibration", "vibe", "shake", "vibrating"],
  load: ["load", "loading", "duty", "how hard"],
  motorLoad: ["motor load", "drive load", "load"],
  torque: ["torque", "shaft torque"],
  level: ["level", "how full", "fill level", "tank level", "fill"],
  flow: ["flow", "flowrate", "flow rate", "throughput"],
  coolingFlow: ["cooling", "cooling flow", "cooling water", "cooling-water", "coolant", "cooling loop"],
  inletFlow: ["inlet flow", "incoming flow", "feed flow", "inflow"],
  outletFlow: ["outlet flow", "outgoing flow", "discharge flow", "outflow"],
  outletValve: ["outlet valve", "discharge valve"],
  inletValve: ["inlet valve", "feed valve", "suction valve"],
  jamSensor: ["jam", "jam sensor", "blockage", "jam switch", "jam detect"],
  productCount: ["product count", "count", "units produced", "pieces", "parts count"],
};

function matchPvs(q: string, ctx: MachineContext): ProcessValue[] {
  return ctx.processValues.filter((pv) => {
    const terms = [pv.label.toLowerCase(), ...(PV_TERMS[pv.id] ?? [])];
    return terms.some((t) => q.includes(t));
  });
}

function fmt(pv: ProcessValue): string {
  return pv.unit ? `${pv.value} ${pv.unit}` : String(pv.value);
}

function describePv(ctx: MachineContext, pv: ProcessValue): string {
  const name = ctx.machine.name;
  if (pv.unit === "" && (pv.normalHigh <= 1)) {
    return `${name} ${pv.label.toLowerCase()} is ${pv.value >= 1 ? "ACTIVE" : "clear"}.`;
  }
  const alarm = activeAlarm(ctx);
  if (pv.status !== "normal") {
    const above = pv.value > pv.normalHigh;
    if (alarm && alarm.processValueId === pv.id && alarm.limit != null) {
      return `${name} ${pv.label.toLowerCase()} is ${fmt(pv)}, ${above ? "above" : "below"} the ${alarm.limit} ${pv.unit} alarm limit — this is what the ${alarm.label} alarm is on.`;
    }
    const bound = above ? pv.limitHigh ?? pv.normalHigh : pv.limitLow ?? pv.normalLow;
    return `${name} ${pv.label.toLowerCase()} is ${fmt(pv)}, ${above ? "above" : "below"} the ${bound} ${pv.unit} ${above ? "limit" : "minimum"}.`;
  }
  return `${name} ${pv.label.toLowerCase()} is ${fmt(pv)} — within the normal ${pv.normalLow}–${pv.normalHigh} ${pv.unit} range.`;
}

/** Answer a direct value / "what is high" question, or return null to fall through. */
export function answerTelemetry(text: string, ctx: MachineContext): string | null {
  const q = text.trim().toLowerCase().replace(/[?.!]+$/, "");
  const name = ctx.machine.name;

  // "why" questions are causal (CAUSE category) — let the root-cause / explain
  // path handle them, even when they also mention a value like "temperature".
  if (/\bwhy\b/.test(q)) return null;

  // "what alarm is active", "is there an alarm", "what does this alarm mean" —
  // ALARM category: name the active alarm straight from context, no LLM.
  if (/(what('?s| is)? (the |any )?alarms?\b|which alarm|is there an alarm|any alarms?\??$|alarm status|what does (this|the|that) alarm mean|tell me about the alarm|describe the alarm)/.test(q)) {
    const a = activeAlarm(ctx);
    return a ? `${name} has an active ${a.severity} alarm — ${a.label}. ${a.message}` : `No active alarms on ${name}.`;
  }

  const abnormalAsk =
    /(what|which|anything|something).*(high|low|elevated|abnormal|wrong|off|out of range|out-of-range|not normal|concerning|alarming|bad|unusual)/.test(q) ||
    /^what('?s| is)? (high|wrong|abnormal|off|elevated)/.test(q) ||
    /\b(everything ok|all normal|anything i should worry|values? ok)\b/.test(q);
  if (abnormalAsk) {
    const abn = ctx.processValues.filter((p) => p.status !== "normal");
    if (abn.length === 0) return `All of ${name}'s process values are within range.`;
    if (abn.length === 1) return describePv(ctx, abn[0]);
    const drv = activeAlarm(ctx)?.processValueId;
    const lead = abn.find((p) => p.id === drv);
    return `${abn.length} values on ${name} are outside range: ${abn
      .map((p) => `${p.label.toLowerCase()} ${fmt(p)}`)
      .join(", ")}.${lead ? ` The ${lead.label.toLowerCase()} is the one the active alarm is on.` : " Which one do you want to look at?"}`;
  }

  // must look like a value question
  if (!/\b(what|whats|hows|how('?s| is| much| many)|is|are|show|give|tell|current|reading|value|at)\b/.test(q)) return null;

  const hits = matchPvs(q, ctx);
  if (hits.length === 0) return null;
  if (hits.length === 1) return describePv(ctx, hits[0]);

  const drv = activeAlarm(ctx)?.processValueId;
  const lead = hits.find((h) => h.id === drv);
  if (lead) return describePv(ctx, lead);
  // several plausible — answer the shortest-label match, note the others
  const primary = [...hits].sort((a, b) => a.label.length - b.label.length)[0];
  return `${describePv(ctx, primary)} (I can also give you ${hits.filter((h) => h !== primary).map((h) => h.label.toLowerCase()).join(", ")}.)`;
}

// ---------------------------------------------------------------------------
// 3. free-text control requests → Safety & Policy Guardrail
// ---------------------------------------------------------------------------

export function detectControlRequest(text: string, ctx: ChatContext): ChatRoute | null {
  const q = text.trim().toLowerCase();
  const name = ctx.machine.name;
  const running = isRunning(ctx);

  // "set / change <value> to <number>"
  const sp = q.match(/\b(?:set|change|adjust|make|put|bring|take|drive|move)\s+(?:the\s+)?([a-z][a-z \-]*?)\s+(?:to|at|=|up to|down to)\s*(-?\d+(?:\.\d+)?)/);
  if (sp) {
    const pv = matchPvs(sp[1].trim(), ctx)[0];
    const val = Number(sp[2]);
    if (!pv) {
      return { intent: "general_chat", reply: `I couldn't match "${sp[1].trim()}" to a process value on ${name}. Try temperature, pressure, speed, level or flow.` };
    }
    if (!Number.isFinite(val)) {
      return { intent: "general_chat", reply: `"${sp[2]}" isn't a valid number for ${pv.label.toLowerCase()}.` };
    }
    if (ctx.runtime.mode !== "MANUAL") {
      return {
        intent: "general_chat",
        reply: `${pv.label} is simulator-controlled while ${name} is in ${ctx.runtime.mode} mode. Switch to MANUAL, then set ${pv.label.toLowerCase()} in the Operator Inputs panel — or ask again in MANUAL and I'll route it through the guardrail.`,
      };
    }
    const outside = val > (pv.limitHigh ?? pv.normalHigh) || val < (pv.limitLow ?? pv.normalLow);
    return {
      intent: "propose_control_action",
      control: { actionId: "SET_MANUAL_SETPOINT", action: "set_manual_values", values: { [pv.id]: val } },
      reply: `Preparing a manual setpoint — ${pv.label} → ${val} ${pv.unit}. It goes to the Safety & Policy Guardrail for your authorization${
        outside ? "; this value is outside the safe operating range, so the machine will alarm at it." : "."
      }`,
    };
  }

  const targetsMachine = /\b(machine|pump|motor|conveyor|compressor|belt|drive|unit|system|it|this|everything|now)\b/.test(q);

  if (/\b(emergency stop|e-?stop|slam it|hit the estop|trip it)\b/.test(q)) {
    return {
      intent: "propose_control_action",
      control: { actionId: "EMERGENCY_STOP", action: "emergency_stop" },
      reply: `Routing an EMERGENCY STOP for ${name} to the guardrail — authorize it to latch the machine into Safe Mode.`,
    };
  }
  if (/\b(stop|shut ?down|shutdown|halt|switch off|turn off|power off|kill|take .* offline|bring .* down)\b/.test(q) && targetsMachine) {
    if (!running) return { intent: "machine_status", reply: `${name} is already stopped.` };
    return {
      intent: "propose_control_action",
      control: { actionId: "STOP", action: "device_stop" },
      reply: `Routing a STOP request for ${name} to the Safety & Policy Guardrail — authorize it in the dialog; machine interlocks are checked on execution.`,
    };
  }
  if (/\b(start|run it|turn on|switch on|power up|spin up|bring .* online|restart|get .* going)\b/.test(q) && targetsMachine) {
    if (running) return { intent: "machine_status", reply: `${name} is already running in ${ctx.runtime.mode} mode.` };
    return {
      intent: "propose_control_action",
      control: { actionId: "START", action: "device_start" },
      reply: `Routing a START request for ${name} to the guardrail — authorize it and the start permissives are checked on execution.`,
    };
  }
  if (/\b(increase|decrease|raise|lower|bump|reduce|ramp|turn (it )?(up|down)|speed (it )?up|slow (it )?down|more|less)\b/.test(q) && MACHINE_HINT.test(q)) {
    return {
      intent: "general_chat",
      reply: `To change a setpoint, switch ${name} to MANUAL and use the Operator Inputs panel, or give me an exact target (e.g. "set speed to 1400") and I'll route it through the guardrail.`,
    };
  }
  return null;
}

// ---------------------------------------------------------------------------
// 4. follow-up reference resolution ("that", "it", "show me", "which component")
// ---------------------------------------------------------------------------

export function resolveFollowUp(text: string, ctx: ChatContext, history: ChatTurn[]): ChatRoute | null {
  const q = text.trim().toLowerCase().replace(/[?.!]+$/, "");
  const words = q.split(/\s+/).length;
  const alarm = activeAlarm(ctx);
  const focusLabel = ctx.__diagnosis?.machineView.focusLabel ?? null;
  const lastCopilot = [...history].reverse().find((t) => t.role === "copilot")?.text ?? "";

  // "which component / part is responsible / causing this / involved"
  if (/\b(which|what)\b.*\b(component|part|asset|subsystem|equipment|section)\b/.test(q) || /^which (one|part|bit)\b/.test(q)) {
    if (alarm && focusLabel) {
      return {
        intent: "why_highlighted",
        reply: `The ${alarm.label} alarm is attributed to the ${focusLabel}. Ask "why is it highlighted?" for the evidence, or "show me" to focus it on the machine.`,
      };
    }
    return { intent: "machine_status", reply: `No component is flagged — ${ctx.machine.name} has no active alarm.` };
  }

  // "show me" / "show it" / "show that" / "pull it up" / "take me there"
  if (/^(show|display|pull up|bring up|take me (to|there)|go to|focus|zoom (in|to)|point (it|me) (out|at))\b/.test(q) && words <= 6) {
    if (focusLabel) {
      return { intent: "generate_screen", target: "subsystem", reply: `Showing the ${focusLabel.toLowerCase()} on the machine — the related values and the SOP for this condition.` };
    }
    return { intent: "generate_screen", target: "overview", reply: `Showing the ${ctx.machine.name} overview.` };
  }

  // bare "why" / "why is that" / "why though" — inherit the current investigation
  if (/^(why|why is (that|it|this)|why though|how come|and why)$/.test(q)) {
    if (alarm) return { intent: "explain_event" };
  }

  // "is it still running / stopped / on / ok" — pronoun → the machine
  if (/^(is|are|it'?s)\b/.test(q) && /\b(still|currently|right now|now)\b/.test(q) && /\b(run|running|stopp?ed|on|off|going|ok|okay|fine|alarming)\b/.test(q)) {
    return { intent: "machine_status" };
  }

  // "what about before that / what happened before / earlier"
  if (/\b(before (that|this|it)|earlier|prior to (that|this|it)|leading up|what (led|happened) up)\b/.test(q) && words <= 9) {
    return { intent: "time_travel" };
  }

  // "what should I do (about that / now)" with only a pronoun for context
  if (/^(what (should|do) i (do|check)|what now|next step|and then|so what do i do)\b/.test(q) && words <= 8) {
    return { intent: "next_action" };
  }

  // "can you explain that / explain it" — inherit last topic
  if (/^(can you )?(explain|clarify|expand on|tell me more( about)?|go on|elaborate)( that| it| this| more)?$/.test(q)) {
    if (/component|coupling|motor|valve|bearing|sensor|line|belt/i.test(lastCopilot)) return { intent: "explain_component" };
    if (alarm) return { intent: "explain_event" };
  }

  return null;
}
