"use client";

import { CheckIcon, FileTextIcon, Loader2Icon, PencilLineIcon, PlusIcon, Trash2Icon } from "lucide-react";
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
import { computeLineMoney, round2 } from "@/lib/invoices/types";
import type { InvoiceLinePayload } from "@/lib/invoices/types";
import { formatINR } from "@/lib/format";
import { GST_PERCENTS, UNIT_LABELS, UNIT_TYPES } from "@/lib/supabase/types";
import { cn } from "@/lib/utils";

/** One editable row of a Direct Invoice. `id` is a local client key only — the
 *  server assigns the real invoice_items.id on save. */
export type DirectLineDraft = {
  /** Stable local key for React + for the "was this edited?" check. */
  key: string;
  itemName: string;
  hsnCode: string;
  quantity: string;
  unit: (typeof UNIT_TYPES)[number];
  rate: string;
  gst: number;
  remarks: string;
};

export function newDirectLineDraft(seed = 0): DirectLineDraft {
  return {
    key: `draft-${Date.now()}-${seed}-${Math.random().toString(36).slice(2, 8)}`,
    itemName: "",
    hsnCode: "",
    quantity: "1",
    unit: "pieces",
    rate: "",
    gst: 18,
    remarks: "",
  };
}

/** Numeric inputs are kept as STRINGS while the user types.
 *
 *  Two reasons this matters: `Number("")` is 0, so an empty field would
 *  silently become a 0 qty / ₹0 rate and be indistinguishable from a real
 *  zero; and typing "1." or "" must not round-trip through Number and wipe
 *  the in-progress keystroke. They are parsed once, at the payload boundary. */
