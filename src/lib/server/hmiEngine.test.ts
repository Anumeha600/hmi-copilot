import { test } from "node:test";
import assert from "node:assert/strict";
import { applyHmiAction, buildStreamPayload, buildCopilotContext } from "./hmiEngine.ts";
import { newSessionEncoded } from "./hmiEngine.ts";
import { getDeviceSpec } from "../machineContext/deviceSpecs.ts";

const NOW = Date.parse("2026-09-11T10:00:00Z");

/** Fresh session, switched to `deviceId`, in AUTO with the seeded incident resolved. */
function freshSession(deviceId: string, now = NOW): string {
  let s = newSessionEncoded(now);
  s = applyHmiAction({ action: "set_device", deviceId, session: s }, now).session!;
  return s;
}

test("run_incident: the action pipeline changes real machine state (alarm + telemetry)", () => {
  let s = freshSession("P-101");
  // resolve the seeded incident first so we can see run_incident bring it back
  s = applyHmiAction({ action: "resolve", source: "operator", authorized: true, session: s }, NOW).session!;
  const calm = buildStreamPayload(s, NOW + 40_000);
  assert.equal(calm.machineContext.alarms.length, 0, "resolved → no alarm");

  const res = applyHmiAction({ action: "run_incident", source: "operator", session: s }, NOW + 41_000);
  assert.equal(res.ok, true);
  assert.ok(res.session && res.session !== s, "run_incident returns a NEW session");
  assert.ok(res.payload, "run_incident returns a fresh payload");

  // alarm is active immediately in the returned payload
  assert.ok(res.payload!.machineContext.alarms.some((a) => a.state === "active"), "alarm active right after run_incident");
  // and the incident is still developing a few seconds later (driver PV climbing)
  const t0 = res.payload!.machineContext.processValues.find((p) => p.id === "temperature")!.value;
  const later = buildStreamPayload(res.session, NOW + 41_000 + 20_000);
  const t1 = later.machineContext.processValues.find((p) => p.id === "temperature")!.value;
  assert.ok(t1 > t0, `temperature keeps rising after run_incident (${t0} -> ${t1})`);
});

test("run_incident works for every device and names that device's own alarm", () => {
  for (const spec of ["P-101", "M-201", "C-301", "CP-401", "T-501"].map(getDeviceSpec)) {
    const s = freshSession(spec.id);
    const res = applyHmiAction({ action: "run_incident", source: "operator", session: s }, NOW);
    assert.equal(res.ok, true, spec.id);
    const alarm = res.payload!.machineContext.alarms.find((a) => a.state === "active");
    assert.ok(alarm, `${spec.id} → alarm present`);
    assert.equal(alarm!.id, spec.alarm.id, `${spec.id} → its own alarm`);
  }
});

test("set_manual_values: in-range inputs apply directly and become real telemetry", () => {
  let s = freshSession("P-101");
  s = applyHmiAction({ action: "set_mode", mode: "MANUAL", source: "operator", session: s }, NOW).session!;

  const res = applyHmiAction(
    { action: "set_manual_values", values: { temperature: 58, speed: 1460, pressure: 4.3, flow: 39 }, source: "operator", session: s },
    NOW + 1000
  );
  assert.equal(res.ok, true);
  assert.equal(res.needsAuth ?? false, false, "in-range → no authorization needed");

  const pv = res.payload!.machineContext.processValues;
  assert.equal(pv.find((p) => p.id === "temperature")!.value, 58);
  assert.equal(pv.find((p) => p.id === "speed")!.value, 1460);
  assert.equal(res.payload!.machineContext.runtime.mode, "MANUAL");

  // values HOLD (operator-controlled, sim does not evolve them)
  const held = buildStreamPayload(res.session, NOW + 60_000).machineContext.processValues;
  assert.equal(held.find((p) => p.id === "temperature")!.value, 58, "manual value holds over time");
});

test("set_manual_values: an out-of-safe-range value is held for the guardrail, then applies once authorized", () => {
  let s = freshSession("P-101");
  s = applyHmiAction({ action: "set_mode", mode: "MANUAL", source: "operator", session: s }, NOW).session!;

  // P-101 temperature limit is 65 °C — 92 is unsafe
  const blocked = applyHmiAction(
    { action: "set_manual_values", values: { temperature: 92 }, source: "operator", session: s },
    NOW + 1000
  );
  assert.equal(blocked.ok, false);
  assert.equal(blocked.needsAuth, true, "unsafe setpoint → needsAuth");
  assert.ok(blocked.policy?.requiresOperatorAuth);

  const authed = applyHmiAction(
    { action: "set_manual_values", values: { temperature: 92 }, source: "operator", authorized: true, session: s },
    NOW + 2000
  );
  assert.equal(authed.ok, true);
  assert.equal(authed.payload!.machineContext.processValues.find((p) => p.id === "temperature")!.value, 92);
  // 92 °C is above the 65 °C limit → the alarm engine raises the high-temperature alarm
  assert.ok(authed.payload!.machineContext.alarms.some((a) => a.state === "active"), "unsafe manual value raises the alarm");
});

