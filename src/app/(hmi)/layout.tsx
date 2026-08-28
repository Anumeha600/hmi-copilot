import { AppShell } from "@/components/layout/AppShell";
import { DeviceProfileProvider } from "@/context/DeviceProfileContext";

export default function HmiLayout({ children }: { children: React.ReactNode }) {
  return (
    <DeviceProfileProvider>
      <AppShell>{children}</AppShell>
    </DeviceProfileProvider>
  );
}
