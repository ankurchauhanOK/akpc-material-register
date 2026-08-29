"use client";

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { TypeBadge } from "@/components/records/type-badge";
import type { TransactionWithNames } from "@/hooks/useTransactions";
import { createSignedChallanUrl } from "@/lib/supabase/storage";
import { createClient } from "@/lib/supabase/client";
import { formatDate, formatINR } from "@/lib/format";

export function TransactionDetailDialog({
  transaction,
  open,
  onOpenChange,
  canEdit,
  isAdmin,
  onEdit,
  onArchive,
}: {
  transaction: TransactionWithNames;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  canEdit: boolean;
  isAdmin: boolean;
  onEdit: () => void;
  onArchive: () => void;
}) {
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [creatorName, setCreatorName] = useState<string>("—");

  useEffect(() => {
    if (!open) return;
    let cancelled = false;

    if (transaction.challan_path) {
      createSignedChallanUrl(transaction.challan_path).then((url) => {
        if (!cancelled) setSignedUrl(url);
      });
    }

    if (transaction.created_by) {
      createClient()
        .from("profiles")
        .select("full_name")
        .eq("id", transaction.created_by)
        .maybeSingle()
        .then(({ data }) => {
          if (!cancelled && data?.full_name) setCreatorName(data.full_name);
        });
    }

    return () => {
      cancelled = true;
    };
  }, [open, transaction]);

  const isPdf = signedUrl?.includes(".pdf");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
        <DialogTitle>{transaction.transaction_number}</DialogTitle>
        <DialogDescription className="flex items-center gap-2">
          <TypeBadge type={transaction.type} />
        </DialogDescription>

        <dl className="grid gap-3 text-sm">
          <Row label="Material" value={transaction.material_name} />
          <Row
            label={transaction.type === "received" ? "From" : "To"}
            value={transaction.company_name}
          />
          <Row
            label="Pieces"
            value={`${new Intl.NumberFormat("en-IN").format(transaction.pieces)} pcs`}
          />
          <Row label="Total amount" value={formatINR(transaction.total_amount)} />
          <Row label="Date" value={formatDate(transaction.transaction_date)} />
          <Row label="Created by" value={creatorName} />
          <Row label="Created" value={formatDate(transaction.created_at)} />
        </dl>

        {/* Challan preview via signed URL — never the raw path */}
        <div>
          <p className="mb-1.5 text-sm font-medium">Challan</p>
          {transaction.challan_path ? (
            signedUrl ? (
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
            )
          ) : (
            <p className="text-sm text-zinc-400">No challan attached.</p>
          )}
        </div>

        {(canEdit || isAdmin) && (
          <DialogFooter>
            {canEdit && (
              <Button variant="outline" onClick={onEdit}>
                Edit
              </Button>
            )}
            {isAdmin && (
              <Button variant="destructive" onClick={onArchive}>
                Archive
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
