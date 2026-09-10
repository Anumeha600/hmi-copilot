import { test } from "node:test";
import assert from "node:assert/strict";
import { DEVICE_SPECS, DEVICE_IDS, getDeviceSpec } from "./deviceSpecs.ts";
import { SimDeviceEngine } from "./simDeviceEngine.ts";

test("five demo devices with distinct kinds", () => {
  assert.equal(DEVICE_SPECS.length, 5);
  assert.deepEqual(DEVICE_IDS.sort(), ["C-301", "CP-401", "M-201", "P-101", "T-501"]);
  assert.deepEqual([...new Set(DEVICE_SPECS.map((d) => d.kind))].sort(), ["Compressor", "Conveyor", "Motor", "Pump", "Tank"]);
});

test("no two devices share the same telemetry shape", () => {
  const shapes = DEVICE_SPECS.map((d) => d.processValues.map((p) => p.id).sort().join(","));
  assert.equal(new Set(shapes).size, 5, "device telemetry sets must all differ");
});

test("each device seeds a reproducible incident above/below its own limit", () => {
  for (const spec of DEVICE_SPECS) {
    const eng = new SimDeviceEngine(spec);
    const ctx = eng.buildContext(null);
    const alarm = ctx.alarms.find((a) => a.state === "active");
    assert.ok(alarm, `${spec.id} should seed an active alarm`);
    assert.equal(alarm.id, spec.alarm.id);
    const driver = ctx.processValues.find((p) => p.id === spec.alarm.driverPvId)!;
    if (spec.alarm.direction === "high") assert.ok(driver.value >= alarm.limit!);
    else assert.ok(driver.value <= alarm.limit!);
  }
});

test("each device's diagnosis names its own root cause and recommended action", () => {
  for (const spec of DEVICE_SPECS) {
    const dg = new SimDeviceEngine(spec).diagnose();
    assert.equal(dg.deviceKind, spec.kind);
    assert.equal(dg.rootCause?.cause, spec.rootCause.cause);
    assert.equal(dg.recommendedAction?.text, spec.recommendedAction);
    assert.equal(dg.machineView.focusAssetId, spec.alarm.focusAssetId);
    assert.equal(dg.suggestions.length, spec.suggestions.length);
  }
});

test("resolving the fault clears the alarm and telemetry recovers", () => {
  const eng = new SimDeviceEngine(getDeviceSpec("M-201"));
  eng.resolve("operator");
  for (let i = 0; i < 60; i++) eng.tick();
  const ctx = eng.buildContext(null);
  assert.equal(ctx.alarms.length, 0);
  assert.ok(ctx.processValues.find((p) => p.id === "current")!.value < 16);
});

test("stopping a device drives its telemetry toward the stopped state", () => {
  const eng = new SimDeviceEngine(getDeviceSpec("P-101"));
  eng.stop("operator");
  for (let i = 0; i < 80; i++) eng.tick();
  const ctx = eng.buildContext(null);
  assert.equal(Boolean(ctx.tags.find((t) => t.id.endsWith(".RUN"))?.value), false);
  assert.ok(ctx.processValues.find((p) => p.id === "flow")!.value < 5);
});
