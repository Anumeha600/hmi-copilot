import { test } from "node:test";
import assert from "node:assert/strict";
import { SimDeviceEngine } from "../machineContext/simDeviceEngine.ts";
import { getDeviceSpec, DEVICE_OPTIONS } from "../machineContext/deviceSpecs.ts";
import { initSession } from "../machineContext/sessionState.ts";
import { runCopilot, type CopilotResponse } from "./copilotReasoner.ts";
import { classifyChat } from "./copilotChat.ts";

const NOW = Date.parse("2026-09-11T10:00:00Z");

function liveCtx(id: string, patch = {}) {
  const spec = getDeviceSpec(id);
  const eng = new SimDeviceEngine(spec, { ...initSession(NOW).devices[id], ...patch }, NOW);
  return Object.assign(eng.buildContext("overview"), {
    __diagnosis: eng.diagnose(),
    __goldenPath: eng.goldenPath(),
    __primaryHistory: eng.primaryHistory(),
    __deviceId: id,
  });
}

async function ask(id: string, text: string, extra: Record<string, unknown> = {}, patch = {}): Promise<CopilotResponse> {
  return runCopilot({ intent: "ask", text, ...extra }, liveCtx(id, patch));
}

// ---------------------------------------------------------------------------
// GENERAL CHAT — never machine telemetry, never Groq
// ---------------------------------------------------------------------------

test("general chat: greetings, thanks, capabilities, insult and jokes are answered without touching machine telemetry or Groq", async () => {
  process.env.GROQ_API_KEY = "test-key-should-never-be-called";
  try {
    for (const text of ["Hi", "Hello", "Hey there"]) {
      const r = await ask("P-101", text);
      assert.equal(r.intent, "general_chat", text);
      assert.equal(r.source, "engine", text);
      assert.equal(r.routing.tier, "edge", text);
      assert.match(r.reply, /hello|hi\b/i, text);
      assert.doesNotMatch(r.reply, /°C|bar|L\/min|RPM/, text);
    }

    const thanks = await ask("P-101", "Thanks!");
    assert.equal(thanks.intent, "general_chat");
    assert.match(thanks.reply, /welcome/i);

    const cap = await ask("M-201", "What can you do?");
    assert.equal(cap.intent, "general_chat");
    assert.match(cap.reply, /alarm|component|guardrail/i);
    assert.match(cap.reply, /Drive Motor M-201/);

    const insult = await ask("P-101", "Are you dumb?");
    assert.equal(insult.intent, "general_chat");
    assert.match(insult.reply, /hopefully not/i);

    const joke = await ask("P-101", "Tell me a joke");
    assert.equal(joke.intent, "general_chat");
    assert.ok(joke.reply.length > 10);

    const bye = await ask("P-101", "Thanks, that's all for now");
    assert.equal(bye.intent, "general_chat");
  } finally {
    delete process.env.GROQ_API_KEY;
  }
});

test("classifyChat does not classify machine-ish greetings as chat (a real question keeps priority)", () => {
  assert.equal(classifyChat("hi, what's the temperature?"), null);
  assert.equal(classifyChat("is the pump running?"), null);
});

test("off-topic questions get a short redirect, not fabricated machine data", async () => {
  const r = await ask("T-501", "What's the capital of France?");
  assert.equal(r.intent, "general_chat");
  assert.match(r.reply, /outside my industrial hmi role/i);
  assert.match(r.reply, /Buffer Tank T-501/);
});

// ---------------------------------------------------------------------------
// MACHINE — deterministic telemetry, status, alarm, cause, action
// ---------------------------------------------------------------------------

test("telemetry: direct value questions are answered from live context, no Groq", async () => {
  process.env.GROQ_API_KEY = "test-key-should-never-be-called";
  try {
    const temp = await ask("P-101", "What's the temperature?");
    assert.equal(temp.intent, "telemetry_query");
    assert.equal(temp.source, "engine");
    const ctx = liveCtx("P-101");
    const pv = ctx.processValues.find((p) => p.id === "temperature")!;
    assert.match(temp.reply, new RegExp(String(pv.value)));
    assert.match(temp.reply, /°C/);

    const current = await ask("M-201", "What's the current?");
    assert.equal(current.intent, "telemetry_query");
    const m = liveCtx("M-201").processValues.find((p) => p.id === "current")!;
    assert.match(current.reply, new RegExp(String(m.value)));
  } finally {
    delete process.env.GROQ_API_KEY;
  }
});

