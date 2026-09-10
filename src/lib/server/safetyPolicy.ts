/**
 * Safety & Policy Guardrail.
 *
 * The copilot can recommend actions and generate controls, but it never writes
 * to the machine directly. Every control action is evaluated here first:
 *
 *   AI / operator decision
 *     → Safety & Policy Guardrail   (this module — deterministic)
 *     → Operator Authorization      (explicit confirm in the HMI)
 *     → Machine interlocks / permissives (the process engine)
 *     → Approved control action
 *
 * These are DEMO / SIMULATION controls. This gate is an application-layer check
 * in front of the simulated control API; it does not replace any PLC-level
 * safety function.
 */

import type { MachineContext } from "@/lib/machineContext/model";

export type ActionSource = "operator" | "copilot";

export type ControlActionId =
  | "START"
  | "STOP"
  | "ACK"
  | "SET_MODE_AUTO"
  | "SET_MODE_MANUAL"
  | "RESOLVE"
  | "EMERGENCY_STOP"
  | "OPEN_INLET"
  | "CLOSE_INLET"
  | "OPEN_OUTLET"
  | "CLOSE_OUTLET";

export interface PolicyDecision {
  allowed: boolean;
  requiresOperatorAuth: boolean;
  reason: string;
  interlocks: string[];
}

function isRunning(ctx: MachineContext): boolean {
  return Boolean(ctx.tags.find((t) => t.id.endsWith(".RUN"))?.value);
}

export function evaluateControlAction(actionId: ControlActionId, source: ActionSource, ctx: MachineContext): PolicyDecision {
  const running = isRunning(ctx);
  const emergency = ctx.runtime.mode === "SAFE_MODE";
  const administrative = actionId === "ACK" || actionId === "SET_MODE_AUTO" || actionId === "SET_MODE_MANUAL";
  const isCritical = !administrative;

  if (administrative) {
    return {
      allowed: !(emergency && actionId !== "ACK"),
      requiresOperatorAuth: source === "copilot",
      reason:
        actionId === "ACK"
          ? "Alarm acknowledgement does not affect the process."
          : "Operating-mode change is administrative and does not move the machine.",
      interlocks: [],
    };
  }

  if (emergency && actionId !== "EMERGENCY_STOP") {
    return {
      allowed: false,
      requiresOperatorAuth: true,
      reason: "Machine is latched in Safe Mode. Clear the emergency stop at the panel before any control action.",
      interlocks: ["Emergency stop must be cleared at the panel"],
    };
  }

  if (actionId === "START" && running) {
    return { allowed: false, requiresOperatorAuth: true, reason: "Machine is already running.", interlocks: [] };
  }
  if (actionId === "STOP" && !running) {
    return { allowed: false, requiresOperatorAuth: true, reason: "Machine is already stopped.", interlocks: [] };
  }

  const interlocks: string[] = [];
  if (actionId === "START") interlocks.push("Suction / supply valve open", "No active emergency stop", "Drive overload healthy");
  if (actionId === "STOP") interlocks.push("Confirm downstream system can tolerate loss of output");
  if (/VALVE|INLET|OUTLET/.test(actionId)) interlocks.push("Confirm the change will not over-pressure or drain the vessel");

  return {
    allowed: true,
    requiresOperatorAuth: isCritical,
    reason:
      source === "copilot"
        ? "Copilot-proposed control action. Held for operator authorization; machine interlocks are checked on execution."
        : "Operator-initiated control action. Confirm to proceed; machine interlocks are checked on execution.",
    interlocks,
  };
}

export function describeGuardrailChain(): string[] {
  return [
    "AI / operator decision",
    "Safety & policy guardrail",
    "Operator authorization",
    "Machine interlocks & permissives",
    "Approved control action",
  ];
}
