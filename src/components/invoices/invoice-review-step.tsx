"use client";

import { ChevronLeftIcon, FilePlus2Icon, Loader2Icon } from "lucide-react";
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
import { computeLineMoney } from "@/lib/invoices/types";
import { formatINR } from "@/lib/format";
import { GST_PERCENTS, UNIT_LABELS } from "@/lib/supabase/types";

/**
 * Shared Review & Create screen for BOTH invoice modes.
 *
 * One component rather than two near-identical screens so the header fields,
 * the Bill To block, the item presentation, the totals card and the save
 * button can never drift apart between a challan invoice and a direct one.
 * The mode only changes what is *shown*: a Direct Invoice has no challan
 * chips and no source document per line, and its items are edited upstream on
 * the items step rather than inline here.
 *
 * NOTHING IS PERSISTED from this screen: it renders client-side state and the
 * single confirm button is the only call that writes. No invoice row, no
 * item rows, no `invoice_challans` link and no invoice number are consumed
 * until that call succeeds.
 */

/** One reviewable line. For a direct invoice `sourceDocumentNumber` is null and
 *  `sourceItemId`/`sourceDocumentId` are null — nothing to trace back to. */
export type ReviewLine = {
  key: string;
  ordinal: number;
  sourceItemId: string | null;
  sourceDocumentId: string | null;
  sourceDocumentNumber: string | null;
  lineType: "component" | "other";
  componentId: string | null;
  componentName: string | null;
  itemName: string;
  quantity: number;
  unit: "pieces" | "kg" | "meter" | "litre" | "set";
  hsnCode: string | null;
  remarks: string | null;
  rate: number;
  gst: number;
};

export type ReviewHeader = {
  invoiceDate: string;
  customerRefNo: string;
  customerRefDate: string;
  notes: string;
};

