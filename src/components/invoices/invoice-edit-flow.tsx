"use client";

import { useMemo, useRef, useState } from "react";
import {
  ArrowLeftIcon,
  CheckIcon,
  Loader2Icon,
  PlusIcon,
  SaveIcon,
  TrashIcon,
  XIcon,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useActiveMaterials, useEligibleChallans } from "@/hooks/useInvoices";
import { updateInvoiceApi } from "@/lib/invoices/invoiceApi";
import { computeLineMoney } from "@/lib/invoices/types";
import { formatDate, formatINR } from "@/lib/format";
import { GST_PERCENTS, UNIT_LABELS } from "@/lib/supabase/types";
import { cn } from "@/lib/utils";
import type {
  EligibleChallan,
  InvoiceDetail,
  InvoiceLinePayload,
} from "@/lib/invoices/types";

type RateEdit = { rate: number; gst: number };

type DisplayRow = {
  key: string;
  isExisting: boolean;
  id: string; // existing invoice_items.id OR candidate sourceItemId
  challanNumber: string;
  itemName: string;
  quantity: number;
  unit: InvoiceLinePayload["unit"];
  hsnCode: string | null;
  lineType: InvoiceLinePayload["line_type"];
  componentId: string | null;
  sourceDocumentId: string;
  sourceItemId: string;
  rate: number;
  gst: number;
  subtotal: number;
  gstAmount: number;
  lineTotal: number;
};

