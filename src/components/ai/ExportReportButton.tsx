"use client";

import { useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { useTelemetry } from "@/hooks/useTelemetry";
import { useDeviceProfile } from "@/context/DeviceProfileContext";
import { laptopProfileComponents, motorProfileComponents } from "@/lib/twinProfiles";
import { downloadPdf, formatReportFilename, generateReportPdf } from "@/lib/report/generatePdf";
import type { DeviceProfile } from "@/types";

const PROFILE_LABEL: Record<DeviceProfile, string> = {
  motor: "Industrial Motor",
  laptop: "Laptop",
};

const STAR_COMPONENT: Record<DeviceProfile, string> = {
  motor: "bearing",
  laptop: "cpu",
};

export function ExportReportButton() {
  const { reading, health, componentHealths, alerts, componentRUL } = useTelemetry();
  const { profile } = useDeviceProfile();
  const [busy, setBusy] = useState(false);

  const handleExport = async () => {
    setBusy(true);
    try {
      const components =
        profile === "motor"
          ? motorProfileComponents(componentHealths, reading, componentRUL)
          : laptopProfileComponents(componentHealths, health, reading, componentRUL);
      const star = components.find((c) => c.id === STAR_COMPONENT[profile]) ?? components[0];

      const topAlert = alerts[0];
      const rootCause =
        topAlert?.rootCause ?? "No active anomalies detected — all monitored parameters within nominal range.";
      const recommendation =
        topAlert?.recommendedAction ?? star?.recommendation ?? "No action needed at this time.";

      const now = new Date();
      const bytes = await generateReportPdf({
        timestamp: now.getTime(),
        deviceProfile: PROFILE_LABEL[profile],
        healthScore: health,
        temperature: reading.temperature,
        vibration: reading.vibration,
        current: reading.current,
        rpm: reading.rpm,
        failureProbability: star?.failureProbability ?? 0,
        remainingLifeHours: star?.remainingHours ?? 0,
        rulLabel: star?.rulLabel ?? "Indeterminate",
        trendDescription: star?.trend?.description ?? "Indeterminate",
        predictionConfidence: star?.trend?.confidence ?? 0,
        rootCause,
        recommendation,
        componentName: star?.name ?? "System",
      });

      downloadPdf(bytes, formatReportFilename(now));
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      onClick={handleExport}
      disabled={busy}
      className="flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-sm font-semibold text-emerald-300 transition hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
      {busy ? "Exporting…" : "Export Engineering Report"}
    </button>
  );
}
