"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Layers, MousePointerClick, Thermometer } from "lucide-react";
import { useTelemetry } from "@/hooks/useTelemetry";
import { useDeviceProfile } from "@/context/DeviceProfileContext";
import { MachineSVG } from "@/components/twin/MachineSVG";
import { LaptopSVG } from "@/components/twin/LaptopSVG";
import { InspectionPanel } from "@/components/twin/InspectionPanel";
import { laptopProfileComponents, motorProfileComponents } from "@/lib/twinProfiles";
import type { ComponentId, LaptopComponentId, TwinComponentDisplay } from "@/types";

export default function TwinPage() {
  const { componentHealths, reading, health, status, componentRUL } = useTelemetry();
  const { profile } = useDeviceProfile();

  const [selectedMotor, setSelectedMotor] = useState<ComponentId | null>(null);
  const [selectedLaptop, setSelectedLaptop] = useState<LaptopComponentId | null>(null);
  const [thermalView, setThermalView] = useState(false);
  const [exploded, setExploded] = useState(false);

  const motorComponents = useMemo(
    () => motorProfileComponents(componentHealths, reading, componentRUL),
    [componentHealths, reading, componentRUL]
  );
  const laptopComponents = useMemo(
    () => laptopProfileComponents(componentHealths, health, reading, componentRUL),
    [componentHealths, health, reading, componentRUL]
  );

  const laptopById = useMemo(
    () => Object.fromEntries(laptopComponents.map((c) => [c.id, c])) as Record<LaptopComponentId, TwinComponentDisplay>,
    [laptopComponents]
  );
  const motorById = useMemo(
    () => Object.fromEntries(motorComponents.map((c) => [c.id, c])) as Record<ComponentId, TwinComponentDisplay>,
    [motorComponents]
  );

  const isMotor = profile === "motor";
  const activeList = isMotor ? motorComponents : laptopComponents;
  const selectedComponent: TwinComponentDisplay | null = isMotor
    ? selectedMotor
      ? motorById[selectedMotor]
      : null
    : selectedLaptop
      ? laptopById[selectedLaptop]
      : null;

  const closeInspection = () => (isMotor ? setSelectedMotor(null) : setSelectedLaptop(null));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-100">Digital Twin</h1>
          <p className="text-sm text-slate-500">
            {isMotor ? "Industrial Motor" : "Laptop"} · click any component for a live inspection readout.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setThermalView((v) => !v)}
            aria-pressed={thermalView}
            className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${
              thermalView
                ? "border-cyan-500/40 bg-cyan-500/15 text-cyan-300"
                : "border-white/10 bg-white/5 text-slate-300 hover:bg-white/10"
            }`}
          >
            <Thermometer className="h-3.5 w-3.5" />
            Thermal View
          </button>
          <button
            onClick={() => setExploded((v) => !v)}
            aria-pressed={exploded}
            className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${
              exploded
                ? "border-cyan-500/40 bg-cyan-500/15 text-cyan-300"
                : "border-white/10 bg-white/5 text-slate-300 hover:bg-white/10"
            }`}
          >
            <Layers className="h-3.5 w-3.5" />
            Exploded View
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_320px]">
        <div className="glass-panel overflow-hidden rounded-2xl p-6">
          <AnimatePresence mode="wait">
            {isMotor ? (
              <motion.div
                key="motor"
                initial={{ opacity: 0, scale: 0.97 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.97 }}
                transition={{ duration: 0.3, ease: "easeOut" }}
              >
                <MachineSVG
                  componentHealths={componentHealths}
                  selected={selectedMotor}
                  onSelect={setSelectedMotor}
                  reading={reading}
                  machineStatus={status}
                  thermalView={thermalView}
                  exploded={exploded}
                />
              </motion.div>
            ) : (
              <motion.div
                key="laptop"
                initial={{ opacity: 0, scale: 0.97 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.97 }}
                transition={{ duration: 0.3, ease: "easeOut" }}
              >
                <LaptopSVG
                  components={laptopById}
                  selected={selectedLaptop}
                  onSelect={setSelectedLaptop}
                  reading={reading}
                  machineStatus={status}
                  thermalView={thermalView}
                  exploded={exploded}
                />
              </motion.div>
            )}
          </AnimatePresence>
          {!selectedComponent && (
            <div className="mt-4 flex items-center justify-center gap-2 text-xs text-slate-500">
              <MousePointerClick className="h-3.5 w-3.5" />
              Select a component to inspect
            </div>
          )}
        </div>

        <div className="space-y-4">
          {selectedComponent ? (
            <InspectionPanel component={selectedComponent} onClose={closeInspection} />
          ) : (
            <motion.div
              key={profile}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25 }}
              className="glass-panel rounded-2xl p-5 space-y-3"
            >
              <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
                Component Summary
              </p>
              {activeList.map((c) => (
                <button
                  key={c.id}
                  onClick={() =>
                    isMotor ? setSelectedMotor(c.id as ComponentId) : setSelectedLaptop(c.id as LaptopComponentId)
                  }
                  className="flex w-full items-center justify-between rounded-xl border border-white/5 bg-white/[0.02] px-3 py-2.5 text-left transition hover:bg-white/5"
                >
                  <span className="text-sm text-slate-300">{c.name}</span>
                  <span
                    className={`font-mono text-sm font-semibold ${
                      c.status === "normal"
                        ? "text-emerald-300"
                        : c.status === "warning"
                          ? "text-amber-300"
                          : "text-red-300"
                    }`}
                  >
                    {c.health}%
                  </span>
                </button>
              ))}
            </motion.div>
          )}
        </div>
      </div>
    </div>
  );
}
