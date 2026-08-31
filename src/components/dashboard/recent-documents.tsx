"use client";

import Link from "next/link";
import { ArrowDownLeftIcon, ArrowUpRightIcon, ChevronRightIcon } from "lucide-react";
import { TypeBadge } from "@/components/records/type-badge";
import type { TransactionWithNames } from "@/hooks/useTransactions";

function when(date: string): string {
  const d = new Date(date + (date.length === 10 ? "T00:00:00" : ""));
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function qty(t: TransactionWithNames): string {
  return `${new Intl.NumberFormat("en-IN").format(t.pieces)} ${t.material_unit ?? "pcs"}`;
}

export function RecentDocuments({ rows }: { rows: TransactionWithNames[] }) {
  return (
    <div className="rounded-2xl border border-border bg-white">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <h3 className="text-[15px] font-semibold text-foreground">Recent Documents</h3>
        <Link
          href="/records"
          className="inline-flex items-center gap-0.5 text-[13px] font-medium text-emerald-700 hover:underline"
        >
          View all
          <ChevronRightIcon className="size-3.5" />
        </Link>
      </div>
      {rows.length === 0 ? (
        <p className="p-6 text-sm text-muted-foreground">No documents yet.</p>
      ) : (
        <ul className="divide-y divide-border">
          {rows.map((t) => (
            <li key={t.id} className="flex items-center gap-3 px-4 py-2.5">
              <span
                className={
                  "flex size-8 shrink-0 items-center justify-center rounded-lg " +
                  (t.type === "received"
                    ? "bg-emerald-50 text-emerald-700"
                    : "bg-orange-50 text-orange-600")
                }
              >
                {t.type === "received" ? (
                  <ArrowDownLeftIcon className="size-4" />
                ) : (
                  <ArrowUpRightIcon className="size-4" />
                )}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-[13px] font-semibold text-foreground">
                    {t.transaction_number}
                  </span>
                  <TypeBadge type={t.type} />
                </div>
                <p className="truncate text-[12px] text-muted-foreground">
                  {t.material_name} · {t.party_name || t.company_name}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-[13px] font-medium text-foreground">{qty(t)}</p>
                <p className="text-[11px] text-muted-foreground">{when(t.transaction_date)}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
