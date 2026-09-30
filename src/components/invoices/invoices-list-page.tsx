"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  ChevronRightIcon,
  FilePlus2Icon,
  FolderOpenIcon,
  Loader2Icon,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useInvoices } from "@/hooks/useInvoices";
import { formatDate, formatINR } from "@/lib/format";
import type { InvoiceListItem } from "@/lib/invoices/types";

export function InvoicesListPage() {
  const { items, isLoading, error } = useInvoices();
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter((inv) =>
      [
        inv.invoice_number,
        inv.party_name ?? "",
        inv.party_company ?? "",
      ]
        .join(" ")
        .toLowerCase()
        .includes(q)
    );
  }, [items, search]);

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Invoices</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Billing records raised against your Delivery Challans. Each challan
            can be billed on only one invoice.
          </p>
        </div>
        <Link
          href="/invoices/new"
          className={buttonVariants({ variant: "default", size: "default" })}
        >
          <FilePlus2Icon /> New Invoice
        </Link>
      </div>

      <div className="mb-4">
        <Input
          placeholder="Search number or party…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-10 max-w-xs"
        />
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center gap-2 rounded-xl border bg-white p-8 text-sm text-zinc-500">
          <Loader2Icon className="size-4 animate-spin" /> Loading invoices…
        </div>
      ) : error ? (
        <div className="rounded-xl border bg-red-50 p-8 text-center text-sm text-red-700">
          Could not load invoices. Please try again.
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border bg-white p-12 text-center">
          <FolderOpenIcon className="mx-auto mb-2 size-8 text-zinc-300" />
          <p className="text-sm text-zinc-500">No invoices found.</p>
          {items.length === 0 && (
            <p className="mt-1 text-xs text-zinc-400">
              Create your first invoice from the Delivery Challan list.
            </p>
          )}
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden overflow-hidden rounded-xl border bg-white md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Invoice</TableHead>
                  <TableHead>Party</TableHead>
                  <TableHead>Challans</TableHead>
                  <TableHead>Items</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((inv) => (
                  <InvoiceRow key={inv.id} invoice={inv} />
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Mobile cards */}
          <div className="grid gap-2 md:hidden">
            {filtered.map((inv) => (
              <MobileInvoiceCard key={inv.id} invoice={inv} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function InvoiceRow({ invoice }: { invoice: InvoiceListItem }) {
  return (
    <TableRow className="cursor-pointer hover:bg-muted/40">
      <TableCell className="font-medium">
        <Link href={`/invoices/${invoice.invoice_number}`}>
          {invoice.invoice_number}
        </Link>
      </TableCell>
      <TableCell>{invoice.party_name ?? invoice.party_company ?? "—"}</TableCell>
      <TableCell>{invoice.challanCount}</TableCell>
      <TableCell>{invoice.itemCount}</TableCell>
      <TableCell className="whitespace-nowrap text-right font-medium">
        {formatINR(invoice.total_amount)}
      </TableCell>
      <TableCell className="whitespace-nowrap">
        {formatDate(invoice.invoice_date)}
      </TableCell>
      <TableCell className="text-right">
        <Link
          href={`/invoices/${invoice.invoice_number}`}
          className={buttonVariants({ variant: "ghost", size: "sm" })}
        >
          View
        </Link>
      </TableCell>
    </TableRow>
  );
}

function MobileInvoiceCard({ invoice }: { invoice: InvoiceListItem }) {
  return (
    <Link
      href={`/invoices/${invoice.invoice_number}`}
      className="block w-full rounded-xl border bg-white p-3 text-left hover:bg-muted/40"
    >
      <div className="flex items-center justify-between gap-2">
        <p className="truncate text-sm font-semibold">
          {invoice.invoice_number}
        </p>
        <Badge variant="secondary">INV</Badge>
      </div>
      <p className="mt-1 truncate text-sm font-medium">
        {invoice.party_name ?? invoice.party_company ?? "—"}
      </p>
      <div className="mt-2 flex items-center justify-between gap-2 border-t border-border pt-2">
        <p className="truncate text-xs text-zinc-500">
          {invoice.challanCount}{" "}
          {invoice.challanCount === 1 ? "challan" : "challans"} ·{" "}
          {invoice.itemCount} {invoice.itemCount === 1 ? "item" : "items"} ·{" "}
          {formatDate(invoice.invoice_date)}
        </p>
        <span className="inline-flex shrink-0 items-center gap-0.5 text-xs font-semibold text-zinc-500">
          {formatINR(invoice.total_amount)}{" "}
          <ChevronRightIcon className="size-3.5" />
        </span>
      </div>
    </Link>
  );
}