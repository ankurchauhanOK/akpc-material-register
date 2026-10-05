"use client";

import { useMemo, useRef, useState } from "react";
import { ArrowLeftIcon, Loader2Icon, SaveIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { updateInvoiceApi } from "@/lib/invoices/invoiceApi";
import type { KeptLineEdit } from "@/lib/invoices/invoiceApi";
import {
  DirectInvoiceLineEditor,
  DirectTotalsCard,
  directLineError,
  directLinesTotals,
  newDirectLineDraft,
  toDirectLinePayloads,
  type DirectLineDraft,
} from "@/components/invoices/direct-invoice-line-editor";
import type { InvoiceDetail } from "@/lib/invoices/types";

/**
 * Edit screen for a DIRECT invoice.
 *
 * Separate from the challan-backed `InvoiceEditFlow` rather than a branch
 * inside it. That is not just tidiness: the challan flow is built on
 * `invoice.challans` (it looks each item's challan up and dereferences the
 * result), so a direct invoice — which has zero challans and items with a
 * NULL source_document_id — would hit a null dereference on its very first
 * render. An early branch would still run every hook above it first. Keeping
 * the two flows apart means the challan path needs no change at all.
 *
 * Every stored field is editable here, unlike a challan invoice where only
 * the rate/GST may move: a manual line has no challan holding the
 * description, HSN or quantity, so those are the user's own data.
 */
export function DirectInvoiceEditFlow({
  invoice,
  onCancel,
  onSaved,
}: {
  invoice: InvoiceDetail;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [rows, setRows] = useState<DirectLineDraft[]>(() =>
    invoice.items.map((it) => ({
      key: it.id,
      itemName: it.item_name,
      hsnCode: it.hsn_code ?? "",
      quantity: String(it.quantity),
      unit: it.unit,
      rate: String(it.unit_price),
      gst: Number(it.gst_percent ?? 0),
      remarks: it.item_remarks ?? "",
    }))
  );
  /** invoice_items.id values deleted in this session, applied on save. */
  const [removedLineIds, setRemovedLineIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const submittingRef = useRef(false);

  // Seeded once from the loaded rows: a key absent from this map was NOT
  // touched, so its stored snapshot is left alone (and is not sent at all).
  const [touched, setTouched] = useState<Record<string, true>>({});

  const remaining = useMemo(
    () => rows.filter((r) => !removedLineIds.includes(r.key)),
    [rows, removedLineIds]
  );

  const totals = useMemo(() => directLinesTotals(remaining), [remaining]);

  const allValid =
    remaining.length > 0 && remaining.every((l) => directLineError(l) === null);

  function patchRow(key: string, patch: Partial<DirectLineDraft>) {
    setTouched((prev) => ({ ...prev, [key]: true }));
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  function addRow() {
    setRows((prev) => [...prev, newDirectLineDraft(prev.length)]);
  }

  function removeRow(key: string) {
    const isStored = rows.some((r) => r.key === key && !key.startsWith("draft-"));
    setRows((prev) =>
      prev.length === 1
        ? [newDirectLineDraft(0)]
        : prev.filter((r) => r.key !== key)
    );
    if (isStored) setRemovedLineIds((prev) => [...prev, key]);
  }

  async function handleSave() {
    if (saving || submittingRef.current) return;
    if (remaining.length === 0) {
      toast.error("A Direct Invoice must keep at least one item.");
      return;
    }
    if (!allValid) {
      toast.error("Fix the highlighted items first.");
      return;
    }
    submittingRef.current = true;
    setSaving(true);
    try {
      // A newly added row has no server id yet → goes in add_lines.
      // A touched stored row → kept_lines with its full field set.
      // A deleted stored row → p_remove_line_ids (manual lines have no
      // challan, so this is the only way to drop one).
      const drafts = new Set(
        rows.filter((r) => r.key.startsWith("draft-")).map((r) => r.key)
      );

      const keptLines: KeptLineEdit[] = remaining
        .filter((r) => !drafts.has(r.key) && touched[r.key])
        .map((r) => ({
          id: r.key,
          source_document_id: null,
          quantity: Number(r.quantity),
          unit_price: Number(r.rate),
          gst_percent: r.gst,
          item_name: r.itemName.trim(),
          hsn_code: r.hsnCode.trim() || null,
          item_remarks: r.remarks.trim() || null,
          unit: r.unit,
        }));

      const newRows = remaining.filter((r) => drafts.has(r.key));

      await updateInvoiceApi({
        invoiceId: invoice.id,
        // Direct invoices have no challan and can never gain one; the RPC
        // rejects a non-empty array on invoice_type='direct'.
        removeChallans: [],
        addChallans: [],
        addLines: toDirectLinePayloads(newRows),
        keptLines,
        removeLineIds: removedLineIds,
      });

      toast.success(`Invoice ${invoice.invoice_number} updated.`);
      onSaved();
    } catch (e) {
      submittingRef.current = false;
      setSaving(false);
      const msg = e instanceof Error ? e.message : "Please try again.";
      toast.error(`Could not update the invoice. ${msg}`);
    }
  }

  return (
    <div className="rounded-xl border bg-white">
      <div className="flex items-start justify-between gap-2 border-b px-4 py-3">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold">
            Edit Invoice {invoice.invoice_number}
          </h3>
          <p className="mt-0.5 text-xs text-zinc-500">
            Direct Invoice — items, rates and tax are all editable. No
            Delivery Challan is linked, so no challan is affected by this edit.
          </p>
        </div>
        <Badge variant="secondary" className="shrink-0">
          Direct
        </Badge>
      </div>

      <div className="p-4">
        <DirectInvoiceLineEditor
          lines={remaining}
          onChange={patchRow}
          onAdd={addRow}
          onRemove={removeRow}
        />

        <DirectTotalsCard
          subtotal={totals.subtotal}
          gst={totals.gst}
          total={totals.total}
        />

        <div className="flex items-center justify-end gap-2">
          <Button variant="outline" onClick={onCancel} disabled={saving}>
            <ArrowLeftIcon /> Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving || !allValid}>
            {saving ? (
              <>
                <Loader2Icon className="size-4 animate-spin" /> Saving…
              </>
            ) : (
              <>
                <SaveIcon /> Save changes
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
