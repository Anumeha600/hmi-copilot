"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type { HmiStreamPayload } from "@/lib/server/hmiEngine";
import type { HmiScreenDefinition } from "@/lib/hmiSchema";
import type { CopilotIntentName, CopilotResponse, ScreenTarget } from "@/lib/server/copilotReasoner";
import type { ControlActionId, PolicyDecision } from "@/lib/server/safetyPolicy";
import type { GoldenPath } from "@/lib/goldenPath";
import type { ReplayData, StateFrame } from "@/lib/machineContext/replay";
import type { DeviceOption } from "@/lib/machineContext/model";

const RECONNECT_MS = 3000;

export type ConnectionStatus = "connecting" | "connected" | "disconnected";

export interface ConversationTurn {
  role: "operator" | "copilot" | "system";
  text: string;
  at: number;
  routing?: CopilotResponse["routing"];
  source?: "engine" | "groq";
}

export interface HighlightTarget {
  widgetId?: string;
  valueId?: string;
  actionId?: string;
  machineAsset?: string;
}

export interface PendingAction {
  action: string;
  actionId: ControlActionId;
  label: string;
  policy: PolicyDecision;
  opts?: { mode?: "AUTO" | "MANUAL"; valveId?: string };
}

export interface SelectedComponent {
  id: string;
  label: string;
}

export interface Toast {
  text: string;
  tone: "ok" | "warn" | "info";
}

/** Which Copilot action panel is currently open — drives the action-button active styling. */
export type ActivePanel = "investigation" | "root-cause" | "sop" | "golden-path" | "replay" | null;

interface HmiCopilotValue {
  connection: ConnectionStatus;
  payload: HmiStreamPayload | null;
  devices: DeviceOption[];
  activeDeviceId: string;

  conversation: ConversationTurn[];
  copilotBusy: boolean;
  busyLabel: string | null;
  lastResponse: CopilotResponse | null;

  screen: HmiScreenDefinition | null;
  screenSource: "engine" | "copilot" | "replay";
  highlight: HighlightTarget | null;
  machineFocusAsset: string | null;

  goldenPath: GoldenPath | null;
  goldenStep: number;

  replay: ReplayData | null;
  replayT: number | null;
  replayFrame: StateFrame | null;
  replayPlaying: boolean;

  pendingAction: PendingAction | null;
  selectedComponent: SelectedComponent | null;
  activePanel: ActivePanel;
  toast: Toast | null;

  ask: (text: string) => Promise<void>;
  sendIntent: (intent: CopilotIntentName, extra?: { target?: ScreenTarget; sopId?: string; actionId?: ControlActionId; componentId?: string; componentLabel?: string }) => Promise<void>;
  runControl: (action: string, opts?: { mode?: "AUTO" | "MANUAL"; valveId?: string }) => Promise<void>;
  authorizePending: () => Promise<void>;
  cancelPending: () => void;

  goldenNext: () => void;
  goldenPrev: () => void;
  goldenExit: () => void;

  openTimeTravel: () => Promise<void>;
  scrub: (t: number) => Promise<void>;
  exitTimeTravel: () => void;
  replayPlayPause: () => void;
  replayStepEvent: (dir: 1 | -1) => void;

  setDevice: (id: string) => Promise<void>;
  selectComponent: (id: string, label: string) => void;
  clearComponent: () => void;
  explainComponent: (id: string, label: string) => Promise<void>;
  toggleInvestigate: () => void;
  showOnMachine: (assetId?: string | null) => void;
  runIncident: () => Promise<void>;
}

const Ctx = createContext<HmiCopilotValue | null>(null);

const ACTION_TO_ID: Record<string, ControlActionId> = {
  device_start: "START",
  device_stop: "STOP",
  acknowledge: "ACK",
  resolve: "RESOLVE",
  emergency_stop: "EMERGENCY_STOP",
};

const BUSY_LABEL: Partial<Record<CopilotIntentName, string>> = {
  explain_event: "Analyzing machine context…",
  show_root_cause: "Correlating signals…",
  golden_path: "Preparing Golden Path…",
  time_travel: "Reconstructing machine state…",
  open_sop: "Loading SOP…",
  generate_screen: "Adapting HMI…",
  explain_component: "Reading component context…",
  ask: "Investigating…",
  shift_handover: "Compiling handover…",
};