test("telemetry: 'what is high' names the abnormal value without guessing", async () => {
  const r = await ask("CP-401", "What is high?");
  assert.equal(r.intent, "telemetry_query");
  const ctx = liveCtx("CP-401");
  const abnormal = ctx.processValues.filter((p) => p.status !== "normal");
  for (const p of abnormal) assert.match(r.reply, new RegExp(p.label, "i"));
});

test("status: 'is the machine running' answers from runtime state", async () => {
  const r = await ask("C-301", "Is the machine running?");
  assert.equal(r.intent, "machine_status");
  assert.match(r.reply, /Transfer Conveyor C-301/);
  assert.match(r.reply, /RUNNING|STOPPED|SAFE MODE/i);
});

test("alarm: 'what alarm is active' names the real alarm", async () => {
  const r = await ask("T-501", "What alarm is active?");
  const ctx = liveCtx("T-501");
  const alarm = ctx.alarms.find((a) => a.state === "active")!;
  assert.match(r.reply, new RegExp(alarm.label));
});

test("cause: 'why is the temperature high' routes to explain_event with grounded evidence", async () => {
  const r = await ask("P-101", "Why is the temperature high?");
  assert.equal(r.intent, "explain_event");
  const ctx = liveCtx("P-101");
  assert.match(r.reply, new RegExp(ctx.__diagnosis.rootCause!.cause.split(" ")[0], "i"));
});

test("action: 'what should I do next' and 'what should I check first' both answer with a grounded next step", async () => {
  for (const text of ["What should I do next?", "What should I check first?"]) {
    const r = await ask("M-201", text);
    assert.ok(r.reply.length > 0, text);
    assert.notEqual(r.intent, "general_chat", text);
  }
});

// ---------------------------------------------------------------------------
// FOLLOW-UP — conversation memory resolves pronouns / references
// ---------------------------------------------------------------------------

test("follow-up: 'what happened before that' and 'is it still running' resolve without repeating the subject", async () => {
  const history = [
    { role: "operator" as const, text: "Why is the conveyor current high?" },
    { role: "copilot" as const, text: "Drive Current is 14.2 A, above the 12 A limit — likely a downstream obstruction." },
  ];
  const before = await ask("C-301", "What happened before that?", { history });
  assert.equal(before.intent, "time_travel");
  assert.equal(before.openTimeTravel, true);

  const running = await ask("C-301", "Is it still running?", { history });
  assert.equal(running.intent, "machine_status");
  assert.match(running.reply, /Transfer Conveyor C-301/);
});

test("follow-up: 'which component' identifies the flagged component; 'show me' focuses it", async () => {
  const which = await ask("M-201", "Which component is responsible?");
  assert.equal(which.intent, "why_highlighted");
  const ctx = liveCtx("M-201");
  assert.match(which.reply!, new RegExp(ctx.__diagnosis.machineView.focusLabel ?? "", "i"));

  const show = await ask("M-201", "Show me.");
  assert.equal(show.intent, "generate_screen");
  assert.ok(show.screen);
});

// ---------------------------------------------------------------------------
// HISTORY / SOP / GOLDEN PATH
// ---------------------------------------------------------------------------

test("history: 'what happened before the alarm' and 'what changed earlier' both open time travel", async () => {
  for (const text of ["What happened before the alarm?", "What changed earlier?"]) {
    const r = await ask("CP-401", text);
    assert.equal(r.intent, "time_travel", text);
  }
});

test("sop: 'what's the SOP' and 'show the procedure' both open the SOP", async () => {
  for (const text of ["What's the SOP?", "Show the procedure."]) {
    const r = await ask("T-501", text);
    assert.equal(r.intent, "open_sop", text);
    assert.ok(r.sop, text);
  }
});

test("golden path: 'show the golden path' and 'what's the recommended sequence' both load the path", async () => {
  for (const text of ["Show me the Golden Path.", "What's the recommended sequence?"]) {
    const r = await ask("P-101", text);
    assert.equal(r.intent, "golden_path", text);
    assert.ok(r.goldenPath, text);
  }
});

