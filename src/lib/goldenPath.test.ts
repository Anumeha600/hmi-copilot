import { test } from "node:test";
import assert from "node:assert/strict";
import { goldenPathStep } from "./goldenPath.ts";
import { DEVICE_SPECS, getDeviceSpec } from "./machineContext/deviceSpecs.ts";

test("every device has a golden path keyed to its own alarm", () => {
  for (const spec of DEVICE_SPECS) {
    assert.equal(spec.goldenPath.conditionId, spec.alarm.id);
    assert.ok(spec.goldenPath.steps.length >= 4);
  }
});

test("golden path steps are ordered and each highlights an HMI element", () => {
  for (const spec of DEVICE_SPECS) {
    spec.goldenPath.steps.forEach((s, i) => {
      assert.equal(s.n, i + 1);
      const h = s.highlight;
      assert.ok(h.widgetId || h.valueId || h.actionId, `${spec.id} step ${s.n} highlights nothing`);
    });
  }
});

test("pump golden path walks cooling → flow → temperature → acknowledge", () => {
  const p = getDeviceSpec("P-101").goldenPath;
  assert.match(p.steps[0].title, /cooling/i);
  assert.equal(p.steps[1].highlight.valueId, "coolingFlow");
  assert.equal(p.steps[p.steps.length - 1].highlight.actionId, "ACK");
});

test("motor golden path ends by acknowledging and involves stopping the motor", () => {
  const m = getDeviceSpec("M-201").goldenPath;
  assert.ok(m.steps.some((s) => s.highlight.actionId === "STOP"));
  assert.equal(m.steps[m.steps.length - 1].highlight.actionId, "ACK");
});

test("goldenPathStep clamps out-of-range indices to null", () => {
  const p = getDeviceSpec("P-101").goldenPath;
  assert.equal(goldenPathStep(p, 99), null);
  assert.equal(goldenPathStep(p, 0)?.n, 1);
});
