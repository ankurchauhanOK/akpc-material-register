"use client";

import { useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowUpRightIcon, CheckIcon, RotateCcwIcon } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  EntityCombobox,
  type PickerItem,
} from "@/components/transactions/entity-combobox";
import { Input } from "@/components/ui/input";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/useAuth";
import { useActiveParties } from "@/hooks/useMasters";
import { createReceivingDocument } from "@/lib/transactions/createReceivingDocument";
import { formatDate, formatINR } from "@/lib/format";
import type { Enums, Tables } from "@/lib/supabase/database.types";
import { UNIT_TYPES, UNIT_LABELS } from "@/lib/supabase/types";
import { renderChallanPdf } from "@/lib/challan/challan-pdf";

type Component = Tables<"materials">;
type Party = Tables<"companies">;
type UnitType = Enums<"unit_type">;
type LineType = Enums<"document_line_type">;

const toPicker = (p: { id: string; name: string }): PickerItem => ({
  id: p.id,
  name: p.name,
});

function todayISO() {
  const d = new Date();
  const offset = d.getTimezoneOffset();
  const local = new Date(d.getTime() - offset * 60_000);
  return local.toISOString().slice(0, 10);
}

const num = (s: string) => Number(s.replace(/,/g, "")) || 0;

export function SendMaterialForm({ component }: { component: Component }) {
  const router = useRouter();
  const { user, canCreate } = useAuth();
  const queryClient = useQueryClient();
  const { items: parties } = useActiveParties();

  // Manufactured Material | Other
  const [lineType, setLineType] = useState<LineType>("component");

  const [partyId, setPartyId] = useState<string | null>(null);
  const [quantity, setQuantity] = useState("");
  const [unitPrice, setUnitPrice] = useState("");
  const [unit, setUnit] = useState<UnitType>(component.unit);
  const [itemName, setItemName] = useState("");
  const [date, setDate] = useState(todayISO());
  const [notes, setNotes] = useState("");

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState<
    (Tables<"receiving_documents"> & { items: Tables<"receiving_document_items">[] }) | null
  >(null);
  const [saving, setSaving] = useState(false);
  const submittingRef = useRef(false);

  const selectedParty = parties.find((p) => p.id === partyId);

  // Effective unit is locked to the Component Master for Manufactured Material,
  // user-selected for Other.
  const effectiveUnit: UnitType =
    lineType === "component" ? component.unit : unit;
  const displayName =
    lineType === "component" ? component.name : itemName.trim();

  const totalAmount = num(quantity) * num(unitPrice);

  const createParty = useMutation({
    mutationFn: async (name: string): Promise<PickerItem> => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("companies")
        .insert({ name })
        .select("*")
        .single();
      if (error) throw new Error("Could not add party.");
      return toPicker(data as Party);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["companies"] }),
  });

  function validate(): boolean {
    const next: Record<string, string> = {};
    if (!partyId) next.party = "Select or add a customer / destination.";
    const q = Number(quantity);
    if (!quantity.trim() || Number.isNaN(q) || q <= 0)
      next.quantity = `Enter a quantity above 0 (${UNIT_LABELS[effectiveUnit]}).`;
    const up = num(unitPrice);
    if (!unitPrice.trim() || Number.isNaN(up) || up < 0)
      next.unitPrice = "Enter a valid unit price (₹).";
    if (lineType === "other" && !itemName.trim())
      next.itemName = "Describe the item being sent.";
    if (!date) next.date = "Enter a dispatch date.";
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSaveAndChallan() {
    if (!canCreate) {
      setErrors({ form: "You do not have permission to record this." });
      return;
    }
    if (submittingRef.current) return;
    if (!validate()) return;
    if (!user) {
      setErrors({ form: "Please sign in again." });
      return;
    }
    if (!selectedParty) {
      setErrors({ form: "Please select a customer / destination." });
      return;
    }

    submittingRef.current = true;
    setSaving(true);
    setErrors({});

    try {
      const created = await createReceivingDocument({
        type: "given",
        kind: "other",
        source: "customer",
        companyId: selectedParty.id,
        transactionDate: date,
        notes: notes.trim() || null,
        createdBy: user.id,
        partySnapshot: {
          name: selectedParty.name,
          company: selectedParty.name,
          location: selectedParty.location,
          post: selectedParty.post,
          contact: selectedParty.contact,
          pincode: selectedParty.pincode,
        },
        items: [
          {
            lineNo: 1,
            lineType,
            componentId: lineType === "component" ? component.id : null,
            itemName: lineType === "component" ? component.name : itemName.trim(),
            quantity: num(quantity),
            unit: effectiveUnit,
            unitPrice: num(unitPrice),
            gstPercent: 0,
            subtotal: totalAmount,
            gstAmount: 0,
            lineTotal: totalAmount,
          },
        ],
      });

      setSaved(created);
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      queryClient.invalidateQueries({
        queryKey: ["component_parties", component.id],
      });

      // Save & Generate Challan: build the on-demand A4 challan from the
      // real saved document, then trigger a download.
      const item = created.items[0];
      const blob = await renderChallanPdf(
        {
          type: "given",
          transaction_number: created.document_number,
          transaction_date: created.transaction_date,
          party_name: created.party_name,
          party_company: created.party_company,
          party_location: created.party_location,
          party_contact: created.party_contact,
          total_amount: created.total_amount,
        } as Tables<"transactions"> & { party_name: string | null },
        component.name,
        UNIT_LABELS[item?.unit ?? component.unit],
        created.items,
        created.subtotal,
        created.gst_total
      );
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${created.document_number}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setErrors({
        form:
          e instanceof Error
            ? e.message
            : "Could not save the send document.",
      });
    } finally {
      submittingRef.current = false;
      setSaving(false);
    }
  }

  async function reChallan() {
    if (!saved) return;
    const item = saved.items[0];
    const blob = await renderChallanPdf(
      {
        type: "given",
        transaction_number: saved.document_number,
        transaction_date: saved.transaction_date,
        party_name: saved.party_name,
        party_company: saved.party_company,
        party_location: saved.party_location,
        party_contact: saved.party_contact,
        total_amount: saved.total_amount,
      } as Tables<"transactions"> & { party_name: string | null },
      component.name,
      UNIT_LABELS[item?.unit ?? component.unit],
      saved.items,
      saved.subtotal,
      saved.gst_total
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${saved.document_number}.pdf`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // ----- success state -----
  if (saved) {
    return (
      <div className="mx-auto max-w-md rounded-xl border bg-white p-6 text-center shadow-sm">
        <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-full bg-amber-100 text-amber-700">
          <CheckIcon className="size-6" />
        </div>
        <p className="text-sm font-medium text-zinc-600">
          Sent · {saved.items[0]?.item_name ?? component.name}
        </p>
        <h2 className="mt-1 text-3xl font-semibold tracking-tight">
          {saved.document_number}
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {selectedParty?.name ?? "—"} ·{" "}
          {formatDate(saved.transaction_date)} ·{" "}
          {formatINR(saved.total_amount)}
        </p>

        <div className="mt-6 grid gap-2">
          <Button variant="outline" onClick={reChallan}>
            <ArrowUpRightIcon />
            Generate Challan Again
          </Button>
          <Button variant="outline" onClick={() => router.push("/records")}>
            View record
          </Button>
          <Button
            onClick={() => {
              setSaved(null);
              setPartyId(null);
            }}
          >
            <RotateCcwIcon />
            Record another
          </Button>
        </div>
      </div>
    );
  }

  // ----- the one-screen form -----
  return (
    <div className="mx-auto max-w-[1280px]">
      {/* Page header */}
      <div className="flex items-center gap-3">
        <span className="flex size-10 items-center justify-center rounded-xl bg-amber-50 text-amber-700">
          <ArrowUpRightIcon className="size-5" />
        </span>
        <div>
          <h1 className="text-[24px] font-semibold tracking-tight">
            Send Material
          </h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Record finished material dispatched from AKPC.
          </p>
        </div>
      </div>

      {!canCreate && (
        <p className="mt-2 text-xs text-zinc-400">
          You have read-only access. Sending requires an operator or admin account.
        </p>
      )}

      {/* Manufactured Material | Other toggle */}
      <div className="mt-4 rounded-xl border border-border bg-white p-5 shadow-sm">
        <Label className="text-xs font-semibold uppercase tracking-wider">
          What are you sending?
        </Label>
        <div className="mt-2 flex rounded-lg border border-border bg-zinc-100 p-1 shadow-sm">
          {(
            [
              { value: "component", label: "Manufactured Material" },
              { value: "other", label: "Other" },
            ] as { value: LineType; label: string }[]
          ).map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setLineType(opt.value)}
              className={`flex-1 rounded-md px-3 py-1.5 text-xs font-semibold transition-all ${
                lineType === opt.value
                  ? "bg-white text-foreground shadow-sm border border-border/40"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-12">
        {/* Left column: main form */}
        <div className="space-y-4 lg:col-span-7">
          {/* Basic Details */}
          <section className="rounded-xl border border-border bg-white">
            <h2 className="border-b px-5 py-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              Basic Details
            </h2>
            <div className="grid gap-4 px-5 py-5 md:grid-cols-12">
              {/* Item / Component */}
              <Field
                label={lineType === "component" ? "Component" : "Item"}
                error={errors.itemName}
                className="md:col-span-4"
              >
                {lineType === "component" ? (
                  <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/40 p-3">
                    <div className="h-9 w-9 shrink-0 rounded-md bg-zinc-200 text-zinc-500 flex items-center justify-center text-sm font-semibold">
                      {component.name.charAt(0)}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-foreground">
                        {component.name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {component.part_code ?? "—"} · {UNIT_LABELS[component.unit]}
                      </p>
                    </div>
                  </div>
                ) : (
                  <Input
                    value={itemName}
                    onChange={(e) => setItemName(e.target.value)}
                    placeholder="Describe item..."
                    className="h-10"
                  />
                )}
              </Field>

              {/* Customer / Destination */}
              <Field
                label="Customer / Destination"
                error={errors.party}
                className="md:col-span-4"
              >
                <EntityCombobox
                  items={parties.map(toPicker)}
                  selectedId={partyId}
                  placeholder="Search Party Master..."
                  searchPlaceholder="Search party..."
                  emptyText="No parties found."
                  createLabel="Add party"
                  canCreate={Boolean(canCreate)}
                  onSelect={(i) => setPartyId(i.id)}
                  onCreate={(name) => createParty.mutateAsync(name)}
                />
              </Field>

              <Field label="Dispatch Date" error={errors.date} className="md:col-span-4">
                <Input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="h-10"
                />
              </Field>

              {selectedParty && (
                <div className="md:col-span-12 rounded-lg border bg-muted/40 p-3 text-xs text-zinc-600">
                  <p className="mb-1 font-medium text-zinc-800">Destination details</p>
                  <p>
                    {selectedParty.name}
                    {selectedParty.location ? ` · ${selectedParty.location}` : ""}
                  </p>
                  {selectedParty.post && <p>{selectedParty.post}</p>}
                  {selectedParty.contact && <p>{selectedParty.contact}</p>}
                  {selectedParty.pincode && <p>{selectedParty.pincode}</p>}
                </div>
              )}
            </div>
          </section>

          {/* Quantity & Value */}
          <section className="rounded-xl border border-border bg-white">
            <h2 className="border-b px-5 py-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              Quantity &amp; Value
            </h2>
            <div className="grid gap-4 px-5 py-5 md:grid-cols-12">
              <Field
                label={`Quantity (${UNIT_LABELS[effectiveUnit]})`}
                error={errors.quantity}
                className="md:col-span-4"
              >
                <Input
                  inputMode="decimal"
                  placeholder="0"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  className="h-10"
                />
              </Field>

              {lineType === "other" && (
                <Field label="Unit" className="md:col-span-2">
                  <select
                    value={unit}
                    onChange={(e) => setUnit(e.target.value as UnitType)}
                    className="h-10 w-full rounded-lg border border-border bg-white px-2 text-sm"
                  >
                    {UNIT_TYPES.map((u) => (
                      <option key={u} value={u}>
                        {UNIT_LABELS[u]}
                      </option>
                    ))}
                  </select>
                </Field>
              )}

              <Field label="Unit Price (₹)" error={errors.unitPrice} className="md:col-span-3">
                <InputGroup>
                  <InputGroupAddon align="inline-start">₹</InputGroupAddon>
                  <InputGroupInput
                    inputMode="decimal"
                    placeholder="0.00"
                    value={unitPrice}
                    onChange={(e) => setUnitPrice(e.target.value)}
                  />
                </InputGroup>
              </Field>

              <div className="md:col-span-3 rounded-lg border bg-muted/40 p-3 flex items-end justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Total Amount
                </span>
                <span className="text-lg font-semibold text-foreground">
                  {formatINR(totalAmount)}
                </span>
              </div>
            </div>
          </section>

          {/* Dispatch Details */}
          <section className="rounded-xl border border-border bg-white">
            <h2 className="border-b px-5 py-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              Dispatch Details
            </h2>
            <div className="grid gap-4 px-5 py-5">
              <Field label="Notes (Optional)">
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Add any additional remarks..."
                  rows={3}
                  className="w-full rounded-lg border border-border bg-white p-3 text-sm focus:border-primary focus:ring-1 focus:ring-primary"
                />
              </Field>
            </div>
          </section>

          {errors.form ? (
            <p
              role="alert"
              className="rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700"
            >
              {errors.form}
            </p>
          ) : null}
        </div>

        {/* Right column: summary panel */}
        <div className="lg:col-span-5">
          <section className="rounded-xl border border-border bg-white p-5 shadow-sm sticky top-4">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              Summary
            </h2>
            <dl className="mt-4 space-y-3 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Item</dt>
                <dd className="font-medium text-foreground">
                  {displayName || "—"}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">To</dt>
                <dd className="font-medium text-foreground">
                  {selectedParty?.name ?? "—"}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Quantity</dt>
                <dd className="font-medium text-foreground">
                  {quantity ? `${num(quantity).toLocaleString("en-IN")} ${UNIT_LABELS[effectiveUnit]}` : "—"}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Dispatch Date</dt>
                <dd className="font-medium text-foreground">
                  {date ? formatDate(date) : "—"}
                </dd>
              </div>
              <div className="flex justify-between border-t border-border pt-3">
                <dt className="font-semibold text-foreground">Total</dt>
                <dd className="font-semibold text-foreground">
                  {formatINR(totalAmount)}
                </dd>
              </div>
            </dl>
          </section>
        </div>
      </div>

      {/* Footer actions */}
      <div className="sticky bottom-0 -mx-4 mt-5 border-t bg-white/95 p-4 backdrop-blur sm:mx-0 sm:rounded-xl sm:border">
        <div className="flex items-center justify-end gap-3">
          <Button
            type="button"
            variant="outline"
            disabled={saving}
            onClick={() => router.back()}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleSaveAndChallan}
            disabled={saving}
            className="h-12 px-6 text-base"
          >
            {saving ? "Saving…" : "Save & Generate Challan"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  error,
  className,
  children,
}: {
  label: string;
  error?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={`grid gap-1.5 ${className ?? ""}`}>
      <Label className="text-xs font-semibold uppercase tracking-wider">
        {label}
      </Label>
      {children}
      {error ? (
        <p role="alert" className="text-xs text-red-600">
          {error}
        </p>
      ) : null}
    </div>
  );
}