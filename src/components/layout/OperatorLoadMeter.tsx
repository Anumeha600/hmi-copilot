"use client";

import { BrainCircuit } from "lucide-react";
import type { LoadLevel, OperatorState } from "@/types";

const LEVEL_STYLE: Record<LoadLevel, { text: string; bar: string; label: string }> = {
  low: { text: "text-emerald-300", bar: "bg-emerald-400", label: "Low" },
  medium: { text: "text-amber-300", bar: "bg-amber-400", label: "Medium" },
  high: { text: "text-red-300", bar: "bg-red-400", label: "High" },
};

export function OperatorLoadMeter({ operator }: { operator: OperatorState }) {
  const style = LEVEL_STYLE[operator.loadLevel];

  return (
    <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-1.5">
      <BrainCircuit className={`h-4 w-4 ${style.text}`} />
      <div>
        <p className="text-[10px] font-medium uppercase tracking-wider text-slate-500">
          Operator Load
        </p>
        <p className={`text-xs font-semibold ${style.text}`}>{style.label}</p>
      </div>
      <div className="h-6 w-16 flex items-end gap-0.5">
        {[0, 1, 2, 3, 4].map((i) => {
          const threshold = (i + 1) * 20;
          const active = operator.cognitiveLoad >= threshold - 20;
          return (
            <div
              key={i}
              className={`w-full rounded-sm transition-all ${active ? style.bar : "bg-white/10"}`}
              style={{ height: `${40 + i * 12}%` }}
            />
          );
        })}
      </div>
    </div>
  );
}
