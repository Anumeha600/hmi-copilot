import { AlertTriangle, CheckCircle2, ShieldOff, XCircle } from "lucide-react";
import type { MachineStatus } from "@/types";

const STATUS_CONFIG: Record<
  MachineStatus,
  { label: string; className: string; icon: typeof CheckCircle2 }
> = {
  normal: {
    label: "Normal",
    className: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
    icon: CheckCircle2,
  },
  warning: {
    label: "Warning",
    className: "border-amber-500/40 bg-amber-500/10 text-amber-300",
    icon: AlertTriangle,
  },
  critical: {
    label: "Critical",
    className: "border-red-500/40 bg-red-500/10 text-red-300",
    icon: XCircle,
  },
  safe_mode: {
    label: "Safe Mode",
    className: "border-slate-400/40 bg-slate-400/10 text-slate-300",
    icon: ShieldOff,
  },
};

export function StatusBadge({ status, large = false }: { status: MachineStatus; large?: boolean }) {
  const config = STATUS_CONFIG[status];
  const Icon = config.icon;
  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full border font-semibold tracking-wide ${config.className} ${
        large ? "px-4 py-2 text-sm" : "px-3 py-1 text-xs"
      }`}
    >
      <Icon className={large ? "h-4 w-4" : "h-3.5 w-3.5"} />
      {config.label}
      {status !== "normal" && (
        <span className="relative flex h-1.5 w-1.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-current opacity-60" />
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-current" />
        </span>
      )}
    </span>
  );
}
