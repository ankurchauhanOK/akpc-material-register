"use client";

import { useEffect, useState } from "react";
import { FileDownIcon, FileTextIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TypeBadge } from "@/components/records/type-badge";
import { renderChallanPdf } from "@/lib/challan/challan-pdf";
import { createSignedChallanUrl } from "@/lib/supabase/storage";
import { formatDate, formatINR } from "@/lib/format";
import { UNIT_LABELS } from "@/lib/supabase/types";
import { useMobileHeaderTitle } from "@/components/layout/mobile-header-context";
import type { Tables } from "@/lib/supabase/database.types";

type Material = Tables<"materials">;
type Tx = Tables<"transactions">;
type DocItem = Tables<"receiving_document_items">;

/** A v2 receiving document (header) with its line items, or null for legacy. */
type DocumentLike = Tx & {
  subtotal?: number;
  gst_total?: number;
  items: DocItem[] | null;
};

export function DocumentDetail({
  transaction,
  component,
}: {
  transaction: DocumentLike;
  component: Material;
}) {
  const isReceive = transaction.type === "received";
  const hasItems = Boolean(transaction.items);
  const [sourceUrl, setSourceUrl] = useState<string | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const { setTitle } = useMobileHeaderTitle();

  useEffect(() => {
    setTitle(transaction.transaction_number);
    return () => setTitle(null);
  }, [transaction.transaction_number, setTitle]);

  useEffect(() => {
    const path = transaction.external_document_path || transaction.challan_path;
    if (!path) return;
    let cancelled = false;
    createSignedChallanUrl(path).then((u) => {
      if (!cancelled) setSourceUrl(u);
    });
    return () => {
      cancelled = true;
    };
  }, [transaction.external_document_path, transaction.challan_path]);

  async function generatePdf() {
    if (generating) return;
    setGenerating(true);
    try {
      const blob = await renderChallanPdf(
        transaction,
        component.name,
        UNIT_LABELS[component.unit],
        hasItems ? transaction.items : null,
        transaction.subtotal,
        transaction.gst_total
      );
      setPdfUrl(URL.createObjectURL(blob));
    } finally {
      setGenerating(false);
    }
  }

  const isPdf = sourceUrl?.includes(".pdf");

  return (
    <div className="mx-auto max-w-xl">
      <div className="rounded-xl border bg-white p-5">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <TypeBadge type={transaction.type} />
            <h1 className="text-xl font-semibold tracking-tight">
              {transaction.transaction_number}
            </h1>
          </div>
          <span className="text-sm text-zinc-500">{formatDate(transaction.transaction_date)}</span>
        </div>

        <dl className="grid gap-3 text-sm">
          <Row
            label={isReceive ? "Received From" : "Sent To"}
            value={transaction.party_name ?? "—"}
          />
          {transaction.party_location && (
            <Row label="Location" value={transaction.party_location} />
          )}
          {transaction.challan_number && (
            <Row label="Source Challan No." value={transaction.challan_number} />
          )}
        </dl>
      </div>

      {/* Line items (v2 multi-item document) */}
      {hasItems && (transaction.items?.length ?? 0) > 0 && (
        <div className="mt-4 rounded-xl border bg-white">
          <div className="border-b px-4 py-2 text-sm font-semibold">Items</div>
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
                <th className="px-3 py-2 font-medium">#</th>
                <th className="px-3 py-2 font-medium">Item</th>
                <th className="px-3 py-2 font-medium">Unit</th>
                <th className="px-3 py-2 text-right font-medium">Qty</th>
                <th className="px-3 py-2 text-right font-medium">Rate (₹)</th>
                <th className="px-3 py-2 text-right font-medium">GST%</th>
                <th className="px-3 py-2 text-right font-medium">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {transaction.items!.map((item, i) => (
                <tr key={item.id}>
                  <td className="px-3 py-2 text-sm text-muted-foreground">
                    {String(i + 1).padStart(2, "0")}
                  </td>
                  <td className="px-3 py-2 text-sm font-medium">{item.item_name}</td>
                  <td className="px-3 py-2 text-sm text-muted-foreground">
                    {UNIT_LABELS[item.unit]}
                  </td>
                  <td className="px-3 py-2 text-right text-sm">
                    {new Intl.NumberFormat("en-IN").format(Number(item.quantity))}
                  </td>
                  <td className="px-3 py-2 text-right text-sm">
                    {item.unit_price != null ? formatINR(item.unit_price) : "—"}
                  </td>
                  <td className="px-3 py-2 text-right text-sm">
                    {item.gst_percent}%
                  </td>
                  <td className="px-3 py-2 text-right text-sm font-medium">
                    {formatINR(item.line_total)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="border-t px-4 py-3 flex flex-col gap-1.5">
            <Row label="Total (Excl. GST)" value={formatINR(transaction.subtotal ?? 0)} />
            <Row label="Total GST" value={formatINR(transaction.gst_total ?? 0)} />
            <Row
              label="Total (Incl. GST)"
              value={formatINR(transaction.total_amount)}
            />
          </div>
        </div>
      )}

      {/* Legacy single-item document */}
      {!hasItems && (
        <div className="mt-4 rounded-xl border bg-white p-5">
          <dl className="grid gap-3 text-sm">
            <Row label="Component" value={component.name} />
            <Row
              label="Quantity"
              value={`${new Intl.NumberFormat("en-IN").format(transaction.pieces)} ${UNIT_LABELS[component.unit]}`}
            />
            {(transaction.unit_price ?? null) != null && (
              <Row label="Unit Price" value={formatINR(transaction.unit_price ?? 0)} />
            )}
            <Row label="Total Amount" value={formatINR(transaction.total_amount)} />
          </dl>
        </div>
      )}

      {/* Generated AKPC challan */}
      <div className="mt-4 rounded-xl border bg-white p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold">AKPC {isReceive ? "Receiving" : "Delivery"} Challan</p>
            <p className="text-xs text-zinc-500">Generated on demand · A4</p>
          </div>
          {pdfUrl ? (
            <a
              href={pdfUrl}
              download={`${transaction.transaction_number}.pdf`}
              className="inline-flex h-10 items-center rounded-lg bg-emerald-600 px-3 text-sm font-medium text-white hover:bg-emerald-700"
            >
              <FileDownIcon className="size-4" /> Download PDF
            </a>
          ) : (
            <Button onClick={generatePdf} disabled={generating}>
              <FileTextIcon className="size-4" />
              {generating ? "Generating…" : "Generate challan"}
            </Button>
          )}
        </div>
      </div>

      {/* External / source attachment */}
      {(transaction.external_document_path || transaction.challan_path) && (
        <div className="mt-4 rounded-xl border bg-white p-4">
          <p className="mb-2 text-sm font-semibold">Source / External document</p>
          {sourceUrl ? (
            isPdf ? (
              <a
                href={sourceUrl}
                target="_blank"
                rel="noreferrer"
                className="text-sm font-medium text-emerald-600 underline"
              >
                Open / Download
              </a>
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={sourceUrl}
                alt="Source document"
                className="aspect-[4/3] w-full rounded-lg border object-cover"
              />
            )
          ) : (
            <p className="text-sm text-zinc-400">Loading…</p>
          )}
        </div>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b pb-2 last:border-0 last:pb-0">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium">{value}</dd>
    </div>
  );
}