export function HmiCopilotProvider({ children }: { children: ReactNode }) {
  const [connection, setConnection] = useState<ConnectionStatus>("connecting");
  const [payload, setPayload] = useState<HmiStreamPayload | null>(null);
  const [devices, setDevices] = useState<DeviceOption[]>([]);
  const [activeDeviceId, setActiveDeviceId] = useState("P-101");

  const [conversation, setConversation] = useState<ConversationTurn[]>([]);
  const [copilotBusy, setCopilotBusy] = useState(false);
  const [busyLabel, setBusyLabel] = useState<string | null>(null);
  const [lastResponse, setLastResponse] = useState<CopilotResponse | null>(null);

  const [screen, setScreen] = useState<HmiScreenDefinition | null>(null);
  const [screenSource, setScreenSource] = useState<"engine" | "copilot" | "replay">("engine");
  const [highlight, setHighlight] = useState<HighlightTarget | null>(null);
  const [machineFocusAsset, setMachineFocusAsset] = useState<string | null>(null);

  const [goldenPath, setGoldenPath] = useState<GoldenPath | null>(null);
  const [goldenStep, setGoldenStep] = useState(0);

  const [replay, setReplay] = useState<ReplayData | null>(null);
  const [replayT, setReplayT] = useState<number | null>(null);
  const [replayFrame, setReplayFrame] = useState<StateFrame | null>(null);
  const [replayPlaying, setReplayPlaying] = useState(false);

  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const [selectedComponent, setSelectedComponent] = useState<SelectedComponent | null>(null);
  const [activePanel, setActivePanel] = useState<ActivePanel>(null);
  const [toast, setToast] = useState<Toast | null>(null);

  const esRef = useRef<EventSource | null>(null);
  const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const screenLockedRef = useRef(false);
  const playRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const toastRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flashToast = useCallback((text: string, tone: Toast["tone"] = "info") => {
    setToast({ text, tone });
    if (toastRef.current) clearTimeout(toastRef.current);
    toastRef.current = setTimeout(() => setToast(null), 2800);
  }, []);

  // ---- SSE ----
  useEffect(() => {
    let cancelled = false;
    function connect() {
      if (cancelled) return;
      const es = new EventSource("/api/hmi/stream");
      esRef.current = es;
      es.onopen = () => !cancelled && setConnection("connected");
      es.onmessage = (e) => {
        if (cancelled) return;
        try {
          const p = JSON.parse(e.data) as HmiStreamPayload;
          setPayload(p);
          setDevices(p.devices);
          setActiveDeviceId(p.deviceId);
          setConnection("connected");
          if (!screenLockedRef.current) {
            setScreen(p.context.defaultScreen);
            setScreenSource("engine");
            setMachineFocusAsset(p.context.machineView.focusAssetId);
          }
        } catch {
          /* skip malformed frame */
        }
      };
      es.onerror = () => {
        es.close();
        if (cancelled) return;
        setConnection("disconnected");
        reconnectRef.current = setTimeout(connect, RECONNECT_MS);
      };
    }
    connect();
    return () => {
      cancelled = true;
      esRef.current?.close();
      if (reconnectRef.current) clearTimeout(reconnectRef.current);
      if (playRef.current) clearInterval(playRef.current);
      if (toastRef.current) clearTimeout(toastRef.current);
    };
  }, []);

  // ---- apply a copilot response ----
  const applyResponse = useCallback(
    (res: CopilotResponse & { replay?: ReplayData }) => {
      setLastResponse(res);
      setConversation((c) => [...c, { role: "copilot", text: res.reply, at: Date.now(), routing: res.routing, source: res.source }]);

      if (res.screen) {
        screenLockedRef.current = true;
        setScreen(res.screen);
        setScreenSource("copilot");
      }
      if (res.focusAssetId !== undefined && res.focusAssetId !== null) setMachineFocusAsset(res.focusAssetId);

      // Reconcile which action panel is "active" with what the response actually opened.
      if (res.goldenPath) setActivePanel("golden-path");
      else if (res.openTimeTravel) setActivePanel("replay");
      else if (res.intent === "show_root_cause") setActivePanel("root-cause");
      else if (res.intent === "explain_event") setActivePanel("investigation");
      else if (res.intent === "open_sop" && res.sop) setActivePanel("sop");
      else if (res.intent === "golden_path" && !res.goldenPath) setActivePanel((p) => (p === "golden-path" ? null : p));

      if (res.goldenPath) {
        setGoldenPath(res.goldenPath);
        setGoldenStep(0);
        const step0 = res.goldenPath.steps[0];
        setHighlight(step0?.highlight ?? null);
        if (step0?.highlight.machineAsset) setMachineFocusAsset(step0.highlight.machineAsset);
      }
      if (res.openTimeTravel && res.replay) {
        setReplay(res.replay);
        const last = res.replay.frames[res.replay.frames.length - 1];
        setReplayT(last?.t ?? null);
        setReplayFrame(last ?? null);
      }
    },
    []
  );

  const postCopilot = useCallback(
    async (intent: CopilotIntentName, extra?: Record<string, unknown>) => {
      setCopilotBusy(true);
      setBusyLabel(BUSY_LABEL[intent] ?? "Working…");
      try {
        const r = await fetch("/api/copilot", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ intent, ...extra }) });
        const json = (await r.json()) as CopilotResponse & { replay?: ReplayData; ok: boolean };
        if (!json.ok) throw new Error("copilot error");
        applyResponse(json);
      } catch {
        setConversation((c) => [...c, { role: "copilot", text: "Copilot request could not be completed. Current machine context is still live.", at: Date.now() }]);
      } finally {
        setCopilotBusy(false);
        setBusyLabel(null);
      }
    },
    [applyResponse]
  );

  const ask = useCallback(
    async (text: string) => {
      const t = text.trim();
      if (!t) return;
      setConversation((c) => [...c, { role: "operator", text: t, at: Date.now() }]);
      await postCopilot("ask", { text: t });
    },
    [postCopilot]
  );

  const sendIntent = useCallback(
    async (intent: CopilotIntentName, extra?: { target?: ScreenTarget; sopId?: string; actionId?: ControlActionId; componentId?: string; componentLabel?: string }) => {
      const labels: Partial<Record<CopilotIntentName, string>> = {
        explain_event: "Explain the active alarm",
        show_root_cause: "Show the root cause",
        golden_path: "How do I resolve this?",
        time_travel: "What happened before this alarm?",
        open_sop: "Open the SOP for this condition",
        generate_screen: "Show me the controls I need",
        shift_handover: "Prepare a shift handover",
      };
      if (labels[intent]) setConversation((c) => [...c, { role: "operator", text: labels[intent]!, at: Date.now() }]);
      // Optimistic active-panel switch so the button styling updates immediately;
      // applyResponse() reconciles it with what actually opened.
      const optimistic: Partial<Record<CopilotIntentName, ActivePanel>> = {
        show_root_cause: "root-cause",
        open_sop: "sop",
        golden_path: "golden-path",
        explain_event: "investigation",
        time_travel: "replay",
      };
      if (optimistic[intent] !== undefined) setActivePanel(optimistic[intent]!);
      await postCopilot(intent, extra);
    },
    [postCopilot]
  );

  // ---- machine control (through the guardrail) ----
  const runControl = useCallback(
    async (action: string, opts?: { mode?: "AUTO" | "MANUAL"; valveId?: string }) => {
      const r = await fetch("/api/hmi/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, source: "operator", ...opts }),
      });
      const json = (await r.json()) as { ok: boolean; needsAuth?: boolean; policy?: PolicyDecision; error?: string; feedback?: string };
      if (json.needsAuth && json.policy) {
        const actionId: ControlActionId = action === "valve" ? ((opts?.valveId as ControlActionId) ?? "OPEN_OUTLET") : (ACTION_TO_ID[action] ?? "STOP");
        setPendingAction({ action, actionId, label: action.replace(/_/g, " "), policy: json.policy, opts });
      } else if (json.ok) {
        flashToast(`ACTION AUTHORIZED · ${json.feedback ?? "done"}`, "ok");
      } else if (json.policy && !json.policy.allowed) {
        flashToast(`ACTION BLOCKED · ${json.error ?? json.policy.reason}`, "warn");
      } else {
        flashToast(`ACTION BLOCKED · ${json.error ?? "not permitted"}`, "warn");
      }
    },
    [flashToast]
  );

  const authorizePending = useCallback(async () => {
    if (!pendingAction) return;
    const r = await fetch("/api/hmi/action", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: pendingAction.action, source: "operator", authorized: true, ...pendingAction.opts }),
    });
    const json = (await r.json()) as { ok: boolean; feedback?: string; error?: string };
    setPendingAction(null);
    flashToast(json.ok ? `ACTION AUTHORIZED · ${json.feedback ?? "done"}` : `ACTION BLOCKED · ${json.error ?? "not permitted"}`, json.ok ? "ok" : "warn");
  }, [pendingAction, flashToast]);

  const cancelPending = useCallback(() => setPendingAction(null), []);

  // ---- golden path ----
  const applyGoldenStep = useCallback(
    (path: GoldenPath, index: number) => {
      const step = path.steps[index];
      if (!step) return;
      setHighlight(step.highlight);
      if (step.highlight.machineAsset) setMachineFocusAsset(step.highlight.machineAsset);
      if (step.screen) void postCopilot("generate_screen", { target: step.screen });
    },
    [postCopilot]
  );

  const goldenNext = useCallback(() => {
    setGoldenStep((s) => {
      if (!goldenPath) return s;
      const next = Math.min(s + 1, goldenPath.steps.length - 1);
      applyGoldenStep(goldenPath, next);
      return next;
    });
  }, [goldenPath, applyGoldenStep]);

  const goldenPrev = useCallback(() => {
    setGoldenStep((s) => {
      if (!goldenPath) return s;
      const prev = Math.max(s - 1, 0);
      applyGoldenStep(goldenPath, prev);
      return prev;
    });
  }, [goldenPath, applyGoldenStep]);

  const goldenExit = useCallback(() => {
    setGoldenPath(null);
    setGoldenStep(0);
    setHighlight(null);
    setActivePanel((p) => (p === "golden-path" ? null : p));
    screenLockedRef.current = false;
    flashToast("Golden Path closed", "info");
  }, [flashToast]);

  // ---- time travel ----
  const stopPlay = useCallback(() => {
    if (playRef.current) clearInterval(playRef.current);
    playRef.current = null;
    setReplayPlaying(false);
  }, []);

  const scrub = useCallback(async (t: number) => {
    setReplayT(t);
    try {
      const r = await fetch(`/api/hmi/replay?t=${t}`);
      const json = (await r.json()) as { ok: boolean; frame: StateFrame; screen: HmiScreenDefinition };
      if (json.ok) {
        setReplayFrame(json.frame);
        setScreen(json.screen);
        setScreenSource("replay");
        screenLockedRef.current = true;
      }
    } catch {
      flashToast("Unable to load replay state. Current machine state retained.", "warn");
    }
  }, [flashToast]);

  const openTimeTravel = useCallback(async () => {
    setConversation((c) => [...c, { role: "operator", text: "What happened before this alarm?", at: Date.now() }]);
    setActivePanel("replay");
    await postCopilot("time_travel");
  }, [postCopilot]);

  const exitTimeTravel = useCallback(() => {
    stopPlay();
    setReplay(null);
    setReplayT(null);
    setReplayFrame(null);
    setActivePanel((p) => (p === "replay" ? null : p));
    screenLockedRef.current = Boolean(goldenPath);
    setScreenSource("engine");
    flashToast("Returned to live", "info");
  }, [goldenPath, stopPlay, flashToast]);

  const replayPlayPause = useCallback(() => {
    if (!replay) return;
    if (playRef.current) {
      stopPlay();
      return;
    }
    setReplayPlaying(true);
    playRef.current = setInterval(() => {
      setReplayT((cur) => {
        const next = (cur ?? replay.from) + 3000;
        if (next >= replay.to) {
          stopPlay();
          void scrub(replay.to);
          return replay.to;
        }
        void scrub(next);
        return next;
      });
    }, 500);
  }, [replay, scrub, stopPlay]);

  const replayStepEvent = useCallback(
    (dir: 1 | -1) => {
      if (!replay || replayT == null) return;
      const evs = replay.events;
      const next = dir === 1 ? evs.find((e) => e.t > replayT + 200) : [...evs].reverse().find((e) => e.t < replayT - 200);
      if (next) void scrub(next.t);
    },
    [replay, replayT, scrub]
  );

  // ---- device switching ----
  const setDevice = useCallback(
    async (id: string) => {
      if (id === activeDeviceId) return;
      stopPlay();
      setBusyLabel("Switching machine…");
      setCopilotBusy(true);
      // clear everything device-specific
      setConversation([]);
      setLastResponse(null);
      setGoldenPath(null);
      setGoldenStep(0);
      setHighlight(null);
      setReplay(null);
      setReplayT(null);
      setReplayFrame(null);
      setSelectedComponent(null);
      setActivePanel(null);
      screenLockedRef.current = false;
      try {
        const r = await fetch("/api/hmi/action", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "set_device", deviceId: id }) });
        const json = (await r.json()) as { ok: boolean; feedback?: string };
        setActiveDeviceId(id);
        flashToast(json.feedback ?? "Machine switched", "info");
      } catch {
        flashToast("Unable to switch machine.", "warn");
      } finally {
        setCopilotBusy(false);
        setBusyLabel(null);
      }
    },
    [activeDeviceId, stopPlay, flashToast]
  );

  // ---- machine components ----
  const selectComponent = useCallback((id: string, label: string) => {
    setSelectedComponent({ id, label });
    setMachineFocusAsset(id);
  }, []);
  const clearComponent = useCallback(() => setSelectedComponent(null), []);

  const explainComponent = useCallback(
    async (id: string, label: string) => {
      setSelectedComponent({ id, label });
      setMachineFocusAsset(id);
      setConversation((c) => [...c, { role: "operator", text: `Explain the ${label}.`, at: Date.now() }]);
      await postCopilot("explain_component", { componentId: id, componentLabel: label });
    },
    [postCopilot]
  );

  const toggleInvestigate = useCallback(() => setActivePanel((p) => (p === "investigation" ? null : "investigation")), []);

  const showOnMachine = useCallback(
    (assetId?: string | null) => {
      const target = assetId ?? lastResponse?.focusAssetId ?? payload?.context.machineView.focusAssetId ?? null;
      if (target) {
        setMachineFocusAsset(target);
        flashToast(`Machine view focused · ${payload?.context.machineView.focusLabel ?? "component"}`, "info");
      }
    },
    [lastResponse, payload, flashToast]
  );

  const runIncident = useCallback(async () => {
    try {
      const r = await fetch("/api/hmi/action", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "run_incident", source: "operator" }) });
      const json = (await r.json()) as { ok: boolean; feedback?: string };
      flashToast(json.ok ? `DEMO SCENARIO · ${json.feedback ?? "incident armed"}` : "Could not arm the demo incident.", json.ok ? "info" : "warn");
    } catch {
      flashToast("Could not arm the demo incident.", "warn");
    }
  }, [flashToast]);

  const value: HmiCopilotValue = {
    connection,
    payload,
    devices,
    activeDeviceId,
    conversation,
    copilotBusy,
    busyLabel,
    lastResponse,
    screen,
    screenSource,
    highlight,
    machineFocusAsset,
    goldenPath,
    goldenStep,
    replay,
    replayT,
    replayFrame,
    replayPlaying,
    pendingAction,
    selectedComponent,
    activePanel,
    toast,
    ask,
    sendIntent,
    runControl,
    authorizePending,
    cancelPending,
    goldenNext,
    goldenPrev,
    goldenExit,
    openTimeTravel,
    scrub,
    exitTimeTravel,
    replayPlayPause,
    replayStepEvent,
    setDevice,
    selectComponent,
    clearComponent,
    explainComponent,
    toggleInvestigate,
    showOnMachine,
    runIncident,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useHmiCopilot(): HmiCopilotValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("useHmiCopilot must be used within HmiCopilotProvider");
  return v;
}
