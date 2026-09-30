"use client";

import { Fragment, useState } from "react";
import Link from "next/link";
import { ArrowLeftIcon, DownloadIcon, PrinterIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { renderInvoicePdf } from "@/lib/invoices/invoice-pdf";
import { buildInvoiceView } from "@/lib/invoices/invoice-view";
import type { InvoiceDetail } from "@/lib/invoices/types";

/**
 * Client A4 Tax Invoice preview, reproducing the printed AKPC invoice:
 * three-column header (GSTIN / Bill No / Bill Date | Tax Invoice | E-mail),
 * the company bar, side-by-side BILLED TO + DELIVERY ADDRESS blocks, the
 * 7-column item table, the CGST / SGST / Rounding / Total block with the
 * amount in words, the HSN tax summary, Terms & Conditions, Declaration,
 * bank details and the Authorized Signatory area.
 *
 * Print prints this A4 directly; Download PDF regenerates the same document
 * through the on-demand renderer. Both read buildInvoiceView(), so the two can
 * never disagree.
 */
export function InvoicePreview({ invoice }: { invoice: InvoiceDetail }) {
  const [generating, setGenerating] = useState(false);
  const view = buildInvoiceView(invoice);

  async function downloadPdf() {
    if (generating) return;
    setGenerating(true);
    try {
      const blob = await renderInvoicePdf(invoice);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      // Slashes are illegal in a filename; the timestamp cache-busts so a stale
      // same-named download can never appear to have the old layout.
      a.download = `${invoice.invoice_number.replace(/\//g, "-")}-${Date.now()}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      // Generation failed (e.g. renderer blew up on a very long line): leave
      // the on-screen A4 as the fallback, the user can still Print.
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
            <h1 className="text-lg font-semibold tracking-tight">
              {view.documentTitle}
            </h1>
            <p className="text-xs text-muted-foreground">
              Bill No. {invoice.invoice_number} · preview
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={`/invoices/${invoice.invoice_number}`}
              className="inline-flex"
            >
              <Button variant="ghost" size="sm">
                <ArrowLeftIcon className="size-4" /> Back to Invoice
              </Button>
            </Link>
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
          </div>
        </div>
      </div>

      {/* On-screen A4 document */}
      <div className="invoice-a4 my-8 w-full max-w-[210mm] border border-border bg-white p-10 shadow-sm">
        {/* Header: GSTIN + Bill meta (left) | Tax Invoice (center) | E-mail (right) */}
        <div className="grid grid-cols-3 gap-4">
          <div>
            <p className="text-xs text-zinc-500">GSTIN</p>
            <p className="text-sm font-semibold text-zinc-900">{view.ourGstin}</p>
            <dl className="mt-2 space-y-0.5 text-xs">
              {view.meta.map((m) => (
                <Fragment key={m.label}>
                  <dt className="inline text-zinc-500">{m.label}: </dt>
                  <dd className="inline font-medium text-zinc-900">
                    {m.value}
                  </dd>
                </Fragment>
              ))}
            </dl>
          </div>
          <div className="text-center">
            <h2 className="text-2xl font-bold uppercase tracking-tight text-zinc-900">
              {view.documentTitle}
            </h2>
          </div>
          <div className="text-right">
            <p className="text-xs text-zinc-500">E-mail</p>
            <p className="text-sm text-zinc-900">{view.ourEmail ?? "—"}</p>
          </div>
        </div>

        {/* Company bar */}
        <div className="mt-4 border-y border-zinc-300 py-3 text-center">
          <h3 className="text-xl font-bold uppercase tracking-tight text-zinc-900">
            {view.brandName}
          </h3>
          {view.brandAddress ? (
            <p className="mt-1 text-sm text-zinc-600">{view.brandAddress}</p>
          ) : null}
        </div>

        {/* Billed To + Delivery Address — two blocks, one customer */}
        <div className="mt-4 grid grid-cols-2 gap-3">
          <PartyBlock block={view.billedTo} />
          <PartyBlock block={view.deliveryTo} />
        </div>

        {/* Item table */}
        <table className="mt-5 w-full border-collapse border border-zinc-400 text-sm">
          <thead>
            <tr className="border border-zinc-400 bg-zinc-100 text-left text-[11px] uppercase tracking-wider text-zinc-600">
              <th className="w-[30px] border border-zinc-400 px-2 py-2 text-center font-semibold">
                Sl. No.
              </th>
              <th className="border border-zinc-400 px-2 py-2 font-semibold">
                Description of Goods or Service
              </th>
              <th className="w-[62px] border border-zinc-400 px-2 py-2 font-semibold">
                HSN
              </th>
              <th className="w-[48px] border border-zinc-400 px-2 py-2 font-semibold">
                Unit
              </th>
              <th className="w-[68px] border border-zinc-400 px-2 py-2 text-right font-semibold">
                Qty
              </th>
              <th className="w-[68px] border border-zinc-400 px-2 py-2 text-right font-semibold">
                Rate
              </th>
              <th className="w-[77px] border border-zinc-400 px-2 py-2 text-right font-semibold">
                Amount
              </th>
            </tr>
          </thead>
          <tbody>
            {view.rows.map((row) => (
              <tr key={row.sno} className="border border-zinc-400">
                <td className="border border-zinc-400 px-2 py-1.5 text-center text-zinc-600">
                  {row.sno}
                </td>
                <td className="border border-zinc-400 px-2 py-1.5 text-zinc-900">
                  {row.description}
                </td>
                <td className="border border-zinc-400 px-2 py-1.5 text-zinc-600">
                  {row.hsn}
                </td>
                <td className="border border-zinc-400 px-2 py-1.5 text-zinc-600">
                  {row.unit}
                </td>
                <td className="border border-zinc-400 px-2 py-1.5 text-right">
                  {row.qty}
                </td>
                <td className="border border-zinc-400 px-2 py-1.5 text-right">
                  {row.rate}
                </td>
                <td className="border border-zinc-400 px-2 py-1.5 text-right font-medium">
                  {row.amount}
                </td>
              </tr>
            ))}
            {view.emptyRows > 0 &&
              Array.from({ length: view.emptyRows }).map((_, i) => (
                <tr key={`empty-${i}`} className="border border-zinc-400">
                  <td className="h-6 border border-zinc-400" />
                  <td className="border border-zinc-400" />
                  <td className="border border-zinc-400" />
                  <td className="border border-zinc-400" />
                  <td className="border border-zinc-400" />
                  <td className="border border-zinc-400" />
                  <td className="border border-zinc-400" />
                </tr>
              ))}
          </tbody>
        </table>

        {/* Totals */}
        <div className="mt-3 flex justify-end">
          <div className="w-[280px] space-y-1 text-sm">
            <TotalRow label="Subtotal" value={view.subtotal} />
            <TotalRow label="CGST" value={view.cgst} />
            <TotalRow label="SGST" value={view.sgst} />
            <TotalRow label="Rounding" value={view.rounding} />
            <div className="flex justify-between border-t border-zinc-400 pt-1.5 text-base font-bold">
              <span>Total</span>
              <span>{view.total}</span>
            </div>
            {view.roundingNote ? (
              <p className="pt-1 text-[10px] italic text-zinc-500">
                {view.roundingNote}
              </p>
            ) : null}
            <p className="pt-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
              Amount Chargeable (in words)
            </p>
            <p className="text-xs font-semibold text-zinc-900">
              {view.amountInWords}
            </p>
          </div>
        </div>

        {/* HSN tax summary */}
        <div className="mt-6">
          <h4 className="mb-1 text-xs font-semibold uppercase tracking-wider text-zinc-600">
            Tax Summary
          </h4>
          <table className="w-full border-collapse border border-zinc-400 text-[11px]">
            <thead>
              <tr className="border border-zinc-400 bg-zinc-100 text-zinc-600">
                <th className="border border-zinc-400 px-1.5 py-1 text-left font-semibold">
                  HSN/SAC
                </th>
                <th className="border border-zinc-400 px-1.5 py-1 text-right font-semibold">
                  Taxable Value
                </th>
                <th
                  className="border border-zinc-400 px-1.5 py-1 text-center font-semibold"
                  colSpan={2}
                >
                  Central Tax
                </th>
                <th
                  className="border border-zinc-400 px-1.5 py-1 text-center font-semibold"
                  colSpan={2}
                >
                  State Tax
                </th>
                <th className="border border-zinc-400 px-1.5 py-1 text-right font-semibold">
                  Total Tax
                </th>
              </tr>
              <tr className="border border-zinc-400 bg-zinc-50 text-zinc-500">
                <th className="border border-zinc-400" />
                <th className="border border-zinc-400" />
                <th className="border border-zinc-400 px-1.5 py-0.5 text-right font-medium">
                  Rate
                </th>
                <th className="border border-zinc-400 px-1.5 py-0.5 text-right font-medium">
                  Amount
                </th>
                <th className="border border-zinc-400 px-1.5 py-0.5 text-right font-medium">
                  Rate
                </th>
                <th className="border border-zinc-400 px-1.5 py-0.5 text-right font-medium">
                  Amount
                </th>
                <th className="border border-zinc-400" />
              </tr>
            </thead>
            <tbody>
              {view.hsnRows.map((r) => (
                <tr key={r.key} className="border border-zinc-400">
                  <td className="border border-zinc-400 px-1.5 py-1">{r.hsn}</td>
                  <td className="border border-zinc-400 px-1.5 py-1 text-right">
                    {r.taxableValue}
                  </td>
                  <td className="border border-zinc-400 px-1.5 py-1 text-right">
                    {r.cgstRate}
                  </td>
                  <td className="border border-zinc-400 px-1.5 py-1 text-right">
                    {r.cgstAmount}
                  </td>
                  <td className="border border-zinc-400 px-1.5 py-1 text-right">
                    {r.sgstRate}
                  </td>
                  <td className="border border-zinc-400 px-1.5 py-1 text-right">
                    {r.sgstAmount}
                  </td>
                  <td className="border border-zinc-400 px-1.5 py-1 text-right font-medium">
                    {r.totalTax}
                  </td>
                </tr>
              ))}
              <tr className="border border-zinc-400 font-semibold">
                <td className="border border-zinc-400 px-1.5 py-1 text-right">
                  Total
                </td>
                <td className="border border-zinc-400 px-1.5 py-1 text-right">
                  {view.hsnTotals.taxableValue}
                </td>
                <td className="border border-zinc-400" />
                <td className="border border-zinc-400 px-1.5 py-1 text-right">
                  {view.hsnTotals.cgstAmount}
                </td>
                <td className="border border-zinc-400" />
                <td className="border border-zinc-400 px-1.5 py-1 text-right">
                  {view.hsnTotals.sgstAmount}
                </td>
                <td className="border border-zinc-400 px-1.5 py-1 text-right">
                  {view.hsnTotals.totalTax}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Footer: terms + declaration (left) | bank + signature (right) */}
        <div className="mt-6 grid grid-cols-2 gap-6 text-[11px]">
          <div>
            {view.terms.length > 0 ? (
              <>
                <h4 className="font-semibold uppercase tracking-wider text-zinc-600">
                  Term &amp; Condition
                </h4>
                <ol className="mt-1 list-decimal space-y-0.5 pl-4 text-zinc-700">
                  {view.terms.map((t, i) => (
                    <li key={i}>{t.replace(/^\d+\.\s*/, "")}</li>
                  ))}
                </ol>
              </>
            ) : null}
            {view.declaration ? (
              <>
                <h4 className="mt-3 font-semibold uppercase tracking-wider text-zinc-600">
                  Declaration
                </h4>
                <p className="mt-1 text-zinc-700">{view.declaration}</p>
              </>
            ) : null}
          </div>

          <div className="flex flex-col justify-between">
            {view.bank.length > 0 ? (
              <div>
                <h4 className="font-semibold uppercase tracking-wider text-zinc-600">
                  Bank Details
                </h4>
                <dl className="mt-1 space-y-0.5 text-zinc-700">
                  {view.bank.map((b) => (
                    <div key={b.label} className="flex gap-1">
                      <dt className="w-[52px] shrink-0 text-zinc-500">
                        {b.label}
                      </dt>
                      <dd className="font-medium">{b.value}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            ) : null}

            <div className="mt-6 text-right">
              <p className="text-xs font-semibold text-zinc-900">
                For {view.signatureFor}
              </p>
              <div className="mt-10 h-px w-[150px] bg-zinc-400" />
              <p className="text-[11px] text-zinc-600">{view.signatureLabel}</p>
              <p className="text-[11px] text-zinc-500">{view.signatureSub}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function PartyBlock({
  block,
}: {
  block: ReturnType<typeof buildInvoiceView>["billedTo"];
}) {
  return (
    <div className="rounded-sm border border-zinc-300 p-2.5">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
        {block.heading}
      </p>
      <p className="mt-1 text-sm font-semibold text-zinc-900">{block.name}</p>
      {block.lines.map((l, i) => (
        <p key={i} className="text-[11px] text-zinc-700">
          {l}
        </p>
      ))}
      {block.gstin ? (
        <p className="text-[11px] text-zinc-700">GSTIN: {block.gstin}</p>
      ) : null}
      {block.contact ? (
        <p className="text-[11px] text-zinc-600">{block.contact}</p>
      ) : null}
      {block.email ? (
        <p className="text-[11px] text-zinc-600">{block.email}</p>
      ) : null}
    </div>
  );
}

function TotalRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-zinc-700">
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}
