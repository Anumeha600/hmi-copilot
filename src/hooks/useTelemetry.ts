"use client";

import { useContext } from "react";
import { TelemetryContext, type TelemetryContextValue } from "@/context/TelemetryContext";

/** The reusable hook every page consumes instead of a local timer — backed by
 *  the shared SSE connection owned by TelemetryProvider. */
export function useTelemetry(): TelemetryContextValue {
  const ctx = useContext(TelemetryContext);
  if (!ctx) throw new Error("useTelemetry must be used within a TelemetryProvider");
  return ctx;
}
