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
    <>
      {/* Mobile: full-width pill toggle */}
      <div className="flex rounded-xl border border-border bg-zinc-100 p-1 lg:hidden">
        {OPTIONS.map((o) => {
          const active = value === o.key;
          return (
            <button
              key={o.key}
              onClick={() => onChange(o.key)}
              className={cn(
                "flex-1 py-2 text-center text-[13px] font-medium transition-colors rounded-lg",
                active
                  ? "bg-white text-emerald-700 font-semibold shadow-sm"
                  : "text-muted-foreground"
              )}
            >
              {o.label}
            </button>
          );
        })}
      </div>

      {/* Desktop: compact inline pill */}
      <div className="hidden h-10 items-center gap-0.5 rounded-[10px] border border-border bg-white p-0.5 lg:flex">
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
    </>
  );
}
