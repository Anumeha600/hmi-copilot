"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { Activity, Bot, CircuitBoard, Cpu, Factory, History, Laptop, LayoutDashboard, Network } from "lucide-react";
import { useDeviceProfile } from "@/context/DeviceProfileContext";
import type { DeviceProfile } from "@/types";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/twin", label: "Digital Twin", icon: Cpu },
  { href: "/plc", label: "PLC Control", icon: CircuitBoard },
  { href: "/assistant", label: "AI Assistant", icon: Bot },
  { href: "/history", label: "History", icon: History },
  { href: "/system", label: "System Architecture", icon: Network },
];

const PROFILE_ITEMS: { id: DeviceProfile; label: string; icon: typeof Factory }[] = [
  { id: "motor", label: "Industrial Motor", icon: Factory },
  { id: "laptop", label: "Laptop", icon: Laptop },
];

export function Sidebar() {
  const pathname = usePathname();
  const { profile, setProfile } = useDeviceProfile();

  return (
    <aside className="hidden lg:flex w-60 shrink-0 flex-col border-r border-white/5 bg-[#081422]/60 px-4 py-6">
      <Link href="/" className="flex items-center gap-2 px-2">
        <Activity className="h-6 w-6 text-cyan-400" />
        <span className="font-semibold tracking-tight text-slate-100">
          HMI Copilot <span className="text-slate-500 font-normal">· Legacy</span>
        </span>
      </Link>

      <nav className="mt-10 flex flex-col gap-1">
        {NAV_ITEMS.map((item) => {
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
                active
                  ? "bg-cyan-500/10 text-cyan-300 ring-1 ring-cyan-500/25"
                  : "text-slate-400 hover:bg-white/5 hover:text-slate-200"
              }`}
            >
              <item.icon className="h-4.5 w-4.5" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="mt-8">
        <p className="px-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
          Digital Twin
        </p>
        <div className="relative mt-2 flex flex-col gap-1">
          {PROFILE_ITEMS.map((item) => {
            const active = profile === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setProfile(item.id)}
                className={`relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium transition ${
                  active ? "text-cyan-300" : "text-slate-400 hover:bg-white/5 hover:text-slate-200"
                }`}
              >
                {active && (
                  <motion.span
                    layoutId="twin-profile-active"
                    className="absolute inset-0 rounded-xl bg-cyan-500/10 ring-1 ring-cyan-500/25"
                    transition={{ type: "spring", stiffness: 400, damping: 32 }}
                  />
                )}
                <item.icon className="relative h-4.5 w-4.5" />
                <span className="relative">{item.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-auto rounded-xl border border-white/5 bg-white/[0.02] px-3 py-3 text-xs text-slate-500">
        Simulated plant data · no hardware connected
      </div>
    </aside>
  );
}