function num(raw: string): number | null {
  const t = raw.trim();
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

export function directLineMoney(l: DirectLineDraft): {
  quantity: number;
  rate: number;
  subtotal: number;
  gstAmount: number;
  lineTotal: number;
} {
  const quantity = num(l.quantity) ?? 0;
  const rate = num(l.rate) ?? 0;
  const { subtotal, gstAmount, lineTotal } = computeLineMoney(quantity, rate, l.gst);
  return { quantity, rate, subtotal, gstAmount, lineTotal };
}

export function directLinesTotals(lines: DirectLineDraft[]): {
  subtotal: number;
  gst: number;
  total: number;
} {
  let subtotal = 0;
  let gst = 0;
  let total = 0;
  for (const l of lines) {
    const m = directLineMoney(l);
    subtotal += m.subtotal;
    gst += m.gstAmount;
    total += m.lineTotal;
  }
  return { subtotal: round2(subtotal), gst: round2(gst), total: round2(total) };
}

/** Why a line cannot be saved yet, or null if it is fine.
 *
 *  Mirrors the DB's own `check (quantity > 0)` / `check (unit_price >= 0)`
 *  so the user is stopped here rather than by a failed insert. */
export function directLineError(l: DirectLineDraft): string | null {
  if (!l.itemName.trim()) return "Enter a description.";
  const q = num(l.quantity);
  if (q === null) return "Enter a quantity.";
  if (q <= 0) return "Quantity must be more than 0.";
  const r = num(l.rate);
  if (r === null) return "Enter a rate.";
  if (r < 0) return "Rate cannot be negative.";
  return null;
}

/** Builds the exact jsonb contract create_invoice / update_invoice read.
 *
 *  Both source columns are explicitly `null` — create_invoice REJECTS a manual
 *  line that carries a source id, so this is what makes the row a legitimate
 *  Direct Invoice line rather than a broken challan link. `line_type` is
 *  'other' and `component_id` null: a Direct Invoice item is not tied to a
 *  Component Master, which is also why no default rate can be prefilled. */
export function toDirectLinePayloads(lines: DirectLineDraft[]): InvoiceLinePayload[] {
  return lines.map((l, idx) => ({
    line_no: idx + 1,
    source_document_id: null,
    source_item_id: null,
    line_type: "other",
    component_id: null,
    item_name: l.itemName.trim(),
    quantity: num(l.quantity) as number,
    unit: l.unit,
    hsn_code: l.hsnCode.trim() || null,
    item_remarks: l.remarks.trim() || null,
    unit_price: num(l.rate) as number,
    gst_percent: l.gst,
  }));
}

export function DirectInvoiceLineEditor({
  lines,
  onChange,
  onAdd,
  onRemove,
}: {
  lines: DirectLineDraft[];
  onChange: (key: string, patch: Partial<DirectLineDraft>) => void;
  onAdd: () => void;
  onRemove: (key: string) => void;
}) {
  return (
    <div className="mb-4 overflow-hidden rounded-xl border bg-white">
      <div className="border-b px-4 py-3">
        <h3 className="text-sm font-semibold">Line items</h3>
        <p className="mt-0.5 text-xs text-zinc-500">
          Everything is typed in by hand — no Delivery Challan is linked, so
          these items are not tied to a Component Master.
        </p>
      </div>

      {lines.length === 0 ? (
        <div className="px-4 py-10 text-center">
          <FileTextIcon className="mx-auto mb-2 size-8 text-zinc-300" />
          <p className="text-sm font-medium">No items yet</p>
          <p className="mx-auto mt-1 max-w-sm text-xs text-zinc-500">
            Add at least one item — an invoice with no line items cannot be
            saved.
          </p>
          <Button variant="outline" size="sm" className="mt-4" onClick={onAdd}>
            <PlusIcon /> Add first item
          </Button>
        </div>
      ) : (
        <div className="divide-y">
          {lines.map((l, idx) => {
            const err = directLineError(l);
            const m = directLineMoney(l);
            return (
              <div key={l.key} className="px-4 py-3">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-medium">
                    <span className="mr-1.5 text-zinc-400">{idx + 1}.</span>
                    {l.itemName.trim() || (
                      <span className="text-zinc-400">Untitled item</span>
                    )}
                  </p>
                  <div className="flex items-center gap-2">
                    <p className="whitespace-nowrap text-sm font-semibold">
                      {formatINR(m.lineTotal)}
                    </p>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => onRemove(l.key)}
                      aria-label={`Remove item ${idx + 1}`}
                      className="text-zinc-400 hover:text-red-600"
                    >
                      <Trash2Icon />
                    </Button>
                  </div>
                </div>

                <div className="mt-2 grid gap-2 sm:grid-cols-6">
                  <div className="grid gap-1 sm:col-span-2">
                    <Label className="text-xs font-medium text-zinc-500">
                      Description
                    </Label>
                    <Input
                      value={l.itemName}
                      onChange={(e) => onChange(l.key, { itemName: e.target.value })}
                      placeholder="Item description"
                      className="h-9 text-sm"
                    />
                  </div>
                  <div className="grid gap-1">
                    <Label className="text-xs font-medium text-zinc-500">
                      HSN/SAC
                    </Label>
                    <Input
                      value={l.hsnCode}
                      onChange={(e) => onChange(l.key, { hsnCode: e.target.value })}
                      placeholder="Optional"
                      className="h-9 text-sm"
                    />
                  </div>
                  <div className="grid gap-1">
                    <Label className="text-xs font-medium text-zinc-500">Unit</Label>
                    <Select
                      value={l.unit}
                      onValueChange={(v) =>
                        onChange(l.key, { unit: v as DirectLineDraft["unit"] })
                      }
                    >
                      <SelectTrigger className="h-9 text-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {UNIT_TYPES.map((u) => (
                          <SelectItem key={u} value={u}>
                            {UNIT_LABELS[u]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-1">
                    <Label className="text-xs font-medium text-zinc-500">Qty</Label>
                    <Input
                      type="number"
                      inputMode="decimal"
                      min={0}
                      step="0.0001"
                      value={l.quantity}
                      onChange={(e) => onChange(l.key, { quantity: e.target.value })}
                      className="h-9 text-sm"
                    />
                  </div>
                  <div className="grid gap-1">
                    <Label className="text-xs font-medium text-zinc-500">Rate (₹)</Label>
                    <Input
                      type="number"
                      inputMode="decimal"
                      min={0}
                      step="0.01"
                      value={l.rate}
                      onChange={(e) => onChange(l.key, { rate: e.target.value })}
                      placeholder="0.00"
                      className="h-9 text-sm"
                    />
                  </div>
                  <div className="grid gap-1">
                    <Label className="text-xs font-medium text-zinc-500">GST %</Label>
                    <Select
                      value={String(l.gst)}
                      onValueChange={(v) => onChange(l.key, { gst: Number(v) })}
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
                </div>

                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <Input
                    value={l.remarks}
                    onChange={(e) => onChange(l.key, { remarks: e.target.value })}
                    placeholder="Remarks (optional)"
                    className="h-9 flex-1 text-sm"
                  />
                  <Badge variant="outline" className="font-normal">
                    {m.quantity} {UNIT_LABELS[l.unit]} = {formatINR(m.subtotal)}
                  </Badge>
                  <Badge variant="outline" className="font-normal">
                    GST {formatINR(m.gstAmount)}
                  </Badge>
                </div>

                {err ? (
                  <p className="mt-1.5 text-xs text-red-600">{err}</p>
                ) : (
                  <p className="mt-1.5 flex items-center gap-1 text-xs text-emerald-700">
                    <CheckIcon className="size-3" /> Looks good
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}

      {lines.length > 0 && (
        <div className="border-t px-4 py-3">
          <Button variant="outline" size="sm" onClick={onAdd}>
            <PlusIcon /> Add item
          </Button>
        </div>
      )}
    </div>
  );
}

/** Reused by the create and edit Direct Invoice screens. */
export function DirectTotalsCard({
  subtotal,
  gst,
  total,
}: {
  subtotal: number;
  gst: number;
  total: number;
}) {
  return (
    <div className="mb-4 ml-auto max-w-xs space-y-1.5 rounded-xl border bg-white p-4 text-sm">
      <div className="flex items-center justify-between text-zinc-600">
        <span>Subtotal</span>
        <span>{formatINR(subtotal)}</span>
      </div>
      <div className="flex items-center justify-between text-zinc-600">
        <span>GST</span>
        <span>{formatINR(gst)}</span>
      </div>
      <div className="flex items-center justify-between border-t border-border pt-1.5 text-base font-semibold">
        <span>Total</span>
        <span>{formatINR(total)}</span>
      </div>
    </div>
  );
}

/** Mirrors the challan wizard's inline-field styling. */
export function InvoiceField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-1">
      <Label className="text-xs font-medium text-zinc-500">{label}</Label>
      {children}
    </div>
  );
}

export function DirectSaveButton({
  saving,
  onClick,
  label = "Create Invoice",
}: {
  saving: boolean;
  onClick: () => void;
  label?: string;
}) {
  return (
    <Button onClick={onClick} disabled={saving}>
      {saving ? (
        <>
          <Loader2Icon className="size-4 animate-spin" /> Saving…
        </>
      ) : (
        <>
          <PencilLineIcon /> {label}
        </>
      )}
    </Button>
  );
}

export const directEditorButtonClass = cn("h-9 text-sm");