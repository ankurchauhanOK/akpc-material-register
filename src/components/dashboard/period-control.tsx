"use client";

import { cn } from "@/lib/utils";
import type { PeriodKey } from "@/components/dashboard/dashboard-data";

const OPTIONS: { key: PeriodKey; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "week", label: "Week" },
  { key: "month", label: "Month" },
  { key: "custom", label: "Custom" },
];

export function PeriodControl({
  value,
  onChange,
}: {
  value: PeriodKey;
  onChange: (p: PeriodKey) => void;
}) {
  return (
    <div className="flex h-10 items-center gap-0.5 rounded-[10px] border border-border bg-white p-0.5">
      {OPTIONS.map((o) => {
        const active = value === o.key;
        return (
          <button
            key={o.key}
            onClick={() => onChange(o.key)}
            className={cn(
              "h-full rounded-lg px-3 text-[13px] font-medium transition-colors",
              active
                ? "bg-emerald-50 text-emerald-700"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
