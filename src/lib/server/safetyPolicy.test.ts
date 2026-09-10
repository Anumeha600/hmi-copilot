import { test } from "node:test";
import assert from "node:assert/strict";
import { SimDeviceEngine } from "../machineContext/simDeviceEngine.ts";
import { getDeviceSpec } from "../machineContext/deviceSpecs.ts";
import { evaluateControlAction, describeGuardrailChain } from "./safetyPolicy.ts";

const ctxOf = (id: string) => new SimDeviceEngine(getDeviceSpec(id)).buildContext(null);

test("copilot-proposed STOP is allowed but held for operator authorization", () => {
  const d = evaluateControlAction("STOP", "copilot", ctxOf("M-201"));
  assert.equal(d.allowed, true);
  assert.equal(d.requiresOperatorAuth, true);
});

test("operator STOP also requires explicit confirmation (critical action)", () => {
  assert.equal(evaluateControlAction("STOP", "operator", ctxOf("M-201")).requiresOperatorAuth, true);
});

test("acknowledging an alarm needs no authorization for the operator", () => {
  const d = evaluateControlAction("ACK", "operator", ctxOf("P-101"));
  assert.equal(d.allowed, true);
  assert.equal(d.requiresOperatorAuth, false);
});

test("tank valve moves are critical and guardrailed", () => {
  const d = evaluateControlAction("OPEN_OUTLET", "copilot", ctxOf("T-501"));
  assert.equal(d.allowed, true);
  assert.equal(d.requiresOperatorAuth, true);
  assert.ok(d.interlocks.length > 0);
});

test("START is rejected while the device is already running", () => {
  assert.equal(evaluateControlAction("START", "operator", ctxOf("P-101")).allowed, false);
});

test("no control other than clearing e-stop is allowed in Safe Mode", () => {
  const eng = new SimDeviceEngine(getDeviceSpec("P-101"));
  eng.triggerEmergencyStop("operator");
  const d = evaluateControlAction("START", "copilot", eng.buildContext(null));
  assert.equal(d.allowed, false);
  assert.match(d.reason, /safe mode/i);
});

test("guardrail chain: authorization sits between the guardrail and PLC interlocks", () => {
  const chain = describeGuardrailChain();
  const gi = chain.findIndex((c) => /guardrail/i.test(c));
  const oi = chain.findIndex((c) => /authorization/i.test(c));
  const ii = chain.findIndex((c) => /interlock/i.test(c));
  assert.ok(gi < oi && oi < ii);
});
