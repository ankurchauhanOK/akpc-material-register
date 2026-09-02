"use client";

import { useState } from "react";
import Link from "next/link";
import { DownloadIcon, FileTextIcon, PrinterIcon, RotateCcwIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { renderChallanPdf } from "@/lib/challan/challan-pdf";
import { formatDate, formatINR } from "@/lib/format";
import { UNIT_LABELS } from "@/lib/supabase/types";
import type { Tables, Enums } from "@/lib/supabase/database.types";

type Material = Tables<"materials">;
type DocItem = Tables<"receiving_document_items">;
type UnitType = Enums<"unit_type">;

type PreviewDoc = Tables<"receiving_documents"> & {
  items: DocItem[];
};

/** Map an item's saved unit to a short label for the printed preview. */
const UNIT_SHORT: Record<string, string> = {
  pieces: "Pcs",
  kg: "Kg",
  meter: "Mtr",
  litre: "Ltr",
  set: "Set",
};

/**
 * Client Challan Preview / Document Viewer for a saved Send document.
 *
 * Renders an on-screen A4 DELIVERY CHALLAN from the real saved document
 * (no form state, no mock data). Print prints the on-screen A4 directly.
 * Download PDF regenerates the same document via the existing on-demand
 * renderer — repeated downloads never create a new record.
 */
export function ChallanPreview({
  doc,
  component,
  partCode,
}: {
  doc: PreviewDoc;
  component: Material;
  partCode: string | null;
}) {
  const [generating, setGenerating] = useState(false);
  const items = doc.items ?? [];
  const partyName = doc.party_name || doc.party_company || "—";
  const partCodeFor = (item: DocItem): string =>
    item.line_type === "component" ? partCode || "—" : "—";

  async function downloadPdf() {
    if (generating) return;
    setGenerating(true);
    try {
      const blob = await renderChallanPdf(
        {
          type: "given",
          transaction_number: doc.document_number,
          transaction_date: doc.transaction_date,
          party_name: doc.party_name,
          party_company: doc.party_company,
          party_location: doc.party_location,
          party_contact: doc.party_contact,
          total_amount: doc.total_amount,
        } as Tables<"transactions"> & { party_name: string | null },
        component.name,
        UNIT_LABELS[component.unit as UnitType],
        items,
        doc.subtotal,
        doc.gst_total
      );
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${doc.document_number}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="flex flex-col items-center">
      {/* Action bar (no print) */}
      <div className="no-print sticky top-0 z-50 w-full border-b border-border bg-white/90 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex w-full max-w-[210mm] flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-lg font-semibold tracking-tight">Challan Preview</h1>
            <p className="text-xs text-muted-foreground">Delivery Challan · {doc.document_number}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => window.print()}>
              <PrinterIcon className="size-4" /> Print
            </Button>
            <Button
              size="sm"
              onClick={downloadPdf}
              disabled={generating}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              <DownloadIcon className="size-4" />
              {generating ? "Generating…" : "Download PDF"}
            </Button>
            <Link href={`/components/${component.id}/documents/${doc.document_number}`}>
              <Button variant="outline" size="sm">
                <FileTextIcon className="size-4" /> Back to Document
              </Button>
            </Link>
            <Link href={`/components/${component.id}/send`}>
              <Button variant="ghost" size="sm">
                <RotateCcwIcon className="size-4" /> Record Another
              </Button>
            </Link>
          </div>
        </div>
      </div>

      {/* On-screen A4 document */}
      <div className="challan-a4 my-8 w-full max-w-[210mm] border border-border bg-white p-10 shadow-sm">
        {/* Header */}
        <header className="flex items-start justify-between border-b-2 border-emerald-700 pb-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-emerald-800">
              AK Precision Components
            </h1>
            <p className="mt-1 text-sm text-zinc-500">Material Register</p>
          </div>
          <div className="text-right">
            <p className="text-base font-semibold uppercase tracking-wider">Delivery Challan</p>
            <p className="mt-1 text-sm font-medium">{doc.document_number}</p>
            <p className="text-sm text-zinc-500">{formatDate(doc.transaction_date)}</p>
          </div>
        </header>

        <div className="mt-5 grid grid-cols-2 gap-4">
          {/* Consignee */}
          <div className="rounded-sm border border-border bg-zinc-50 p-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
              Sent To
            </p>
            <p className="mt-1 font-semibold">{partyName}</p>
            {doc.party_location && <p className="text-sm text-zinc-600">{doc.party_location}</p>}
            {doc.party_contact && <p className="text-sm text-zinc-600">{doc.party_contact}</p>}
          </div>

          {/* Challan details */}
          <div className="flex flex-col justify-center rounded-sm border border-border bg-zinc-50 p-3">
            <div className="grid grid-cols-2 gap-y-1 text-sm">
              <span className="text-zinc-500">Challan No.</span>
              <span className="text-right font-medium">{doc.document_number}</span>
              <span className="text-zinc-500">Date</span>
              <span className="text-right">{formatDate(doc.transaction_date)}</span>
            </div>
          </div>
        </div>

        {/* Material table — natural layout, no filler rows */}
        <table className="mt-5 w-full border-collapse border border-border text-sm">
          <thead>
            <tr className="border-b border-border bg-zinc-100 text-left text-xs uppercase tracking-wider text-zinc-500">
              <th className="w-10 border-r border-border px-2 py-2 font-semibold">Sr.</th>
              <th className="border-r border-border px-2 py-2 font-semibold">Item</th>
              <th className="w-32 border-r border-border px-2 py-2 font-semibold">Part Code</th>
              <th className="w-20 border-r border-border px-2 py-2 text-right font-semibold">Qty</th>
              <th className="w-20 border-r border-border px-2 py-2 font-semibold">Unit</th>
              <th className="w-24 border-r border-border px-2 py-2 text-right font-semibold">Rate</th>
              <th className="w-28 px-2 py-2 text-right font-semibold">Amount</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, i) => (
              <tr key={item.id} className="border-b border-border">
                <td className="border-r border-border px-2 py-2 text-center text-zinc-500">{i + 1}</td>
                <td className="border-r border-border px-2 py-2 font-medium">{item.item_name}</td>
                <td className="border-r border-border px-2 py-2 text-zinc-500">{partCodeFor(item)}</td>
                <td className="border-r border-border px-2 py-2 text-right">
                  {new Intl.NumberFormat("en-IN").format(Number(item.quantity))}
                </td>
                <td className="border-r border-border px-2 py-2">
                  {UNIT_SHORT[item.unit] ?? item.unit}
                </td>
                <td className="border-r border-border px-2 py-2 text-right">
                  {item.unit_price != null ? formatINR(item.unit_price) : "—"}
                </td>
                <td className="px-2 py-2 text-right font-medium">{formatINR(item.line_total)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Totals */}
        <div className="mt-2 flex flex-col items-end gap-1">
          <div className="flex w-64 justify-between text-sm">
            <span className="text-zinc-600">Total (Excl. GST)</span>
            <span>{formatINR(doc.subtotal)}</span>
          </div>
          <div className="flex w-64 justify-between text-sm">
            <span className="text-zinc-600">Total GST</span>
            <span>{formatINR(doc.gst_total)}</span>
          </div>
          <div className="flex w-64 justify-between border-t border-zinc-300 pt-1 text-sm font-semibold">
            <span>Total Amount</span>
            <span>{formatINR(doc.total_amount)}</span>
          </div>
        </div>

        {/* Notes */}
        {doc.notes ? (
          <div className="mt-4 rounded-sm border border-border bg-zinc-50 p-3 text-sm">
            <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Remarks</p>
            <p className="mt-1 whitespace-pre-wrap text-zinc-700">{doc.notes}</p>
          </div>
        ) : null}

        {/* Signature footer */}
        <div className="mt-10 flex justify-between pt-4">
          <div className="flex w-1/3 flex-col items-center">
            <div className="mb-1 h-14 w-full border-b border-dashed border-zinc-300" />
            <span className="text-xs uppercase tracking-wider text-zinc-500">Prepared By</span>
          </div>
          <div className="flex w-1/3 flex-col items-center">
            <div className="mb-1 h-14 w-full border-b border-dashed border-zinc-300" />
            <span className="text-xs uppercase tracking-wider text-zinc-500">
              Receiver&apos;s Signature
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}