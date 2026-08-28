"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import type { DeviceProfile } from "@/types";

interface DeviceProfileContextValue {
  profile: DeviceProfile;
  setProfile: (profile: DeviceProfile) => void;
}

const DeviceProfileContext = createContext<DeviceProfileContextValue | null>(null);

/** Which Digital Twin is on screen. Purely a display concern — the underlying
 *  simulation, AI Assistant, History, and Operator Load logic never change. */
export function DeviceProfileProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<DeviceProfile>("motor");

  return (
    <DeviceProfileContext.Provider value={{ profile, setProfile }}>
      {children}
    </DeviceProfileContext.Provider>
  );
}

export function useDeviceProfile(): DeviceProfileContextValue {
  const ctx = useContext(DeviceProfileContext);
  if (!ctx) throw new Error("useDeviceProfile must be used within a DeviceProfileProvider");
  return ctx;
}
