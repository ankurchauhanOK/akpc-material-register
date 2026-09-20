"use client";

import { Fragment, useState } from "react";
import Link from "next/link";
import { DownloadIcon, FileTextIcon, PrinterIcon, RotateCcwIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { renderChallanPdf } from "@/lib/challan/challan-pdf";
import { buildChallanView } from "@/lib/challan/challan-view";
import { UNIT_LABELS } from "@/lib/supabase/types";
import type { Tables, Enums } from "@/lib/supabase/database.types";

type Material = Tables<"materials">;
type DocItem = Tables<"receiving_document_items">;
type UnitType = Enums<"unit_type">;

type PreviewDoc = Tables<"receiving_documents"> & {
  items: DocItem[];
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
  component: Material | null;
  partCode: string | null;
}) {
  const [generating, setGenerating] = useState(false);
  const view = buildChallanView(doc, partCode);
  const fromName = view.fromName;
  const fromLines = view.fromLines;
  const partyName = view.toName;
  const toLines = view.toLines;

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
        component?.name ?? "Goods",
        component ? UNIT_LABELS[component.unit as UnitType] : "",
        doc.items ?? [],
        doc,
        partCode
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
            <Link
              href={
                component
                  ? `/components/${component.id}/documents/${doc.document_number}`
                  : `/documents/${doc.document_number}`
              }
            >
              <Button variant="outline" size="sm">
                <FileTextIcon className="size-4" /> Back to Document
              </Button>
            </Link>
            <Link
              href={component ? `/components/${component.id}/send` : "/give"}
            >
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
            <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
              From
            </p>
            <h1 className="mt-1 text-xl font-bold uppercase tracking-tight text-zinc-900">
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
              {view.documentTitle}
            </p>
            <div className="mt-3 grid grid-cols-[minmax(0,1fr)_auto] gap-x-6 gap-y-1 text-sm [&>*:nth-child(odd)]:text-zinc-500">
              {view.meta.map((m) => (
                <Fragment key={m.label}>
                  <span className="text-left">{m.label}</span>
                  <span className={`text-right ${m.strong ? "font-semibold" : ""}`}>
                    {m.value}
                  </span>
                </Fragment>
              ))}
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
            {view.toContact && <p>{view.toContact}</p>}
          </div>
          <p className="mt-1 text-sm text-zinc-700">
            {view.toGstin ? `GST No: ${view.toGstin}` : ""}
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
            {view.rows.map((row, i) => (
              <tr key={i} className="border border-zinc-400">
                <td className="border border-zinc-400 px-2 py-2 text-center text-zinc-600">{row.sno}</td>
                <td className="border border-zinc-400 px-2 py-2 text-zinc-600">
                  {row.hsn}
                </td>
                <td className="border border-zinc-400 px-2 py-2 text-zinc-900">
                  <p className="font-medium">{row.description}</p>
                  {row.showPartCode && row.partCode ? (
                    <p className="text-xs text-zinc-500">{row.partCode}</p>
                  ) : null}
                </td>
                <td className="border border-zinc-400 px-2 py-2 text-right">
                  {row.qty}
                </td>
                <td className="border border-zinc-400 px-2 py-2">
                  {row.unit}
                </td>
                <td className="border border-zinc-400 px-2 py-2 text-zinc-700">
                  {row.remarks}
                </td>
              </tr>
            ))}
            {/* Empty rows to keep the physical form format */}
            {view.emptyRows > 0 &&
              Array.from({ length: view.emptyRows }).map((_, i) => (
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