"use client";

import { AlertTriangleIcon, CheckCircle2Icon } from "lucide-react";
import type { NeedsAttentionIssue } from "@/components/dashboard/dashboard-data";

const KIND_META: Record<NeedsAttentionIssue["kind"], { icon: string; color: string }> = {
  price: { icon: "₹", color: "text-amber-700" },
  qty: { icon: "Q", color: "text-amber-700" },
  duplicate: { icon: "×", color: "text-amber-700" },
};

export function NeedsAttention({ issues }: { issues: NeedsAttentionIssue[] }) {
  return (
    <section className="rounded-2xl border border-amber-200/70 bg-amber-50/60 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-6">
        <div className="flex shrink-0 items-center gap-2">
          <span className="flex size-7 items-center justify-center rounded-lg bg-amber-100 text-amber-700">
            <AlertTriangleIcon className="size-4" />
          </span>
          <p className="text-[13px] font-semibold text-amber-900">Needs Attention</p>
        </div>

        {issues.length === 0 ? (
          <p className="inline-flex items-center gap-1.5 text-[13px] text-emerald-700">
            <CheckCircle2Icon className="size-4" />
            Everything looks normal.
          </p>
        ) : (
          <div className="flex flex-1 flex-wrap items-center gap-2">
            {issues.map((issue) => {
              const meta = KIND_META[issue.kind];
              return (
                <div
                  key={issue.id}
                  title={`${issue.detail}`}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-white/70 px-2.5 py-1.5 text-[12px] text-amber-900 ring-1 ring-amber-200/70"
                >
                  <span className={`font-bold ${meta.color}`}>{meta.icon}</span>
                  <span className="font-semibold">{issue.title}</span>
                  <span className="text-amber-800/70">{issue.detail}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
