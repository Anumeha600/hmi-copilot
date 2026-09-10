import { test } from "node:test";
import assert from "node:assert/strict";
import { SimDeviceEngine } from "../machineContext/simDeviceEngine.ts";
import { getDeviceSpec } from "../machineContext/deviceSpecs.ts";
import { initSession } from "../machineContext/sessionState.ts";
import { runContextEngine, buildSubsystemScreen, buildAlarmInvestigationScreen, buildOverviewScreen } from "./contextEngine.ts";

const NOW = Date.parse("2026-09-11T10:00:00Z");
function rig(id: string) {
  const eng = new SimDeviceEngine(getDeviceSpec(id), initSession(NOW).devices[id], NOW);
  return { ctx: eng.buildContext("overview"), dg: eng.diagnose() };
}

test("context engine surfaces the current event and root cause per device", () => {
  for (const id of ["P-101", "M-201", "C-301", "CP-401", "T-501"]) {
    const { ctx, dg } = rig(id);
    const r = runContextEngine(ctx, dg);
    assert.equal(r.currentEvent?.alarmId, getDeviceSpec(id).alarm.id);
    assert.equal(r.rootCause?.cause, getDeviceSpec(id).rootCause.cause);
    assert.equal(r.deviceKind, getDeviceSpec(id).kind);
  }
});

test("default overview screen carries status, values, alarm banner and controls", () => {
  const { ctx, dg } = rig("P-101");
  const kinds = runContextEngine(ctx, dg).defaultScreen.widgets.map((w) => w.kind);
  assert.ok(["statusHeader", "valueGrid", "alarmBanner", "controlPair"].every((k) => kinds.includes(k)));
});

test("tank overview offers valve controls, not start/stop", () => {
  const { ctx, dg } = rig("T-501");
  const ctrl = buildOverviewScreen(ctx, dg, "test").widgets.find((w) => w.kind === "controlPair");
  assert.ok(ctrl && "primary" in ctrl);
  assert.match(ctrl.primary.actionId + ctrl.secondary.actionId, /OUTLET|INLET/);
});

test("subsystem screen focuses the alarm's suspected component and includes the SOP", () => {
  const { ctx, dg } = rig("CP-401");
  const screen = buildSubsystemScreen(ctx, dg, "show valve");
  assert.match(screen.screenTitle, /valve/i);
  assert.ok(screen.widgets.some((w) => w.kind === "sopExcerpt"));
});

test("alarm-investigation screen carries the root-cause panel", () => {
  const { ctx, dg } = rig("C-301");
  assert.ok(buildAlarmInvestigationScreen(ctx, dg, "investigate").widgets.some((w) => w.kind === "rootCausePanel"));
});

test("status header reflects machine state", () => {
  const spec = getDeviceSpec("P-101");
  const stopped = new SimDeviceEngine(spec, new SimDeviceEngine(spec, initSession(NOW).devices["P-101"], NOW).stop("operator").state, NOW + 10_000);
  const status = buildOverviewScreen(stopped.buildContext(null), stopped.diagnose(), "x").widgets.find((w) => w.kind === "statusHeader");
  assert.ok(status && "state" in status && status.state === "Stopped");
});
