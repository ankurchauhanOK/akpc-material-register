"use client";

import { MoreHorizontalIcon } from "lucide-react";
import { formatINR } from "@/lib/format";
import type { SpendRow } from "@/components/dashboard/dashboard-data";

function num(v: number): string {
  return new Intl.NumberFormat("en-IN").format(v);
}

export function SpendTable({ rows }: { rows: SpendRow[] }) {
  return (
    <div className="rounded-2xl border border-border bg-white">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <h3 className="text-[15px] font-semibold text-foreground">Material Spend</h3>
        <MoreHorizontalIcon className="size-4 text-muted-foreground" />
      </div>
      {rows.length === 0 ? (
        <p className="p-6 text-sm text-muted-foreground">No receipts in this period.</p>
      ) : (
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b border-border text-left text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
              <th className="px-4 py-2.5 font-medium">Component</th>
              <th className="px-3 py-2.5 text-right font-medium">Qty Rec</th>
              <th className="px-3 py-2.5 text-right font-medium">Spend</th>
              <th className="px-4 py-2.5 text-right font-medium">Avg Rate</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((r, i) => (
              <tr key={`${r.name}-${i}`} className="h-[42px]">
                <td className="px-4 py-2 font-medium text-foreground">{r.name}</td>
                <td className="px-3 py-2 text-right text-zinc-700">{num(r.qtyRec)}</td>
                <td className="px-3 py-2 text-right font-medium text-foreground">
                  {formatINR(r.spend)}
                </td>
                <td className="px-4 py-2 text-right text-zinc-700">{formatINR(r.avgRate)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
