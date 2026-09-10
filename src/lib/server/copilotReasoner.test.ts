import { test } from "node:test";
import assert from "node:assert/strict";
import { SimDeviceEngine } from "../machineContext/simDeviceEngine.ts";
import { getDeviceSpec } from "../machineContext/deviceSpecs.ts";
import { initSession } from "../machineContext/sessionState.ts";
import { runCopilot } from "./copilotReasoner.ts";

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

test("no Groq key → every answer is deterministic (source: engine)", async () => {
  delete process.env.GROQ_API_KEY;
  for (const intent of ["explain_event", "show_root_cause", "machine_status", "alarm_summary", "next_action"] as const) {
    const r = await runCopilot({ intent }, liveCtx("M-201"));
    assert.equal(r.source, "engine", `${intent}`);
    assert.ok(r.reply.length > 0);
  }
});

test("central-tier intents show the edge-fallback note when Groq is unavailable", async () => {
  delete process.env.GROQ_API_KEY;
  const r = await runCopilot({ intent: "explain_event" }, liveCtx("P-101"));
  // classifyTask marks it degradedToEdge; the reply keeps the deterministic finding
  assert.equal(r.routing.tier, "edge");
  assert.equal(r.routing.degradedToEdge, true);
  assert.match(r.reply, /temperature/i);
});

test("machine_status answers with the current device, not a hard-coded pump", async () => {
  const r = await runCopilot({ intent: "machine_status" }, liveCtx("C-301"));
  assert.match(r.reply, /Transfer Conveyor C-301/);
  assert.match(r.reply, /Belt Jam/i);
});

test("alarm_summary is a compact FINDING/CAUSE/EVIDENCE block", async () => {
  const r = await runCopilot({ intent: "alarm_summary" }, liveCtx("CP-401"));
  assert.match(r.reply, /FINDING/);
  assert.match(r.reply, /LIKELY CAUSE/);
  assert.match(r.reply, /RECOMMENDED ACTION/);
  assert.equal(r.screen?.screenId, "alarm-investigation");
});

test("free-text routing recognises status / summary / resolve / replay", async () => {
  assert.equal((await runCopilot({ intent: "ask", text: "is it running or stopped?" }, liveCtx("P-101"))).intent, "machine_status");
  assert.equal((await runCopilot({ intent: "ask", text: "give me a quick summary" }, liveCtx("P-101"))).intent, "alarm_summary");
  assert.equal((await runCopilot({ intent: "ask", text: "how do I resolve this?" }, liveCtx("P-101"))).intent, "golden_path");
  assert.equal((await runCopilot({ intent: "ask", text: "what happened before the alarm?" }, liveCtx("P-101"))).intent, "time_travel");
  assert.equal((await runCopilot({ intent: "ask", text: "show me the pump controls" }, liveCtx("P-101"))).intent, "generate_screen");
});

test("why_highlighted explains the flagged component and focuses it", async () => {
  const spec = getDeviceSpec("M-201");
  const r = await runCopilot(
    { intent: "why_highlighted", componentId: spec.alarm.focusAssetId, componentLabel: spec.alarm.focusLabel },
    liveCtx("M-201")
  );
  assert.match(r.reply, /highlighted because/i);
  assert.equal(r.focusAssetId, spec.alarm.focusAssetId);
});

test("explain_component for an unrelated component says it is not the flagged one", async () => {
  const r = await runCopilot({ intent: "why_highlighted", componentId: "M-201-CS", componentLabel: "Current Sensor" }, liveCtx("M-201"));
  assert.match(r.reply, /not the flagged component/i);
});

test("explain/why always return focusAssetId = the requested component (so the UI can pin the machine view to it)", async () => {
  for (const intent of ["explain_component", "why_highlighted"] as const) {
    const onAlarm = await runCopilot({ intent, componentId: "M-201-COUPLING", componentLabel: "Coupling / Driven Load" }, liveCtx("M-201"));
    assert.equal(onAlarm.focusAssetId, "M-201-COUPLING", `${intent} on the alarm component`);
    assert.ok(onAlarm.screen, `${intent} on the alarm component generates a subsystem screen`);

    // a component that is NOT the alarm focus still gets focusAssetId pointed at it
    const offAlarm = await runCopilot({ intent, componentId: "M-201-CS", componentLabel: "Current Sensor" }, liveCtx("M-201"));
    assert.equal(offAlarm.focusAssetId, "M-201-CS", `${intent} on a non-alarm component`);
  }
});

test("proposed control actions still return a guardrail decision, never execute", async () => {
  const r = await runCopilot({ intent: "propose_control_action", actionId: "STOP" }, liveCtx("P-101"));
  assert.ok(r.proposedAction);
  assert.equal(r.proposedAction.policy.requiresOperatorAuth, true);
});

test("golden_path returns the current device's path", async () => {
  const r = await runCopilot({ intent: "golden_path" }, liveCtx("T-501"));
  assert.equal(r.goldenPath?.conditionId, "HIGH_LEVEL");
});
