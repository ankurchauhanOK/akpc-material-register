"use client";

import { Fragment, useState } from "react";
import Link from "next/link";
import {
  ArrowLeftIcon,
  CheckIcon,
  DownloadIcon,
  FileTextIcon,
  PrinterIcon,
  RotateCcwIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { renderChallanPdf } from "@/lib/challan/challan-pdf";
import { buildChallanView, type ChallanDoc } from "@/lib/challan/challan-view";
import { UNIT_LABELS } from "@/lib/supabase/types";
import type { Tables, Enums } from "@/lib/supabase/database.types";

type Material = Tables<"materials">;
type UnitType = Enums<"unit_type">;

/**
 * Client Challan Preview / Document Viewer.
 *
 * Renders an on-screen A4 DELIVERY CHALLAN mimicking the physical AKPC
 * challan (FROM / TO blocks, DC metadata, GST/PAN, item table with
 * HSN/SAC + Remarks). Print prints the on-screen A4 directly. Download
 * PDF regenerates the same document via the on-demand renderer.
 *
 * Two modes:
 *  - saved (default): reads a persisted document; shows Print / Download /
 *    Back to Document / Record Another.
 *  - preview: renders UNSAVED client-side form data (document_number shows
 *    "DRAFT" purely as text); only Back to Edit + Confirm & Save are shown.
 *    Nothing is written to the database in this mode.
 */
export function ChallanPreview({
  doc,
  component,
  partCode,
  preview = false,
  onBack,
  onConfirm,
  saving = false,
  confirmError,
}: {
  doc: ChallanDoc;
  component: Material | null;
  partCode: string | null;
  preview?: boolean;
  onBack?: () => void;
  onConfirm?: () => void;
  saving?: boolean;
  confirmError?: string | null;
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
        (doc.items ?? []) as Tables<"receiving_document_items">[],
        doc as Tables<"receiving_documents">,
        partCode
      );
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${(doc.document_number ?? "challan").replace(/\//g, "-")}-${Date.now()}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="flex flex-col items-center">
      {/* Action bar (no print) */}
      <div className="no-print sticky top-0 z-50 w-full border-b border-border bg-white/90 backdrop-blur">
        <div className="mx-auto flex w-full max-w-[210mm] flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div>
            <h1 className="text-lg font-semibold tracking-tight">Challan Preview</h1>
            <p className="text-xs text-muted-foreground">Delivery Challan · {doc.document_number}</p>
          </div>
          {preview ? (
            <div className="flex flex-wrap items-center gap-2">
              {onBack && (
                <Button variant="outline" size="sm" onClick={onBack} disabled={saving}>
                  <ArrowLeftIcon className="size-4" /> Back to Edit
                </Button>
              )}
              {onConfirm && (
                <Button
                  size="sm"
                  onClick={onConfirm}
                  disabled={saving}
                  className="bg-emerald-600 hover:bg-emerald-700"
                >
                  <CheckIcon className="size-4" />
                  {saving ? "Saving…" : "Confirm & Save"}
                </Button>
              )}
            </div>
          ) : (
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
          )}
        </div>
        {preview && (
          <div className="border-t border-amber-200 bg-amber-50 px-4 py-2 text-center text-xs font-medium text-amber-900">
            Preview only — nothing is saved yet. The DC number is generated when
            you Confirm &amp; Save.
          </div>
        )}
      </div>

      {/* On-screen A4 document.
          Phone (<640px, `xs:` screen-only): a responsive document viewer — the
          fixed two-column header stacks and the item table scrolls inside its
          own wrapper, so nothing overflows the viewport. Print and >=640px keep
          the approved A4 layout untouched (the print stylesheet also forces
          width/padding, so the `xs:p-4` never reaches paper). */}
      <div className="challan-a4 my-8 flex w-full max-w-[210mm] flex-col border border-border bg-white p-10 shadow-sm xs:my-4 xs:p-4 sm:min-h-[297mm]">
        {/* Header: FROM (left) + DC metadata (right).
            `break-words` on the brand name is a no-op at every width that fits
            (the desktop FROM column is 253pt wide and never wraps) and only
            stops a long name from spilling over the metadata column. */}
        <div className="flex items-start justify-between gap-6 xs:flex-col xs:items-stretch xs:gap-4">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
              From
            </p>
            <h1 className="mt-1 break-words text-xl font-bold uppercase tracking-tight text-zinc-900">
              {fromName}
            </h1>
            <div className="mt-2 space-y-0.5 text-sm text-zinc-600">
              {fromLines.map((l, i) => (
                <p key={i}>{l}</p>
              ))}
            </div>
          </div>
          <div className="shrink-0 text-right xs:shrink xs:text-left">
            <p className="text-lg font-bold uppercase tracking-wide text-zinc-900">
              {view.documentTitle}
            </p>
            <div className="mt-3 grid grid-cols-[minmax(0,1fr)_auto] gap-x-6 gap-y-1 text-sm xs:gap-x-3 [&>*:nth-child(odd)]:text-zinc-500">
              {view.meta.map((m) => (
                <Fragment key={m.label}>
                  <span className="text-left">{m.label}</span>
                  <span
                    className={`break-words text-right ${m.strong ? "font-semibold" : ""}`}
                  >
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

        {/* Material table.
            Phone (`xs:`, screen-only): `table-fixed` + the percentage widths on
            the `th`s make all 6 columns fit the sheet at 320px with NO
            horizontal scrolling — the browser cannot auto-size them, and a cell
            can never widen the table (the table width is `w-full`). Prose in
            Description/Remarks wraps naturally; `break-words` is only a
            fallback for an unbreakable token (a 5+ digit MOQ at exactly 320px).
            >=640px and print fall back to `table-auto` with the original
            `w-10` / `w-20` / `w-16` widths — the approved A4, unchanged. */}
        <table className="mt-5 w-full border-collapse border border-zinc-400 text-sm xs:table-fixed xs:text-[11px] xs:leading-snug">
          <thead>
            <tr className="border border-zinc-400 bg-zinc-100 text-left text-xs uppercase tracking-wider text-zinc-600">
              <th className="w-10 border border-zinc-400 px-2 py-2 text-center font-semibold xs:w-[7%] xs:px-1 xs:py-1 xs:text-[9px] xs:leading-tight">S. No.</th>
              <th className="w-20 border border-zinc-400 px-2 py-2 font-semibold xs:w-[13%] xs:px-1 xs:py-1 xs:text-[9px] xs:leading-tight">HSN/SAC</th>
              <th className="border border-zinc-400 px-2 py-2 font-semibold xs:w-[29%] xs:px-1 xs:py-1 xs:text-[9px] xs:leading-tight">Description of Goods</th>
              <th className="w-20 border border-zinc-400 px-2 py-2 text-right font-semibold xs:w-[14%] xs:px-1 xs:py-1 xs:text-[9px] xs:leading-tight">MOQ</th>
              <th className="w-16 border border-zinc-400 px-2 py-2 font-semibold xs:w-[11%] xs:px-1 xs:py-1 xs:text-[9px] xs:leading-tight">Unit</th>
              <th className="border border-zinc-400 px-2 py-2 font-semibold xs:w-[26%] xs:px-1 xs:py-1 xs:text-[9px] xs:leading-tight">Remarks</th>
            </tr>
          </thead>
          <tbody>
            {view.rows.map((row, i) => (
              <tr key={i} className="border border-zinc-400">
                <td className="border border-zinc-400 px-2 py-2 text-center text-zinc-600 xs:px-0.5 xs:py-1 xs:text-[10px]">{row.sno}</td>
                <td className="break-words border border-zinc-400 px-2 py-2 text-zinc-600 xs:px-0.5 xs:py-1 xs:text-[10px]">
                  {row.hsn}
                </td>
                <td className="break-words border border-zinc-400 px-2 py-2 text-zinc-900 xs:px-1 xs:py-1">
                  <p className="font-medium">{row.description}</p>
                  {row.showPartCode && row.partCode ? (
                    <p className="text-xs text-zinc-500 xs:text-[10px]">{row.partCode}</p>
                  ) : null}
                </td>
                <td className="break-words border border-zinc-400 px-2 py-2 text-right xs:px-0.5 xs:py-1 xs:text-[10px]">
                  {row.qty}
                </td>
                <td className="border border-zinc-400 px-2 py-2 xs:px-0.5 xs:py-1">
                  {row.unit}
                </td>
                <td className="break-words border border-zinc-400 px-2 py-2 text-zinc-700 xs:px-1 xs:py-1">
                  {row.remarks}
                </td>
              </tr>
            ))}
            {/* Empty rows to keep the physical form format */}
            {view.emptyRows > 0 &&
              Array.from({ length: view.emptyRows }).map((_, i) => (
                <tr key={`empty-${i}`} className="border border-zinc-400">
                  <td className="h-7 border border-zinc-400 px-2 py-2 xs:px-0.5 xs:py-1" />
                  <td className="border border-zinc-400 px-2 py-2 xs:px-0.5 xs:py-1" />
                  <td className="border border-zinc-400 px-2 py-2 xs:px-1 xs:py-1" />
                  <td className="border border-zinc-400 px-2 py-2 xs:px-0.5 xs:py-1" />
                  <td className="border border-zinc-400 px-2 py-2 xs:px-0.5 xs:py-1" />
                  <td className="border border-zinc-400 px-2 py-2 xs:px-1 xs:py-1" />
                </tr>
              ))}
          </tbody>
        </table>

        {/* Absorbs the slack so the signature row is anchored to the bottom of
            the A4 content box. Zero basis: collapses if content grows, leaving
            `mt-12` below as the minimum gap. Never overlaps. */}
        <div className="flex-1" aria-hidden="true" />

        {/* Signature footer. `w-1/2` + `w-1/3` + `justify-between` is the
            approved A4 composition; on a phone the 1/3 column is too narrow for
            "Receiver's Signature", so `xs:` gives both equal halves. */}
        <div className="mt-12 flex justify-between xs:gap-4">
          <div className="flex w-1/2 flex-col items-center">
            <div className="mb-1 h-14 w-full border-b border-dashed border-zinc-400" />
            <span className="text-xs uppercase tracking-wider text-zinc-500">
              Prepared By
            </span>
          </div>
          <div className="flex w-1/3 flex-col items-center xs:w-1/2">
            <div className="mb-1 h-14 w-full border-b border-dashed border-zinc-400" />
            <span className="text-center text-xs uppercase tracking-wider text-zinc-500">
              Receiver&apos;s Signature
            </span>
          </div>
        </div>
      </div>

      {confirmError ? (
        <p
          role="alert"
          className="no-print mt-6 w-full max-w-[210mm] rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700"
        >
          {confirmError}
        </p>
      ) : null}
    </div>
  );
}