import { test } from "node:test";
import assert from "node:assert/strict";
import { DEVICE_SPECS, DEVICE_IDS, getDeviceSpec } from "./deviceSpecs.ts";
import { SimDeviceEngine } from "./simDeviceEngine.ts";
import { initSession } from "./sessionState.ts";

const NOW = Date.parse("2026-09-11T10:00:00Z");
function eng(id: string, patch = {}, now = NOW) {
  const ds = { ...initSession(now).devices[id], ...patch };
  return new SimDeviceEngine(getDeviceSpec(id), ds, now);
}

test("five demo devices with distinct kinds", () => {
  assert.equal(DEVICE_SPECS.length, 5);
  assert.deepEqual([...DEVICE_IDS].sort(), ["C-301", "CP-401", "M-201", "P-101", "T-501"]);
  assert.deepEqual([...new Set(DEVICE_SPECS.map((d) => d.kind))].sort(), ["Compressor", "Conveyor", "Motor", "Pump", "Tank"]);
});

test("no two devices share the same telemetry shape", () => {
  const shapes = DEVICE_SPECS.map((d) => d.processValues.map((p) => p.id).sort().join(","));
  assert.equal(new Set(shapes).size, 5);
});

test("each device seeds a reproducible incident above/below its own limit", () => {
  for (const spec of DEVICE_SPECS) {
    const e = eng(spec.id);
    const alarm = e.buildContext(null).alarms.find((a) => a.state === "active");
    assert.ok(alarm, `${spec.id} should seed an active alarm`);
    assert.equal(alarm.id, spec.alarm.id);
  }
});

test("simulation is deterministic — same session + clock gives the same values", () => {
  const a = eng("P-101").buildContext(null).processValues.map((p) => p.value);
  const b = eng("P-101").buildContext(null).processValues.map((p) => p.value);
  assert.deepEqual(a, b);
});

test("diagnosis names the device's own root cause + recommended action", () => {
  for (const spec of DEVICE_SPECS) {
    const dg = eng(spec.id).diagnose();
    assert.equal(dg.deviceKind, spec.kind);
    assert.equal(dg.rootCause?.cause, spec.rootCause.cause);
    assert.equal(dg.recommendedAction?.text, spec.recommendedAction);
    assert.equal(dg.machineView.focusAssetId, spec.alarm.focusAssetId);
  }
});

test("STOP → device stops, telemetry decays; START → runs again (full cycle)", () => {
  const spec = getDeviceSpec("P-101");
  const running = eng("P-101").toState();

  const stopped = new SimDeviceEngine(spec, running, NOW).stop("operator").state;
  const afterStop = new SimDeviceEngine(spec, stopped, NOW + 80_000);
  assert.equal(afterStop.machineState(), "STOPPED");
  assert.ok(afterStop.buildContext(null).processValues.find((p) => p.id === "flow")!.value < 5);

  const started = new SimDeviceEngine(spec, afterStop.toState(), NOW + 80_000).start("operator").state;
  const justStarted = new SimDeviceEngine(spec, started, NOW + 80_500);
  assert.equal(justStarted.machineState(), "STARTING");
  const running2 = new SimDeviceEngine(spec, started, NOW + 90_000);
  assert.equal(running2.machineState(), "RUNNING");
  // flow eases back up from a standstill — climbing, and near nominal after ~a minute
  assert.ok(running2.buildContext(null).processValues.find((p) => p.id === "flow")!.value > 5);
  const settled = new SimDeviceEngine(spec, started, NOW + 150_000);
  assert.ok(settled.buildContext(null).processValues.find((p) => p.id === "flow")!.value > 30);
});

test("START while running is rejected; STOP while stopped is rejected", () => {
  const spec = getDeviceSpec("M-201");
  const running = eng("M-201").toState();
  assert.equal(new SimDeviceEngine(spec, running, NOW).start("operator").ok, false);
  const stopped = new SimDeviceEngine(spec, running, NOW).stop("operator").state;
  assert.equal(new SimDeviceEngine(spec, stopped, NOW).stop("operator").ok, false);
});

test("resolve clears the fault and the alarm recovers", () => {
  const spec = getDeviceSpec("M-201");
  const resolved = eng("M-201").resolve("operator").state;
  const later = new SimDeviceEngine(spec, resolved, NOW + 60_000);
  assert.equal(later.buildContext(null).alarms.length, 0);
});

test("run_incident re-arms the fault after it was resolved", () => {
  const spec = getDeviceSpec("C-301");
  const resolved = eng("C-301").resolve("operator").state;
  const armed = new SimDeviceEngine(spec, resolved, NOW + 30_000).armIncident().state;
  const later = new SimDeviceEngine(spec, armed, NOW + 90_000);
  assert.ok(later.buildContext(null).alarms.some((a) => a.state === "active"));
});

test("STOP button is enabled only when running; START only when stopped", () => {
  const spec = getDeviceSpec("P-101");
  const running = eng("P-101");
  const ra = running.buildContext(null).operatorActions;
  assert.equal(ra.find((a) => a.id === "STOP")!.enabled, true);
  assert.equal(ra.find((a) => a.id === "START")!.enabled, false);

  const stopped = new SimDeviceEngine(spec, running.stop("operator").state, NOW + 5000);
  const sa = stopped.buildContext(null).operatorActions;
  assert.equal(sa.find((a) => a.id === "STOP")!.enabled, false);
  assert.equal(sa.find((a) => a.id === "START")!.enabled, true);
});
