"use client";

import { createContext, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { buildStaticHealthySnapshot } from "@/lib/demo";
import { computeAllComponentRUL } from "@/lib/rul";
import { PLCEngine } from "@/lib/plc";
import type {
  Alert,
  ComponentHealth,
  ComponentId,
  ComponentRUL,
  DemoPhase,
  DemoStatus,
  HealthPoint,
  MachineStatus,
  MaintenanceLogEntry,
  OperatorState,
  PLCTelemetry,
  SensorReading,
  TelemetryPayload,
  TrendPrediction,
} from "@/types";

export type ConnectionStatus = "connecting" | "connected" | "disconnected";

const RECONNECT_DELAY_MS = 3000;

interface TelemetryData {
  reading: SensorReading;
  health: number;
  status: MachineStatus;
  phase: DemoPhase;
  componentHealths: Record<ComponentId, ComponentHealth>;
  alerts: Alert[];
  maintenanceLog: MaintenanceLogEntry[];
  operator: OperatorState;
  history: SensorReading[];
  healthHistory: HealthPoint[];
  bearingPrediction: TrendPrediction;
  componentRUL: Record<ComponentId, ComponentRUL>;
  demo: DemoStatus;
  plc: PLCTelemetry;
}

export interface TelemetryContextValue extends TelemetryData {
  connectionStatus: ConnectionStatus;
  acknowledgeAlert: (ruleId: string) => void;
  startDemo: () => void;
  pauseDemo: () => void;
  resetDemo: () => void;
  emergencyStop: () => void;
  plcStart: () => void;
  plcStop: () => void;
  plcSetMode: (mode: "AUTO" | "MANUAL") => void;
  plcSetFrequencySetpoint: (hz: number) => void;
  plcJogFrequency: (deltaHz: number) => void;
}

export const TelemetryContext = createContext<TelemetryContextValue | null>(null);

function idleData(): TelemetryData {
  const snap = buildStaticHealthySnapshot();
  return {
    reading: snap.reading,
    health: snap.health,
    status: snap.status,
    phase: snap.phase,
    componentHealths: snap.componentHealths,
    alerts: snap.alerts,
    maintenanceLog: snap.maintenanceLog,
    operator: snap.operator,
    history: snap.history,
    healthHistory: snap.healthHistory,
    bearingPrediction: snap.bearingPrediction,
    componentRUL: computeAllComponentRUL(snap.history, snap.componentHealths),
    plc: new PLCEngine().getTelemetry(),
    demo: {
      active: false,
      running: false,
      phase: "healthy",
      phaseLabel: "Healthy",
      phaseProgress: 0,
      totalProgress: 0,
      loopCount: 0,
      maintenanceInProgress: false,
    },
  };
}

function payloadToData(payload: TelemetryPayload): TelemetryData {
  return {
    reading: {
      timestamp: payload.timestamp,
      temperature: payload.temperature,
      vibration: payload.vibration,
      current: payload.current,
      rpm: payload.rpm,
    },
    health: payload.health,
    status: payload.status,
    phase: payload.ambientPhase,
    componentHealths: payload.componentHealths,
    alerts: payload.alerts,
    maintenanceLog: payload.maintenanceLog,
    operator: payload.operator,
    history: payload.history,
    healthHistory: payload.healthHistory,
    bearingPrediction: payload.bearingPrediction,
    componentRUL: payload.componentRUL,
    plc: payload.plc,
    demo: payload.demo,
  };
}

function postAction(action: string, extra?: Record<string, unknown>) {
  fetch("/api/telemetry", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(extra ? { action, ...extra } : { action }),
  }).catch(() => {});
}

/** Owns the single shared EventSource connection; only the Provider should call this. */
export function TelemetryProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<TelemetryData>(idleData);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("connecting");
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    let cancelled = false;

    function connect() {
      if (cancelled) return;
      const es = new EventSource("/api/telemetry");
      esRef.current = es;

      es.onopen = () => {
        if (!cancelled) setConnectionStatus("connected");
      };

      es.onmessage = (event) => {
        if (cancelled) return;
        try {
          const payload = JSON.parse(event.data) as TelemetryPayload;
          setData(payloadToData(payload));
          setConnectionStatus("connected");
        } catch {
          // malformed frame — keep last known telemetry, skip this one
        }
      };

      es.onerror = () => {
        es.close();
        if (cancelled) return;
        setConnectionStatus("disconnected");
        reconnectTimerRef.current = setTimeout(connect, RECONNECT_DELAY_MS);
      };
    }

    connect();

    return () => {
      cancelled = true;
      esRef.current?.close();
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
    };
  }, []);

  const acknowledgeAlert = useCallback((ruleId: string) => postAction("acknowledge", { ruleId }), []);
  const startDemo = useCallback(() => postAction("start"), []);
  const pauseDemo = useCallback(() => postAction("pause"), []);
  const resetDemo = useCallback(() => {
    postAction("reset");
    fetch("/api/history/reset", { method: "POST" }).catch(() => {});
  }, []);
  const emergencyStop = useCallback(() => postAction("emergency_stop"), []);
  const plcStart = useCallback(() => postAction("plc_start"), []);
  const plcStop = useCallback(() => postAction("plc_stop"), []);
  const plcSetMode = useCallback((mode: "AUTO" | "MANUAL") => postAction("plc_set_mode", { mode }), []);
  const plcSetFrequencySetpoint = useCallback((hz: number) => postAction("plc_set_frequency", { frequency: hz }), []);
  const plcJogFrequency = useCallback((deltaHz: number) => postAction("plc_jog_frequency", { delta: deltaHz }), []);

  const value: TelemetryContextValue = {
    ...data,
    connectionStatus,
    acknowledgeAlert,
    startDemo,
    pauseDemo,
    resetDemo,
    emergencyStop,
    plcStart,
    plcStop,
    plcSetMode,
    plcSetFrequencySetpoint,
    plcJogFrequency,
  };

  return <TelemetryContext.Provider value={value}>{children}</TelemetryContext.Provider>;
}