export function InvoiceReviewStep({
  mode,
  header,
  onHeaderChange,
  partyName,
  partyLocation,
  challanChips,
lines,
  onRateChange,
  onBack,
  onEditItems,
  onConfirm,
  saving,
}: {
  mode: "challan" | "direct";
  header: ReviewHeader;
  onHeaderChange: (patch: Partial<ReviewHeader>) => void;
  partyName: string;
  partyLocation: string | null;
  /** Challan document numbers to show as chips. Empty for a Direct Invoice —
   *  it has no challans, and rendering an empty chip row would imply otherwise. */
  challanChips: string[];
  /** Each line's `rate`/`gst` are ALREADY the effective values (the challan
   *  flow resolves its rate-edit map before building these), so the totals
   *  below cannot drift from the rows above them. */
  lines: ReviewLine[];
  /** Challan mode only. A direct invoice's items are edited upstream on the
   *  items step, so the caller passes a no-op. */
  onRateChange: (key: string, patch: { rate?: number; gst?: number }) => void;
  onBack: () => void;
  onEditItems: () => void;
  onConfirm: () => void;
  saving: boolean;
}) {
  const isDirect = mode === "direct";

  // Recomputed from the (possibly rate-edited) lines on every render, so the
  // totals card can never disagree with the rows above it.
  const totals = lines.reduce(
    (acc, l) => {
      const m = computeLineMoney(l.quantity, l.rate, l.gst);
      acc.subtotal += m.subtotal;
      acc.gst += m.gstAmount;
      acc.total += m.lineTotal;
      return acc;
    },
    { subtotal: 0, gst: 0, total: 0 }
  );

  return (
    <>
      {/* Invoice header fields */}
      <div className="mb-4 rounded-xl border bg-white p-4">
        <h3 className="mb-3 text-sm font-semibold">Invoice details</h3>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="grid gap-1.5">
            <Label className="text-sm font-medium">Invoice date</Label>
            <Input
              type="date"
              value={header.invoiceDate}
              onChange={(e) => onHeaderChange({ invoiceDate: e.target.value })}
              className="h-10"
            />
          </div>
          <div className="grid gap-1.5">
            <Label className="text-sm font-medium">Customer ref no.</Label>
            <Input
              value={header.customerRefNo}
              onChange={(e) => onHeaderChange({ customerRefNo: e.target.value })}
              placeholder="Optional"
              className="h-10"
            />
          </div>
          <div className="grid gap-1.5">
            <Label className="text-sm font-medium">Customer ref date</Label>
            <Input
              type="date"
              value={header.customerRefDate}
              onChange={(e) => onHeaderChange({ customerRefDate: e.target.value })}
              className="h-10"
            />
          </div>
          <div className="grid gap-1.5">
            <Label className="text-sm font-medium">Notes</Label>
            <Input
              value={header.notes}
              onChange={(e) => onHeaderChange({ notes: e.target.value })}
              placeholder="Optional"
              className="h-10"
            />
          </div>
        </div>
      </div>

      {/* Party + mode summary */}
      <div className="mb-4 rounded-xl border bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-wide text-zinc-500">
              Bill To
            </p>
            <p className="truncate text-sm font-semibold">{partyName}</p>
            {partyLocation ? (
              <p className="truncate text-xs text-zinc-500">{partyLocation}</p>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={isDirect ? "default" : "secondary"}>
              {isDirect ? "Direct Invoice" : "From Delivery Challan"}
            </Badge>
            <Button variant="outline" size="sm" onClick={onEditItems}>
              <ChevronLeftIcon />
              {isDirect ? "Edit items" : "Change challans"}
            </Button>
          </div>
        </div>

        {isDirect ? (
          <p className="mt-3 rounded-lg bg-zinc-50 px-3 py-2 text-xs text-zinc-600">
            This invoice is not linked to any Delivery Challan — the items below
            were typed in by hand. No challan will be marked as invoiced.
          </p>
        ) : challanChips.length > 0 ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {challanChips.map((c) => (
              <Badge key={c} variant="secondary">
                {c}
              </Badge>
            ))}
          </div>
        ) : null}
      </div>

      {/* Items */}
      <div className="mb-4 overflow-hidden rounded-xl border bg-white">
        <div className="border-b px-4 py-3">
          <h3 className="text-sm font-semibold">Line items</h3>
          <p className="mt-0.5 text-xs text-zinc-500">
            {isDirect
              ? "These items are stored exactly as shown. Use “Edit items” to change anything."
              : "Rates come from each Component Master (or the challan). Edit any line below — the rate is snapshotted onto this invoice only."}
          </p>
        </div>
        <div className="divide-y">
          {lines.map((l) => (
            <div key={l.key} className="px-4 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    <span className="mr-1.5 text-zinc-400">{l.ordinal}.</span>
                    {l.itemName}
                  </p>
                  <p className="truncate text-xs text-zinc-500">
                    {l.sourceDocumentNumber ?? "Manual item"}
                    {l.componentName ? ` · ${l.componentName}` : ""}
                    {l.remarks ? ` · ${l.remarks}` : ""}
                  </p>
                </div>
                <p className="whitespace-nowrap text-sm font-semibold">
                  {formatINR(
                    computeLineMoney(l.quantity, l.rate, l.gst).lineTotal
                  )}
                </p>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                <div className="col-span-2 text-xs text-zinc-500 sm:col-span-1">
                  {formatQtyLocal(l.quantity)} {UNIT_LABELS[l.unit]}
                  {l.hsnCode ? (
                    <span className="text-zinc-400"> · HSN {l.hsnCode}</span>
                  ) : null}
                </div>
                {isDirect ? (
                  <>
                    {/* A direct invoice's items were completed on the items
                        step; re-editing them here would be a second, subtly
                        different editor for the same data. */}
                    <Field label="Rate (₹)">
                      <div className="flex h-9 items-center text-sm">
                        {formatINR(l.rate)}
                      </div>
                    </Field>
                    <Field label="GST %">
                      <div className="flex h-9 items-center text-sm">{l.gst}%</div>
                    </Field>
                  </>
                ) : (
                  <>
                    <Field label="Rate (₹)">
                      <Input
                        type="number"
                        min={0}
                        step="0.01"
                        value={l.rate}
                        onChange={(e) => {
                          const rate = Number(e.target.value);
                          onRateChange(l.key, {
                            rate: Number.isFinite(rate) ? rate : l.rate,
                          });
                        }}
                        className="h-9 text-sm"
                      />
                    </Field>
                    <Field label="GST %">
                      <Select
                        value={String(l.gst)}
                        onValueChange={(v) => onRateChange(l.key, { gst: Number(v) })}
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
                    </Field>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Totals */}
      <div className="mb-4 ml-auto max-w-xs space-y-1.5 rounded-xl border bg-white p-4 text-sm">
        <div className="flex items-center justify-between text-zinc-600">
          <span>Subtotal</span>
          <span>{formatINR(totals.subtotal)}</span>
        </div>
        <div className="flex items-center justify-between text-zinc-600">
          <span>GST</span>
          <span>{formatINR(totals.gst)}</span>
        </div>
        <div className="flex items-center justify-between border-t border-border pt-1.5 text-base font-semibold">
          <span>Total</span>
          <span>{formatINR(totals.total)}</span>
        </div>
      </div>

      {/* Confirm. Still nothing persisted at this point — this is the only
          write, and it is a single atomic RPC call. */}
      <div className="flex items-center justify-end gap-2">
        <Button variant="outline" onClick={onBack} disabled={saving}>
          Back
        </Button>
        <Button onClick={onConfirm} disabled={saving}>
          {saving ? (
            <>
              <Loader2Icon className="size-4 animate-spin" /> Creating…
            </>
          ) : (
            <>
              <FilePlus2Icon /> Create Invoice
            </>
          )}
        </Button>
      </div>
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1">
      <Label className="text-xs font-medium text-zinc-500">{label}</Label>
      {children}
    </div>
  );
}

function formatQtyLocal(n: number): string {
  return new Intl.NumberFormat("en-IN", { maximumFractionDigits: 4 }).format(n);
}