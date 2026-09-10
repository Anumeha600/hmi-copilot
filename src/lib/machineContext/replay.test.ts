import { test } from "node:test";
import assert from "node:assert/strict";
import { frameToContext, frameDiagnosis, clockOf, type StateFrame } from "./replay.ts";
import { getDeviceSpec } from "./deviceSpecs.ts";
import { buildOverviewScreen } from "../server/contextEngine.ts";

function pumpFrame(temp: number, alarmed: boolean): StateFrame {
  const t = Date.parse("2026-09-10T10:24:12Z");
  return {
    t,
    clock: clockOf(t),
    deviceId: "P-101",
    running: true,
    mode: "AUTO",
    values: { temperature: temp, pressure: 4.2, flow: 38, speed: 1450, coolingFlow: 7.6 },
    alarm: alarmed ? { id: "HIGH_TEMPERATURE", label: "High Temperature", severity: "high", limit: 65, unit: "°C" } : null,
    activeScreenId: "overview",
    note: null,
  };
}

const spec = getDeviceSpec("P-101");

test("a pre-alarm frame reconstructs a screen with no alarm banner", () => {
  const screen = buildOverviewScreen(frameToContext(pumpFrame(55, false), spec), frameDiagnosis(pumpFrame(55, false), spec), "replay");
  assert.ok(!screen.widgets.some((w) => w.kind === "alarmBanner"));
});

test("a post-alarm frame reconstructs a screen WITH the alarm banner", () => {
  const f = pumpFrame(72, true);
  const screen = buildOverviewScreen(frameToContext(f, spec), frameDiagnosis(f, spec), "replay");
  assert.ok(screen.widgets.some((w) => w.kind === "alarmBanner"));
});

test("reconstructed temperature value matches the recorded frame", () => {
  const ctx = frameToContext(pumpFrame(67, false), spec);
  assert.equal(ctx.processValues.find((p) => p.id === "temperature")!.value, 67);
});

test("temperature crossing the limit flips the process-value status to high", () => {
  assert.equal(frameToContext(pumpFrame(55, false), spec).processValues.find((p) => p.id === "temperature")!.status, "normal");
  assert.equal(frameToContext(pumpFrame(72, true), spec).processValues.find((p) => p.id === "temperature")!.status, "high");
});

test("frames carry the device id and a HH:MM:SS clock", () => {
  const f = pumpFrame(70, true);
  assert.equal(f.deviceId, "P-101");
  assert.match(clockOf(f.t), /^\d{2}:\d{2}:\d{2}$/);
});