test("set_manual_values: rejects NaN / Infinity with a validation error, never applies", () => {
  let s = freshSession("M-201");
  s = applyHmiAction({ action: "set_mode", mode: "MANUAL", source: "operator", session: s }, NOW).session!;
  for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
    const res = applyHmiAction({ action: "set_manual_values", values: { current: bad }, source: "operator", session: s }, NOW);
    assert.equal(res.ok, false, String(bad));
    assert.match(res.error ?? "", /valid number/i);
  }
});

test("manual setpoints reach the Copilot context for the current device", () => {
  let s = freshSession("M-201");
  s = applyHmiAction({ action: "set_mode", mode: "MANUAL", source: "operator", session: s }, NOW).session!;
  s = applyHmiAction(
    { action: "set_manual_values", values: { current: 12, rpm: 1470, torque: 90, temperature: 61 }, source: "operator", session: s },
    NOW + 1000
  ).session!;

  const ctx = buildCopilotContext(s, NOW + 5000);
  assert.equal(ctx.runtime.mode, "MANUAL");
  assert.equal(ctx.processValues.find((p) => p.id === "current")!.value, 12);
  assert.equal(ctx.__deviceId, "M-201");
  assert.ok(ctx.__manualSetpoints, "manual setpoints exposed to the copilot");
  assert.equal(ctx.__manualSetpoints!["Current"], 12);
});

test("AUTO → MANUAL preserves the current telemetry as the starting point (no reset)", () => {
  let s = freshSession("CP-401");
  // let the seeded incident develop a little in AUTO
  const before = buildStreamPayload(s, NOW + 25_000).machineContext.processValues.find((p) => p.id === "dischargePressure")!.value;
  // switch to MANUAL at that moment
  s = applyHmiAction({ action: "set_mode", mode: "MANUAL", source: "operator", session: s }, NOW + 25_000).session!;
  const after = buildStreamPayload(s, NOW + 25_500).machineContext.processValues.find((p) => p.id === "dischargePressure")!.value;
  assert.ok(Math.abs(after - before) <= 1.0, `MANUAL holds the value it had in AUTO (${before} -> ${after})`);
  // and it no longer drifts (operator has control)
  const stillLater = buildStreamPayload(s, NOW + 90_000).machineContext.processValues.find((p) => p.id === "dischargePressure")!.value;
  assert.ok(Math.abs(stillLater - after) <= 1.0, "MANUAL freezes the value until the operator changes it");
});

test("MANUAL → AUTO hands control back to the simulator without resetting the machine", () => {
  let s = freshSession("P-101");
  s = applyHmiAction({ action: "set_mode", mode: "MANUAL", source: "operator", session: s }, NOW).session!;
  s = applyHmiAction({ action: "set_manual_values", values: { temperature: 58, speed: 1455 }, source: "operator", session: s }, NOW + 1000).session!;
  // back to AUTO — starts from 58, not from a reset
  s = applyHmiAction({ action: "set_mode", mode: "AUTO", source: "operator", session: s }, NOW + 2000).session!;
  const t0 = buildStreamPayload(s, NOW + 2500).machineContext.processValues.find((p) => p.id === "temperature")!.value;
  assert.ok(t0 > 57 && t0 < 62, `AUTO resumes from the manual value (~58), got ${t0}`);
  // the simulator evolves it again (seeded incident still armed → climbs toward the fault target)
  const t1 = buildStreamPayload(s, NOW + 40_000).machineContext.processValues.find((p) => p.id === "temperature")!.value;
  assert.ok(t1 > t0, `simulator takes control again after AUTO (${t0} -> ${t1})`);
});

test("acknowledge sets the alarm's acknowledged flag without clearing it", () => {
  let s = freshSession("P-101");
  const before = buildStreamPayload(s, NOW + 5000).machineContext.alarms.find((a) => a.state === "active");
  assert.ok(before && before.acknowledged === false);
  s = applyHmiAction({ action: "acknowledge", source: "operator", session: s }, NOW + 6000).session!;
  const after = buildStreamPayload(s, NOW + 7000).machineContext.alarms.find((a) => a.state === "active");
  assert.ok(after, "alarm is still active after acknowledgement");
  assert.equal(after.acknowledged, true, "alarm now flagged acknowledged");
});

test("run_incident in MANUAL drives the abnormal condition through the operator setpoints", () => {
  let s = freshSession("P-101");
  s = applyHmiAction({ action: "set_mode", mode: "MANUAL", source: "operator", session: s }, NOW).session!;
  s = applyHmiAction({ action: "set_manual_values", values: { temperature: 55 }, source: "operator", session: s }, NOW + 1000).session!;

  const res = applyHmiAction({ action: "run_incident", source: "operator", session: s }, NOW + 2000);
  assert.equal(res.ok, true);
  assert.equal(res.payload!.machineContext.runtime.mode, "MANUAL", "stays in MANUAL");
  assert.ok(res.payload!.machineContext.alarms.some((a) => a.state === "active"), "MANUAL run_incident raises the alarm");
  const temp = res.payload!.machineContext.processValues.find((p) => p.id === "temperature")!.value;
  assert.ok(temp > 65, `driver PV pushed past its limit in MANUAL (${temp})`);
});