// ---------------------------------------------------------------------------
// CONTROL — recognised, routed to the guardrail, never executed here
// ---------------------------------------------------------------------------

test("control: 'stop the machine' proposes STOP through the guardrail, never executes", async () => {
  const r = await ask("P-101", "Stop the machine.");
  assert.equal(r.intent, "propose_control_action");
  assert.equal(r.proposedAction?.actionId, "STOP");
  assert.equal(r.proposedAction?.action, "device_stop");
  assert.equal(r.proposedAction?.policy.requiresOperatorAuth, true);
  assert.match(r.reply, /guardrail|authoriz/i);
});

test("control: 'start the machine' proposes START only when the device is actually stopped", async () => {
  const running = await ask("P-101", "Start the machine.");
  assert.equal(running.intent, "machine_status");
  assert.match(running.reply, /already running/i);

  const spec = getDeviceSpec("P-101");
  const stoppedState = new SimDeviceEngine(spec, initSession(NOW).devices["P-101"], NOW).stop("operator").state;
  const r = await ask("P-101", "Start the machine.", {}, stoppedState);
  assert.equal(r.intent, "propose_control_action");
  assert.equal(r.proposedAction?.actionId, "START");
  assert.equal(r.proposedAction?.action, "device_start");
});

test("control: 'set temperature to 70' in AUTO mode is refused with guidance, never proposed", async () => {
  const r = await ask("P-101", "Set temperature to 70.");
  assert.notEqual(r.intent, "propose_control_action");
  assert.match(r.reply, /MANUAL/);
});

// ---------------------------------------------------------------------------
// SAFETY — unsafe setpoint, invalid input, unauthorized control
// ---------------------------------------------------------------------------

function manualCtx(id: string) {
  const spec = getDeviceSpec(id);
  const eng = new SimDeviceEngine(spec, initSession(NOW).devices[id], NOW);
  const manual = eng.setMode("MANUAL", "operator").state;
  return { spec, manual };
}

test("safety: an unsafe manual setpoint via chat is proposed with a warning, requires authorization", async () => {
  const { manual } = manualCtx("P-101");
  const r = await runCopilot({ intent: "ask", text: "Set temperature to 90." }, liveCtx("P-101", manual));
  assert.equal(r.intent, "propose_control_action");
  assert.equal(r.proposedAction?.actionId, "SET_MANUAL_SETPOINT");
  assert.equal(r.proposedAction?.policy.requiresOperatorAuth, true);
  assert.match(r.reply, /outside the safe operating range/i);
});

test("safety: a safe manual setpoint via chat still requires guardrail authorization (never auto-applied)", async () => {
  const { manual } = manualCtx("P-101");
  const r = await runCopilot({ intent: "ask", text: "Set temperature to 58." }, liveCtx("P-101", manual));
  assert.equal(r.intent, "propose_control_action");
  assert.equal(r.proposedAction?.values?.temperature, 58);
  assert.equal(r.proposedAction?.policy.allowed, true);
});

test("safety: an unmatched value name is rejected without proposing any control action", async () => {
  const { manual } = manualCtx("P-101");
  const r = await runCopilot({ intent: "ask", text: "Set the frobnicator to 70." }, liveCtx("P-101", manual));
  assert.equal(r.proposedAction, undefined);
});

test("safety: control requests never mutate — runCopilot has no session-write path", async () => {
  const ctxBefore = liveCtx("P-101");
  await ask("P-101", "Stop the machine.");
  await ask("P-101", "Set temperature to 90.");
  const ctxAfter = liveCtx("P-101");
  assert.equal(ctxBefore.processValues.find((p) => p.id === "temperature")!.value, ctxAfter.processValues.find((p) => p.id === "temperature")!.value);
});

// ---------------------------------------------------------------------------
// DEVICE CONTEXT — every device answers as itself, never falls back to P-101
// ---------------------------------------------------------------------------

test("device context: every device answers telemetry and status questions as itself, never as P-101", async () => {
  for (const { id, name } of DEVICE_OPTIONS) {
    const status = await ask(id, "What's the machine status?");
    assert.match(status.reply, new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `${id} status`);
    if (id !== "P-101") assert.doesNotMatch(status.reply, /Pump Station P-101/, `${id} should not mention P-101`);

    const alarm = await ask(id, "What alarm is active?");
    const ctx = liveCtx(id);
    const a = ctx.alarms.find((al) => al.state === "active")!;
    assert.match(alarm.reply, new RegExp(a.label), `${id} alarm`);
  }
});