export function InvoiceEditFlow({
  invoice,
  onCancel,
  onSaved,
}: {
  invoice: InvoiceDetail;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const { items: materials, isLoading: materialsLoading } = useActiveMaterials();

  const [removedIds, setRemovedIds] = useState<Set<string>>(new Set());
  const [addedChallans, setAddedChallans] = useState<EligibleChallan[]>([]);
  const [edits, setEdits] = useState<Record<string, RateEdit>>({});
  const [saving, setSaving] = useState(false);
  const submittingRef = useRef(false);

  // Add-challan picker state
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerComponent, setPickerComponent] = useState<string | null>(null);
  const [pickerSelected, setPickerSelected] = useState<Set<string>>(new Set());
  const {
    items: eligible,
    isLoading: eligLoading,
    refetch,
  } = useEligibleChallans(pickerOpen ? pickerComponent : null);

  const invoiceChallanIds = useMemo(
    () => new Set(invoice.challans.map((c) => c.challanId)),
    [invoice.challans]
  );

  const rows: DisplayRow[] = useMemo(() => {
    const out: DisplayRow[] = [];
    // existing lines (minus removed challans)
    for (const it of invoice.items) {
      // A NULL source_document_id is a manual line, and manual lines only ever
      // exist on a Direct Invoice -- which the detail page routes to
      // DirectInvoiceEditFlow. Skipping is defensive: this wizard keys every
      // row off `invoice.challans`, so a source-less row would look up its
      // challan and render "—" with nothing to remove it by.
      if (it.source_document_id == null) continue;
      const sourceDocumentId = it.source_document_id;
      if (removedIds.has(sourceDocumentId)) continue;
      const edit = edits[`item:${it.id}`];
      const rate = edit?.rate ?? it.unit_price;
      const gst = edit?.gst ?? it.gst_percent;
      const challan = invoice.challans.find(
        (c) => c.challanId === sourceDocumentId
      );
      out.push({
        key: `item:${it.id}`,
        isExisting: true,
        id: it.id,
        challanNumber: challan?.document_number ?? "—",
        itemName: it.item_name,
        quantity: it.quantity,
        unit: it.unit,
        hsnCode: it.hsn_code,
        lineType: it.line_type,
        componentId: it.component_id,
        sourceDocumentId,
        sourceItemId: it.source_item_id ?? "",
        rate,
        gst,
        ...computeLineMoney(it.quantity, rate, gst),
      });
    }
    // added chalan lines
    for (const c of addedChallans) {
      for (const it of c.items) {
        const edit = edits[`cand:${it.sourceItemId}`];
        const rate = edit?.rate ?? it.unitPrice;
        const gst = edit?.gst ?? it.gstPercent;
        out.push({
          key: `cand:${it.sourceItemId}`,
          isExisting: false,
          id: it.sourceItemId,
          challanNumber: c.document_number,
          itemName: it.itemName,
          quantity: it.quantity,
          unit: it.unit,
          hsnCode: it.hsnCode,
          lineType: it.lineType,
          componentId: it.componentId,
          sourceDocumentId: it.sourceDocumentId,
          sourceItemId: it.sourceItemId,
          rate,
          gst,
          ...computeLineMoney(it.quantity, rate, gst),
        });
      }
    }
    return out;
  }, [invoice, removedIds, addedChallans, edits]);

  const totals = useMemo(() => {
    let subtotal = 0;
    let gst = 0;
    let total = 0;
    for (const r of rows) {
      subtotal += r.subtotal;
      gst += r.gstAmount;
      total += r.lineTotal;
    }
    return { subtotal, gst, total };
  }, [rows]);

  const editedCount = Object.keys(edits).length;

  // -------- add-challan picker helpers --------
  const pickable = useMemo(() => {
    const alreadyUsed = new Set(invoiceChallanIds);
    for (const c of addedChallans) alreadyUsed.add(c.id);
    return eligible.filter((c) => {
      if (c.company_id !== invoice.company_id) return false;
      return !alreadyUsed.has(c.id);
    });
  }, [eligible, invoiceChallanIds, addedChallans, invoice.company_id]);

  const crossCompanyCount = eligible.filter(
    (c) => c.company_id !== invoice.company_id
  ).length;

  function toggleAddedInPicker(id: string) {
    setPickerSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function commitAdditions() {
    const chosen = (pickerComponent ? eligible : []).filter((c) =>
      pickerSelected.has(c.id)
    );
    if (chosen.length === 0) return;
    setAddedChallans((prev) => {
      const known = new Set(prev.map((c) => c.id));
      return [...prev, ...chosen.filter((c) => !known.has(c.id))];
    });
    setPickerSelected(new Set());
    setPickerComponent(null);
    setPickerOpen(false);
  }

  function removeChallan(id: string) {
    setRemovedIds((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  }

  function undoRemoveChallan(id: string) {
    setRemovedIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }

  function dropAdded(id: string) {
    setAddedChallans((prev) => prev.filter((c) => c.id !== id));
  }

  async function save() {
    if (saving || submittingRef.current) return;
    const finalChallans =
      invoice.challans.filter((c) => !removedIds.has(c.challanId)).length +
      addedChallans.length;
    if (finalChallans === 0 || rows.length === 0) {
      toast.error("An invoice must keep at least one challan.");
      return;
    }
    submittingRef.current = true;
    setSaving(true);
    try {
      // Manual lines (source_document_id IS NULL) belong to a Direct Invoice
      // and are handled by DirectInvoiceEditFlow, so this wizard only ever
      // sends challan-backed rows.
      const keptLines = invoice.items
        .filter(
          (it) => it.source_document_id != null && !removedIds.has(it.source_document_id)
        )
        .map((it) => {
          const edit = edits[`item:${it.id}`];
          return {
            id: it.id,
            source_document_id: it.source_document_id,
            quantity: it.quantity,
            unit_price: edit?.rate ?? it.unit_price,
            gst_percent: edit?.gst ?? it.gst_percent,
          };
        });

      const addLines: InvoiceLinePayload[] = [];
      let lineNo = 1;
      for (const c of addedChallans) {
        for (const it of c.items) {
          const edit = edits[`cand:${it.sourceItemId}`];
          addLines.push({
            line_no: lineNo++,
            source_document_id: it.sourceDocumentId,
            source_item_id: it.sourceItemId,
            line_type: it.lineType,
            component_id: it.componentId,
            item_name: it.itemName,
            quantity: it.quantity,
            unit: it.unit,
            hsn_code: it.hsnCode,
            item_remarks: null,
            unit_price: edit?.rate ?? it.unitPrice,
            gst_percent: edit?.gst ?? it.gstPercent,
          });
        }
      }

      await updateInvoiceApi({
        invoiceId: invoice.id,
        removeChallans: [...removedIds],
        addChallans: addedChallans.map((c) => c.id),
        addLines,
        // Direct-invoice only; a challan invoice removes its lines by challan.
        removeLineIds: [],
        keptLines,
      });

      toast.success("Invoice updated.");
      onSaved();
    } catch (e) {
      submittingRef.current = false;
      setSaving(false);
      const msg = e instanceof Error ? e.message : "Please try again.";
      toast.error(`Could not save changes. ${msg}`);
    }
  }

  return (
    <div>
      <div className="mb-4 flex items-center gap-2">
        <Button variant="ghost" size="icon-sm" onClick={onCancel} aria-label="Back">
          <ArrowLeftIcon />
        </Button>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Edit {invoice.invoice_number}
          </h1>
          <p className="mt-1 text-sm text-zinc-500">
            Add or remove challans and adjust rates. Existing challans keep their
            billing history untouched.
          </p>
        </div>
      </div>

      {/* Challan changes */}
      <div className="mb-4 rounded-xl border bg-white p-4">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">Delivery Challans</h2>
          <Button variant="outline" size="sm" onClick={() => { setPickerOpen(true); setPickerComponent(null); setPickerSelected(new Set()); }}>
            <PlusIcon /> Add challan
          </Button>
        </div>

        <ul className="divide-y">
          {invoice.challans.map((c) => {
            const removed = removedIds.has(c.challanId);
            return (
              <li
                key={c.challanId}
                className={cn(
                  "flex items-center justify-between gap-3 py-2",
                  removed && "opacity-50"
                )}
              >
                <div>
                  <p className="text-sm font-medium">{c.document_number}</p>
                  <p className="text-xs text-zinc-500">
                    {formatDate(c.transaction_date)}
                  </p>
                </div>
                {removed ? (
                  <Button variant="outline" size="sm" onClick={() => undoRemoveChallan(c.challanId)}>
                    Undo
                  </Button>
                ) : (
                  <Button variant="ghost" size="icon-sm" className="text-destructive hover:text-destructive" onClick={() => removeChallan(c.challanId)}>
                    <TrashIcon /> <span className="sr-only">Remove</span>
                  </Button>
                )}
              </li>
            );
          })}
          {addedChallans.map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-3 py-2">
              <div>
                <p className="text-sm font-semibold text-emerald-700">
                  {c.document_number}
                  <Badge variant="outline" className="ml-2 border-emerald-300 text-emerald-700">
                    new
                  </Badge>
                </p>
                <p className="text-xs text-zinc-500">{formatDate(c.transaction_date)}</p>
              </div>
              <Button variant="ghost" size="icon-sm" className="text-destructive hover:text-destructive" onClick={() => dropAdded(c.id)}>
                <XIcon /> <span className="sr-only">Drop</span>
              </Button>
            </li>
          ))}
        </ul>
      </div>

      {/* Rate edits */}
      <div className="mb-4 overflow-hidden rounded-xl border bg-white">
        <div className="border-b px-4 py-3">
          <h2 className="text-sm font-semibold">Line items</h2>
          <p className="mt-0.5 text-xs text-zinc-500">
            Edit rates and GST. Only this invoice is changed — Component Master
            prices and source challans are never modified.
          </p>
        </div>
        <div className="divide-y">
          {rows.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-zinc-400">
              No line items. Add a challan or undo a removal.
            </p>
          ) : (
            rows.map((r) => (
              <div key={r.key} className="px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{r.itemName}</p>
                    <p className="truncate text-xs text-zinc-500">
                      {r.challanNumber}
                      {r.isExisting ? "" : " · new line"}
                    </p>
                  </div>
                  <p className="whitespace-nowrap text-sm font-semibold">
                    {formatINR(r.lineTotal)}
                  </p>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <div className="col-span-2 text-xs text-zinc-500 sm:col-span-1">
                    {formatQtyLocal(r.quantity)} {UNIT_LABELS[r.unit]}
                    {r.hsnCode ? ` · HSN ${r.hsnCode}` : ""}
                  </div>
                  <RowField label="Rate (₹)" rate={r.rate} gst={r.gst} onEdit={(e) => setEdits((prev) => ({ ...prev, [r.key]: e }))} />

                  <RowField label="GST %" rate={r.rate} gst={r.gst} gstOnly onEdit={(e) => setEdits((prev) => ({ ...prev, [r.key]: e }))} />
                </div>
              </div>
            ))
          )}
        </div>

        <div className="border-t border-border px-4 py-3">
          <div className="ml-auto max-w-xs space-y-1 text-sm">
            <div className="flex justify-between text-zinc-600">
              <span>Subtotal</span>
              <span>{formatINR(totals.subtotal)}</span>
            </div>
            <div className="flex justify-between text-zinc-600">
              <span>GST</span>
              <span>{formatINR(totals.gst)}</span>
            </div>
            <div className="flex justify-between border-t border-border pt-1.5 font-semibold">
              <span>Total after changes</span>
              <span>{formatINR(totals.total)}</span>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border bg-muted/20 px-4 py-3">
          <p className="text-xs text-zinc-500">
            {removedIds.size > 0 && `${removedIds.size} challan(s) removed · `}
            {addedChallans.length > 0 &&
              `${addedChallans.length} challan(s) added · `}
            {editedCount > 0 && `${editedCount} rate(s) edited · `}
            {removedIds.size === 0 &&
              addedChallans.length === 0 &&
              editedCount === 0 &&
              "No changes yet"}
          </p>
          <div className="flex items-center gap-2">
            <Button variant="outline" disabled={saving} onClick={onCancel}>
              Cancel
            </Button>
            <Button onClick={save} disabled={saving}>
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

      {/* Add-challan picker (modal) */}
      {pickerOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4">
          <div className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-t-2xl bg-white p-4 sm:rounded-2xl">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold">
                {pickerComponent
                  ? `Choose Delivery Challans`
                  : "Pick a component"}
              </h3>
              <Button variant="ghost" size="icon-sm" onClick={() => setPickerOpen(false)}>
                <XIcon /> <span className="sr-only">Close</span>
              </Button>
            </div>

            {!pickerComponent ? (
              materialsLoading ? (
                <p className="p-4 text-center text-sm text-zinc-500">Loading…</p>
              ) : materials.length === 0 ? (
                <p className="p-4 text-center text-sm text-zinc-500">
                  No components available.
                </p>
              ) : (
                <div className="grid gap-2 sm:grid-cols-2">
                  {materials.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => {
                        setPickerComponent(m.id);
                        setPickerSelected(new Set());
                      }}
                      className="rounded-xl border bg-white p-3 text-left hover:border-emerald-300"
                    >
                      <p className="truncate text-sm font-semibold">{m.name}</p>
                      <p className="mt-0.5 truncate text-xs text-zinc-500">
                        {UNIT_LABELS[m.unit]}
                        {m.default_price != null
                          ? ` · ${formatINR(m.default_price)}`
                          : ""}
                      </p>
                    </button>
                  ))}
                </div>
              )
            ) : (
              <>
                {eligLoading ? (
                  <p className="flex items-center gap-2 p-4 text-sm text-zinc-500">
                    <Loader2Icon className="size-4 animate-spin" /> Loading…
                  </p>
                ) : (
                  <>
                    {crossCompanyCount > 0 && (
                      <p className="mb-3 rounded-lg bg-amber-50 p-2 text-xs text-amber-700">
                        {crossCompanyCount} challan(s) belong to a different
                        customer and cannot be added to this invoice.
                      </p>
                    )}
                    {pickable.length === 0 ? (
                      <p className="p-4 text-center text-sm text-zinc-500">
                        No billable challans left for this component.
                      </p>
                    ) : (
                      <div className="grid gap-2">
                        {pickable.map((c) => {
                          const isSelected = pickerSelected.has(c.id);
                          return (
                            <button
                              key={c.id}
                              type="button"
                              onClick={() => toggleAddedInPicker(c.id)}
                              className={cn(
                                "flex items-center gap-3 rounded-xl border bg-white p-3 text-left",
                                isSelected
                                  ? "border-emerald-500 bg-emerald-50/40"
                                  : "hover:border-emerald-200"
                              )}
                            >
                              <span
                                className={cn(
                                  "flex size-5 shrink-0 items-center justify-center rounded-md border",
                                  isSelected
                                    ? "border-emerald-600 bg-emerald-600 text-white"
                                    : "border-zinc-300"
                                )}
                              >
                                {isSelected && <CheckIcon className="size-3.5" />}
                              </span>
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-semibold">
                                  {c.document_number}
                                </p>
                                <p className="mt-0.5 text-xs text-zinc-500">
                                  {formatDate(c.transaction_date)} · {c.itemCount}{" "}
                                  {c.itemCount === 1 ? "item" : "items"} ·{" "}
                                  {c.qtySummary}
                                </p>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </>
                )}
                <div className="mt-4 flex items-center justify-between gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setPickerComponent(null)}
                  >
                    <ArrowLeftIcon /> Components
                  </Button>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={() => refetch()}>
                      Refresh
                    </Button>
                    <Button
                      size="sm"
                      disabled={pickerSelected.size === 0}
                      onClick={commitAdditions}
                    >
                      Add selected ({pickerSelected.size})
                    </Button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function RowField({
  label,
  rate,
  gst,
  gstOnly,
  onEdit,
}: {
  label: string;
  rate: number;
  gst: number;
  gstOnly?: boolean;
  onEdit: (e: RateEdit) => void;
}) {
  if (gstOnly) {
    return (
      <div className="grid gap-1">
        <Label className="text-xs font-medium text-zinc-500">{label}</Label>
        <Select
          value={String(gst)}
          onValueChange={(v) => onEdit({ rate, gst: Number(v) })}
        >
          <SelectTrigger className="h-9 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {GST_PERCENTS.map((g) => (
              <SelectItem key={g} value={String(g)}>
                {g}%
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    );
  }
  return (
    <div className="grid gap-1">
      <Label className="text-xs font-medium text-zinc-500">{label}</Label>
      <Input
        type="number"
        min={0}
        step="0.01"
        value={rate}
        onChange={(e) => {
          const next = Number(e.target.value);
          onEdit({ rate: Number.isFinite(next) ? next : rate, gst });
        }}
        className="h-9 text-sm"
      />
    </div>
  );
}

function formatQtyLocal(n: number): string {
  return new Intl.NumberFormat("en-IN", { maximumFractionDigits: 4 }).format(n);
}