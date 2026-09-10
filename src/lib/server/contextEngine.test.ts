import { test } from "node:test";
import assert from "node:assert/strict";
import { SimDeviceEngine } from "../machineContext/simDeviceEngine.ts";
import { getDeviceSpec } from "../machineContext/deviceSpecs.ts";
import { runContextEngine, buildSubsystemScreen, buildAlarmInvestigationScreen, buildOverviewScreen } from "./contextEngine.ts";

function rig(id: string) {
  const eng = new SimDeviceEngine(getDeviceSpec(id));
  return { ctx: eng.buildContext("overview"), dg: eng.diagnose() };
}

test("context engine surfaces the current event and root cause per device", () => {
  for (const id of ["P-101", "M-201", "C-301", "CP-401", "T-501"]) {
    const { ctx, dg } = rig(id);
    const r = runContextEngine(ctx, dg);
    assert.equal(r.currentEvent?.alarmId, getDeviceSpec(id).alarm.id);
    assert.equal(r.rootCause?.cause, getDeviceSpec(id).rootCause.cause);
    assert.equal(r.deviceKind, getDeviceSpec(id).kind);
    assert.ok(r.suggestions.length > 0);
  }
});

test("default overview screen carries status, values, alarm banner and controls", () => {
  const { ctx, dg } = rig("P-101");
  const screen = runContextEngine(ctx, dg).defaultScreen;
  assert.equal(screen.screenId, "overview");
  const kinds = screen.widgets.map((w) => w.kind);
  assert.ok(["statusHeader", "valueGrid", "alarmBanner", "controlPair"].every((k) => kinds.includes(k)));
});

test("tank overview offers valve controls, not start/stop", () => {
  const { ctx, dg } = rig("T-501");
  const screen = buildOverviewScreen(ctx, dg, "test");
  const ctrl = screen.widgets.find((w) => w.kind === "controlPair");
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
  const screen = buildAlarmInvestigationScreen(ctx, dg, "investigate");
  assert.equal(screen.screenId, "alarm-investigation");
  assert.ok(screen.widgets.some((w) => w.kind === "rootCausePanel"));
});

test("finding lists the driver over limit first", () => {
  const { ctx, dg } = rig("M-201");
  const r = runContextEngine(ctx, dg);
  assert.ok(r.finding);
  assert.match(r.finding.whatIFound[0], /above limit/i);
});