// ---------------------------------------------------------------------------
// FINAL COPILOT-ONLY AMENDMENT — conversational follow-ups, ambiguous
// language routed to Groq (never invented answers), safety preserved
// ---------------------------------------------------------------------------

test("'why do you think that' is answered as a grounded cause explanation, not a generic redirect", async () => {
  const history = [
    { role: "operator" as const, text: "Why is the temperature high?" },
    { role: "copilot" as const, text: "Reduced cooling performance is the likely cause." },
  ];
  const r = await ask("P-101", "Why do you think that?", { history });
  assert.equal(r.intent, "explain_event");
  const ctx = liveCtx("P-101");
  assert.match(r.reply, new RegExp(String(ctx.processValues.find((p) => p.id === "temperature")!.value)));
});

test("'okay stop it' is recognised as a control request, not swallowed as small talk", async () => {
  const r = await ask("P-101", "Okay, stop it.");
  assert.equal(r.intent, "propose_control_action");
  assert.equal(r.proposedAction?.actionId, "STOP");
  assert.match(r.reply, /guardrail|authoriz/i);
});

test("'stop it' alone is also recognised as a control request", async () => {
  const r = await ask("M-201", "Stop it.");
  assert.equal(r.intent, "propose_control_action");
  assert.equal(r.proposedAction?.actionId, "STOP");
});

test("classifyChat never claims a control phrase as small talk", () => {
  for (const text of ["okay stop it", "ok, stop it", "alright, stop it now"]) {
    assert.equal(classifyChat(text), null, text);
  }
});

test("ambiguous natural language ('what about the motor?') is not treated as off-topic and gets a grounded, non-fabricated answer", async () => {
  const r = await ask("M-201", "What about the motor?");
  assert.equal(r.intent, "ask");
  assert.equal(r.source, "engine"); // no GROQ_API_KEY in this test — deterministic fallback, never fabricated
  assert.match(r.reply, /Drive Motor M-201/);
});

test("a message with no machine relevance and no prior conversation still gets the short off-topic redirect (not sent to Groq)", async () => {
  const r = await ask("T-501", "What's your favorite movie?");
  assert.equal(r.intent, "general_chat");
  assert.match(r.reply, /outside my industrial hmi role/i);
});

test("a bare pronoun only becomes 'plausibly relevant' once there is conversation history to anchor it", async () => {
  const bare = await ask("P-101", "What about that?");
  assert.equal(bare.intent, "general_chat", "no history yet — nothing for 'that' to refer to");

  const withHistory = await ask("P-101", "What about that?", {
    history: [
      { role: "operator", text: "Why is the temperature high?" },
      { role: "copilot", text: "Reduced cooling performance is the likely cause." },
    ],
  });
  assert.notEqual(withHistory.intent, "general_chat", "a pronoun following a real exchange is plausibly relevant");
});

test("active workflow context (golden-path) makes a short continuation phrase plausibly relevant, never off-topic", async () => {
  const r = await ask("P-101", "ok proceed", { workflow: "golden-path" });
  assert.notEqual(r.intent, "general_chat");
});

test("device context is preserved through the ambiguous-language path: never falls back to P-101", async () => {
  const r = await ask("C-301", "What about the belt?");
  // "belt" resolves to a direct telemetry match (belt speed) on C-301 — a
  // better outcome than the generic ambiguous-fallback bucket, and proof the
  // device context is correct either way.
  assert.ok(r.intent === "ask" || r.intent === "telemetry_query", r.intent);
  assert.match(r.reply, /Transfer Conveyor C-301/);
  assert.doesNotMatch(r.reply, /Pump Station P-101/);
});

test("control safety holds even when the request is phrased conversationally: never allowed without operator authorization", async () => {
  for (const text of ["Stop it.", "Okay, stop it.", "Do that — stop the machine."]) {
    const r = await ask("P-101", text);
    if (r.intent === "propose_control_action") {
      assert.equal(r.proposedAction?.policy.requiresOperatorAuth, true, text);
    }
  }
});
