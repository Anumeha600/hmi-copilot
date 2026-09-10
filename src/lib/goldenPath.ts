/**
 * Golden Path guidance.
 *
 * For a recurring machine condition, the "golden path" is the preferred
 * sequence of actions that has resolved it before — compiled from the SOP and
 * the recorded resolution sequences used on previous shifts.
 *
 * Each step names an element of the generated HMI to highlight, so a
 * less-experienced operator is walked through the actual controls. The per-device
 * paths live in `lib/machineContext/deviceSpecs.ts`.
 */

export interface GoldenPathStep {
  n: number;
  title: string;
  instruction: string;
  highlight: {
    /** id of a widget in the current HmiScreenDefinition */
    widgetId?: string;
    /** a process-value id inside a valueGrid widget */
    valueId?: string;
    /** an operator action id (control / acknowledge button) */
    actionId?: string;
    /** an asset id to focus in the machine view */
    machineAsset?: string;
  };
  /** If set, the copilot switches the dynamic HMI to this screen before the step. */
  screen?: "overview" | "subsystem" | "alarm_investigation";
}

export interface GoldenPath {
  conditionId: string;
  title: string;
  source: string;
  priorResolutions: number;
  steps: GoldenPathStep[];
}

export function goldenPathStep(path: GoldenPath, index: number): GoldenPathStep | null {
  return path.steps[index] ?? null;
}
