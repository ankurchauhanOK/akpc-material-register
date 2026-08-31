"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { FileDownIcon, FileTextIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TypeBadge } from "@/components/records/type-badge";
import { renderChallanPdf } from "@/lib/challan/challan-pdf";
import { createSignedChallanUrl } from "@/lib/supabase/storage";
import { formatDate, formatINR } from "@/lib/format";
import { UNIT_LABELS } from "@/lib/supabase/types";
import type { Tables } from "@/lib/supabase/database.types";

type Material = Tables<"materials">;
type Tx = Tables<"transactions">;

export function DocumentDetail({
  transaction,
  component,
}: {
  transaction: Tx;
  component: Material;
}) {
  const isReceive = transaction.type === "received";
  const [sourceUrl, setSourceUrl] = useState<string | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);

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
        transaction as Tx & { party_name: string | null },
        component.name,
        UNIT_LABELS[component.unit]
      );
      setPdfUrl(URL.createObjectURL(blob));
    } finally {
      setGenerating(false);
    }
  }

  const isPdf = sourceUrl?.includes(".pdf");

  return (
    <div className="mx-auto max-w-xl">
      <Link
        href={`/components/${component.id}`}
        className="mb-3 inline-block text-sm font-medium text-emerald-600 hover:underline"
      >
        ← {component.name}
      </Link>

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
          <Row label="Component" value={component.name} />
          <Row
            label={isReceive ? "Received From" : "Sent To"}
            value={transaction.party_name ?? "—"}
          />
          {transaction.party_location && (
            <Row label="Location" value={transaction.party_location} />
          )}
          <Row
            label="Quantity"
            value={`${new Intl.NumberFormat("en-IN").format(transaction.pieces)} ${UNIT_LABELS[component.unit]}`}
          />
          {transaction.unit_price != null && (
            <Row label="Unit Price" value={formatINR(transaction.unit_price)} />
          )}
          <Row label="Total Amount" value={formatINR(transaction.total_amount)} />
          {transaction.challan_number && (
            <Row label="Source Challan No." value={transaction.challan_number} />
          )}
        </dl>
      </div>

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
