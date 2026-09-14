"use client";

import { useState } from "react";
import Link from "next/link";
import { DownloadIcon, FileTextIcon, PrinterIcon, RotateCcwIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { renderChallanPdf } from "@/lib/challan/challan-pdf";
import { formatDate } from "@/lib/format";
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
  pieces: "Nos",
  kg: "Kg",
  meter: "Mtr",
  litre: "Ltr",
  set: "Set",
};

/**
 * Client Challan Preview / Document Viewer for a saved Send document.
 *
 * Renders an on-screen A4 DELIVERY CHALLAN mimicking the physical AKPC
 * challan (FROM / TO blocks, DC metadata, GST/PAN, item table with
 * HSN/SAC + Remarks). Print prints the on-screen A4 directly. Download
 * PDF regenerates the same document via the on-demand renderer.
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
  const fromName = doc.our_company_name || "AK Precision Components";
  const fromLines = [
    doc.our_address,
    doc.our_city,
    doc.our_pincode ? [doc.our_state, doc.our_pincode].filter(Boolean).join(" ") : doc.our_state,
  ].filter(Boolean);
  const partyName = doc.party_name || doc.party_company || "—";
  const toLines = [
    doc.party_location,
    doc.party_post,
    doc.party_pincode ? [doc.party_state, doc.party_pincode].filter(Boolean).join(" ") : doc.party_state,
  ].filter(Boolean);

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
        doc
      );
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${doc.document_number.replace(/\//g, "-")}.pdf`;
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
        {/* Header: FROM (left) + DC metadata (right) */}
        <div className="flex items-start justify-between gap-6">
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-bold tracking-tight text-zinc-900">
              {fromName}
            </h1>
            <div className="mt-2 space-y-0.5 text-sm text-zinc-600">
              {fromLines.map((l, i) => (
                <p key={i}>{l}</p>
              ))}
            </div>
          </div>
          <div className="shrink-0 text-right">
            <p className="text-lg font-bold uppercase tracking-wide text-zinc-900">
              Delivery Challan
            </p>
            <div className="mt-3 grid grid-cols-[minmax(0,1fr)_auto] gap-x-6 gap-y-1 text-sm [&>*:nth-child(odd)]:text-zinc-500">
              <span className="text-left">DC No</span>
              <span className="text-right font-semibold">{doc.document_number}</span>
              <span className="text-left">DC Date</span>
              <span className="text-right font-medium">{formatDate(doc.transaction_date)}</span>
              <span className="text-left">Customer Ref. No.</span>
              <span className="text-right">{doc.customer_ref_no ?? "—"}</span>
              <span className="text-left">Customer Ref. Date</span>
              <span className="text-right">
                {doc.customer_ref_date ? formatDate(doc.customer_ref_date) : "—"}
              </span>
              <span className="text-left">GST No</span>
              <span className="text-right">{doc.our_gstin ?? "—"}</span>
              <span className="text-left">PAN No</span>
              <span className="text-right">{doc.our_pan ?? "—"}</span>
            </div>
          </div>
        </div>

        <hr className="my-4 border-zinc-300" />

        {/* TO section */}
        <div className="rounded-sm border border-zinc-300 p-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
            To
          </p>
          <p className="mt-1 font-semibold text-zinc-900">{partyName}</p>
          <div className="mt-0.5 space-y-0.5 text-sm text-zinc-700">
            {toLines.map((l, i) => (
              <p key={i}>{l}</p>
            ))}
            {doc.party_contact && <p>{doc.party_contact}</p>}
          </div>
          <p className="mt-1 text-sm text-zinc-700">
            {doc.party_gstin ? `GST No: ${doc.party_gstin}` : ""}
          </p>
        </div>

        {/* Material table */}
        <table className="mt-5 w-full border-collapse border border-zinc-400 text-sm">
          <thead>
            <tr className="border border-zinc-400 bg-zinc-100 text-left text-xs uppercase tracking-wider text-zinc-600">
              <th className="w-10 border border-zinc-400 px-2 py-2 text-center font-semibold">S. No.</th>
              <th className="w-20 border border-zinc-400 px-2 py-2 font-semibold">HSN/SAC</th>
              <th className="border border-zinc-400 px-2 py-2 font-semibold">Description of Goods</th>
              <th className="w-20 border border-zinc-400 px-2 py-2 text-right font-semibold">MOQ</th>
              <th className="w-16 border border-zinc-400 px-2 py-2 font-semibold">Unit</th>
              <th className="border border-zinc-400 px-2 py-2 font-semibold">Remarks</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, i) => (
              <tr key={item.id} className="border border-zinc-400">
                <td className="border border-zinc-400 px-2 py-2 text-center text-zinc-600">{i + 1}</td>
                <td className="border border-zinc-400 px-2 py-2 text-zinc-600">
                  {item.hsn_code || "—"}
                </td>
                <td className="border border-zinc-400 px-2 py-2 text-zinc-900">
                  <p className="font-medium">{item.item_name}</p>
                  {item.line_type === "component" && partCode ? (
                    <p className="text-xs text-zinc-500">{partCode}</p>
                  ) : null}
                </td>
                <td className="border border-zinc-400 px-2 py-2 text-right">
                  {new Intl.NumberFormat("en-IN").format(Number(item.quantity))}
                </td>
                <td className="border border-zinc-400 px-2 py-2">
                  {UNIT_SHORT[item.unit] ?? item.unit}
                </td>
                <td className="border border-zinc-400 px-2 py-2 text-zinc-700">
                  {item.item_remarks || "—"}
                </td>
              </tr>
            ))}
            {/* Empty rows to keep the physical form format */}
            {items.length < 8 &&
              Array.from({ length: 8 - items.length }).map((_, i) => (
                <tr key={`empty-${i}`} className="border border-zinc-400">
                  <td className="h-7 border border-zinc-400 px-2 py-2" />
                  <td className="border border-zinc-400 px-2 py-2" />
                  <td className="border border-zinc-400 px-2 py-2" />
                  <td className="border border-zinc-400 px-2 py-2" />
                  <td className="border border-zinc-400 px-2 py-2" />
                  <td className="border border-zinc-400 px-2 py-2" />
                </tr>
              ))}
          </tbody>
        </table>

        {/* Signature footer */}
        <div className="mt-12 flex justify-between">
          <div className="flex w-1/2 flex-col items-center">
            <div className="mb-1 h-14 w-full border-b border-dashed border-zinc-400" />
            <span className="text-xs uppercase tracking-wider text-zinc-500">
              Prepared By
            </span>
          </div>
          <div className="flex w-1/3 flex-col items-center">
            <div className="mb-1 h-14 w-full border-b border-dashed border-zinc-400" />
            <span className="text-center text-xs uppercase tracking-wider text-zinc-500">
              Receiver&apos;s Signature
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}