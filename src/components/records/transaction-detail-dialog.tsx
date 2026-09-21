"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { FileTextIcon } from "lucide-react";
import { TypeBadge } from "@/components/records/type-badge";
import type { RecordDocument } from "@/hooks/useTransactions";
import { createSignedChallanUrl } from "@/lib/supabase/storage";
import { createClient } from "@/lib/supabase/client";
import { formatDate, formatINR } from "@/lib/format";
import { formatQty, UNIT_SHORT } from "@/lib/challan/challan-view";

/**
 * Document detail view for Records — represents ONE challan/document with
 * all of its item lines. For legacy single-item rows it behaves like the
 * old transaction detail.
 */
export function TransactionDetailDialog({
  record,
  open,
  onOpenChange,
  canEdit,
  isAdmin,
  onEdit,
  onDelete,
}: {
  record: RecordDocument;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  canEdit: boolean;
  isAdmin: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [creatorName, setCreatorName] = useState<string>("—");

  useEffect(() => {
    if (!open) return;
    let cancelled = false;

    if (record.challanPath) {
      createSignedChallanUrl(record.challanPath)
        .then((url) => {
          if (!cancelled) setSignedUrl(url);
        })
        .catch(() => {});
    }

    if (record.createdBy) {
      createClient()
        .from("profiles")
        .select("full_name")
        .eq("id", record.createdBy)
        .maybeSingle()
        .then(({ data }) => {
          if (!cancelled && data?.full_name) setCreatorName(data.full_name);
        });
    }

    return () => {
      cancelled = true;
    };
  }, [open, record]);

  const isPdf = signedUrl?.includes(".pdf");
  const party = record.partyName ?? record.companyName;
  const category =
    record.recordCategory === "manufacturing"
      ? "Manufacturing"
      : record.recordCategory === "other"
        ? "Tools / Other"
        : "—";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogTitle>{record.documentNumber}</DialogTitle>
        <DialogDescription className="flex items-center gap-2">
          <TypeBadge type={record.type} />
          <span className="text-zinc-500">{category}</span>
        </DialogDescription>

        <dl className="grid gap-3 text-sm">
          <Row
            label={record.type === "received" ? "From" : "To"}
            value={party}
          />
          <Row label="Items" value={`${record.itemCount}`} />
          <Row label="Total Qty" value={record.totalQtyDisplay} />
          {record.source === "transactions" && (
            <Row
              label="Total amount"
              value={formatINR(
                record.items.reduce((s, i) => s + i.totalAmount, 0)
              )}
            />
          )}
          <Row label="Date" value={formatDate(record.transactionDate)} />
          {record.customerRefNo && (
            <Row label="Customer Ref. No." value={record.customerRefNo} />
          )}
          {record.customerRefDate && (
            <Row
              label="Customer Ref. Date"
              value={formatDate(record.customerRefDate)}
            />
          )}
          <Row label="Created by" value={creatorName} />
          <Row label="Created" value={formatDate(record.createdAt)} />
        </dl>

        {/* All item lines of this document */}
        <div>
          <p className="mb-1.5 text-sm font-medium">
            Items ({record.itemCount})
          </p>
          <ol className="divide-y rounded-lg border">
            {record.items.map((item) => (
              <li
                key={item.id}
                className="flex items-start justify-between gap-3 p-3"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium">{item.materialName}</p>
                  {item.hsnCode ? (
                    <p className="mt-0.5 text-xs text-zinc-500">
                      HSN/SAC: {item.hsnCode}
                    </p>
                  ) : null}
                  {item.itemRemarks ? (
                    <p className="mt-0.5 text-xs text-zinc-500">
                      {item.itemRemarks}
                    </p>
                  ) : null}
                </div>
                <p className="shrink-0 text-sm">
                  {formatQty(item.quantity)}{" "}
                  {item.materialUnit
                    ? (UNIT_SHORT[item.materialUnit] ?? item.materialUnit)
                    : ""}
                </p>
              </li>
            ))}
          </ol>
        </div>

        {/* Legacy challan attachment via signed URL — never the raw path */}
        {record.challanPath && (
          <div>
            <p className="mb-1.5 text-sm font-medium">Challan</p>
            {signedUrl ? (
              isPdf ? (
                <div className="flex items-center gap-2 rounded-lg border p-3">
                  <span className="flex-1 text-sm">PDF challan</span>
                  <a
                    href={signedUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex h-9 items-center rounded-lg bg-emerald-600 px-3 text-sm font-medium text-white hover:bg-emerald-700"
                  >
                    Open / Download
                  </a>
                </div>
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={signedUrl}
                  alt="Challan"
                  className="aspect-[4/3] w-full rounded-lg border object-cover"
                />
              )
            ) : (
              <p className="text-sm text-zinc-400">Loading…</p>
            )}
          </div>
        )}

        {/* A real Delivery Challan lives in receiving_documents: reopen it
            read-only from the persisted snapshot (no new record, no new DC). */}
        {record.source === "documents" && record.type === "given" && (
          <Link
            href={`/documents/${record.documentNumber}/challan`}
            target="_blank"
            rel="noopener noreferrer"
          >
            <Button variant="outline" className="w-full">
              <FileTextIcon className="size-4" /> View Challan
            </Button>
          </Link>
        )}

        {(canEdit || isAdmin) && (
          <DialogFooter>
            {canEdit && (
              <Button variant="outline" onClick={onEdit}>
                Edit
              </Button>
            )}
            {isAdmin && (
              <Button variant="destructive" onClick={onDelete}>
                Delete
              </Button>
            )}
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
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