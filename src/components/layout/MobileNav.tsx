"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bot, Cpu, History, LayoutDashboard } from "lucide-react";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/twin", label: "Twin", icon: Cpu },
  { href: "/assistant", label: "Assistant", icon: Bot },
  { href: "/history", label: "History", icon: History },
];

export function MobileNav() {
  const pathname = usePathname();

  return (
    <nav className="lg:hidden fixed bottom-0 inset-x-0 z-40 flex justify-around border-t border-white/5 bg-[#081422]/90 backdrop-blur px-2 py-2">
      {NAV_ITEMS.map((item) => {
        const active = pathname === item.href;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`flex flex-col items-center gap-1 rounded-lg px-3 py-1.5 text-[10px] font-medium ${
              active ? "text-cyan-300" : "text-slate-500"
            }`}
          >
            <item.icon className="h-4.5 w-4.5" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
