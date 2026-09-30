"use client";

import Link from "next/link";
import { ReceiptIcon } from "lucide-react";
import { useInvoices } from "@/hooks/useInvoices";
import { formatDate, formatINR } from "@/lib/format";

/** Compact billing strip for the dashboard: how much has been invoiced, and
 *  the most recent invoice. Deliberately read-only — raising an invoice is
 *  driven from a Delivery Challan, so this links out rather than creating. */
export function InvoiceStrip() {
  const { items, isLoading } = useInvoices();

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 rounded-[14px] border bg-white px-4 py-3 text-sm text-zinc-500">
        <ReceiptIcon className="size-4" /> Loading invoices…
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-[14px] border bg-white px-4 py-3">
        <div className="flex items-center gap-2 text-sm text-zinc-500">
          <ReceiptIcon className="size-4" /> No invoices raised yet.
        </div>
        <Link
          href="/invoices"
          className="text-sm font-semibold text-emerald-700 hover:underline"
        >
          Invoices
        </Link>
      </div>
    );
  }

  const total = items.reduce((s, inv) => s + inv.total_amount, 0);
  const latest = items[0];

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-[14px] border bg-white px-4 py-3">
      <div className="flex items-center gap-2.5">
        <ReceiptIcon className="size-4 text-emerald-700" />
        <div>
          <p className="text-[11px] uppercase tracking-wide text-zinc-500">
            Invoiced
          </p>
          <p className="text-sm font-semibold">
            {formatINR(total)}
            <span className="ml-2 text-xs font-normal text-zinc-500">
              across {items.length} invoice{items.length === 1 ? "" : "s"}
            </span>
          </p>
        </div>
      </div>
      {latest ? (
        <Link
          href={`/invoices/${latest.invoice_number}`}
          className="text-sm text-zinc-600 hover:text-emerald-700 hover:underline"
        >
          Latest: {latest.invoice_number} ·{" "}
          {latest.party_company ?? latest.party_name ?? "—"} ·{" "}
          {formatDate(latest.invoice_date)}
        </Link>
      ) : null}
    </div>
  );
}
