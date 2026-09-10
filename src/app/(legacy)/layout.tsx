import { AppShell } from "@/components/layout/AppShell";
import { DeviceProfileProvider } from "@/context/DeviceProfileContext";
import { TelemetryProvider } from "@/context/TelemetryContext";

/**
 * Archived predictive-maintenance UI (the project's original build). Kept
 * reachable by direct URL for reference; not linked from HMI Copilot. Runs the
 * original dark theme and its own telemetry engine.
 */
export default function LegacyLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="legacy-shell min-h-screen">
      <TelemetryProvider>
        <DeviceProfileProvider>
          <AppShell>{children}</AppShell>
        </DeviceProfileProvider>
      </TelemetryProvider>
    </div>
  );
}
