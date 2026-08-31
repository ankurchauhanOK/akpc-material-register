"use client";

import { MoreHorizontalIcon } from "lucide-react";
import type { MovementRow } from "@/components/dashboard/dashboard-data";

function num(v: number): string {
  return new Intl.NumberFormat("en-IN").format(v);
}

export function MovementTable({ rows }: { rows: MovementRow[] }) {
  return (
    <div className="rounded-2xl border border-border bg-white">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <h3 className="text-[15px] font-semibold text-foreground">Material Movement</h3>
        <MoreHorizontalIcon className="size-4 text-muted-foreground" />
      </div>
      {rows.length === 0 ? (
        <p className="p-6 text-sm text-muted-foreground">No movement in this period.</p>
      ) : (
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b border-border text-left text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
              <th className="px-4 py-2.5 font-medium">Component</th>
              <th className="px-3 py-2.5 text-right font-medium">Received</th>
              <th className="px-3 py-2.5 text-right font-medium">Sent</th>
              <th className="px-4 py-2.5 text-right font-medium">Net</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((r) => (
              <tr key={r.componentId} className="h-[42px]">
                <td className="px-4 py-2 font-medium text-foreground">{r.name}</td>
                <td className="px-3 py-2 text-right text-zinc-700">{num(r.received)}</td>
                <td className="px-3 py-2 text-right text-zinc-700">{num(r.sent)}</td>
                <td
                  className={`px-4 py-2 text-right font-semibold ${
                    r.net < 0 ? "text-red-600" : "text-emerald-700"
                  }`}
                >
                  {r.net < 0 ? "−" : "+"}{num(Math.abs(r.net))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
