import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyTask, idleRouting } from "./taskRouter.ts";

test("simple tasks stay on the local edge", () => {
  assert.equal(classifyTask("generate_screen", undefined, true).tier, "edge");
  assert.equal(classifyTask("open_sop", undefined, true).tier, "edge");
  assert.equal(classifyTask("propose_control_action", undefined, true).tier, "edge");
});

test("complex reasoning routes to central AI when an LLM is configured", () => {
  const r = classifyTask("show_root_cause", "why did this happen", true);
  assert.equal(r.tier, "central");
  assert.match(r.task, /root-cause/i);
});

test("complex reasoning falls back to edge when no LLM is configured", () => {
  const r = classifyTask("show_root_cause", undefined, false);
  assert.equal(r.tier, "edge");
  assert.equal(r.degradedToEdge, true);
});

test("free-text 'why' questions route central", () => {
  assert.equal(classifyTask("ask", "why is the pump overheating?", true).tier, "central");
  assert.equal(classifyTask("ask", "show me the pump status", true).tier, "edge");
});

test("idle routing reflects whether an alarm is active", () => {
  assert.match(idleRouting(true, false).task, /Alarm mapping/i);
  assert.match(idleRouting(false, false).task, /monitoring/i);
});

test("status / summary / next-action intents stay on the edge (no Groq)", () => {
  for (const i of ["machine_status", "alarm_summary", "next_action", "golden_path", "time_travel"] as const) {
    assert.equal(classifyTask(i, undefined, true).tier, "edge", `${i} should be edge`);
  }
});

test("component explanation routes central when an LLM is available, else edge", () => {
  assert.equal(classifyTask("why_highlighted", undefined, true).tier, "central");
  assert.equal(classifyTask("explain_component", undefined, true).tier, "central");
  assert.equal(classifyTask("why_highlighted", undefined, false).tier, "edge");
});
