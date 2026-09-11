"use client";

import { useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ArrowDownLeftIcon,
  CheckIcon,
  PlusIcon,
  RotateCcwIcon,
  Trash2Icon,
} from "lucide-react";
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
import {
  UNIT_TYPES,
  UNIT_LABELS,
  DOCUMENT_SOURCES,
  DOCUMENT_KINDS,
  PAYMENT_STATUSES,
  PAYMENT_LABELS,
  SOURCE_LABELS,
  KIND_LABELS,
  GST_PERCENTS,
} from "@/lib/supabase/types";

type Component = Tables<"materials">;
type Party = Tables<"companies">;
type DocumentSource = Enums<"document_source">;
type DocumentKind = Enums<"document_kind">;
type DocumentLineType = Enums<"document_line_type">;
type PaymentStatus = Enums<"payment_status">;
type UnitType = Enums<"unit_type">;

const toPicker = (p: { id: string; name: string }): PickerItem => ({
  id: p.id,
  name: p.name,
});

const num = (s: string) =>
  Number(s.replace(/,/g, "")) || 0;

function todayISO() {
  const d = new Date();
  const offset = d.getTimezoneOffset();
  const local = new Date(d.getTime() - offset * 60_000);
  return local.toISOString().slice(0, 10);
}

function newLine(lineNo: number): {
  id: string;
  lineNo: number;
  lineType: DocumentLineType;
  componentId: string | null;
  itemName: string;
  quantity: string;
  unit: UnitType;
  unitPrice: string;
  gstPercent: number;
} {
  return {
    id: crypto.randomUUID(),
    lineNo,
    lineType: "other",
    componentId: null,
    itemName: "",
    quantity: "",
    unit: "pieces",
    unitPrice: "",
    gstPercent: 0,
  };
}

type Line = ReturnType<typeof newLine>;

export type LineCalc = {
  subtotal: number;
  gstAmount: number;
  lineTotal: number;
};

const lineCalc = (line: Pick<Line, "quantity" | "unitPrice" | "gstPercent">): LineCalc => {
  const qty = num(line.quantity);
  const rate = line.unitPrice.trim() ? num(line.unitPrice) : 0;
  const subtotal = qty * rate;
  const gstAmount = subtotal * (line.gstPercent / 100);
  return { subtotal, gstAmount, lineTotal: subtotal + gstAmount };
};

export function MultiItemReceiveForm({ component }: { component: Component }) {
  const router = useRouter();
  const { user, canCreate } = useAuth();
  const queryClient = useQueryClient();
  const { items: parties } = useActiveParties();

  const [source, setSource] = useState<DocumentSource>("supplier");
  const [kind, setKind] = useState<DocumentKind>("raw-material");
  const [partyId, setPartyId] = useState<string | null>(null);
  const [challanNumber, setChallanNumber] = useState("");
  const [date, setDate] = useState(todayISO());
  const [vehicle, setVehicle] = useState("");
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus>("pending");
  const [lines, setLines] = useState<Line[]>([newLine(1)]);

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState<
    (Tables<"receiving_documents"> & { items: Tables<"receiving_document_items">[] }) | null
  >(null);
  const [saving, setSaving] = useState(false);
  const submittingRef = useRef(false);

  const selectedParty = parties.find((p) => p.id === partyId);

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

  // ----- per-line financial calculation (immediate, purely client-side) -----
  const docTotals = useMemo(() => {
    let subtotal = 0;
    let gstTotal = 0;
    let lineTotal = 0;
    const qtyByUnit = new Map<UnitType, number>();
    for (const line of lines) {
      const c = lineCalc(line);
      subtotal += c.subtotal;
      gstTotal += c.gstAmount;
      lineTotal += c.lineTotal;
      const q = num(line.quantity);
      if (q > 0) qtyByUnit.set(line.unit, (qtyByUnit.get(line.unit) ?? 0) + q);
    }
    return { subtotal, gstTotal, lineTotal, qtyByUnit };
  }, [lines]);

  // ----- line mutations -----
  function updateLine(id: string, fn: (l: Line) => Line) {
    setLines(lines.map((l) => (l.id === id ? fn(l) : l)));
  }

  function addLine() {
    setLines([...lines, newLine(lines.length + 1)]);
  }

  function removeLine(id: string) {
    if (lines.length === 1) return;
    const next = lines.filter((l) => l.id !== id);
    setLines(next.map((l, i) => ({ ...l, lineNo: i + 1 })));
  }

  // ----- validation -----
  function validate(): boolean {
    const next: Record<string, string> = {};
    if (!partyId) next.party = "Select or add a party.";
    if (!date) next.date = "Enter a date.";
    if (source === "supplier" && !challanNumber.trim())
      next.challanNumber = "Enter the source challan number.";
    const badItem = lines.find(
      (l) =>
        !l.itemName.trim() ||
        !l.quantity.trim() ||
        num(l.quantity) <= 0 ||
        (l.unitPrice.trim() && num(l.unitPrice) < 0)
    );
    if (badItem) next.items = "Every item needs a name and a quantity above 0.";
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  // ----- save flow -----
  async function handleSubmit() {
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
      setErrors({ form: "Please select a party." });
      return;
    }

    submittingRef.current = true;
    setSaving(true);
    setErrors({});

    try {
      const created = await createReceivingDocument({
        type: "received",
        kind,
        source,
        paymentStatus: source === "shop" ? paymentStatus : null,
        companyId: selectedParty.id,
        transactionDate: date,
        challanNumber: source === "supplier" ? challanNumber.trim() : null,
        vehicleDetails: source === "supplier" ? vehicle.trim() : null,
        createdBy: user.id,
        partySnapshot: {
          name: selectedParty.name,
          company: selectedParty.name,
          location: selectedParty.location,
          post: selectedParty.post,
          contact: selectedParty.contact,
          pincode: selectedParty.pincode,
        },
        items: lines.map((l) => {
          const c = lineCalc(l);
          return {
            lineNo: l.lineNo,
            lineType: l.lineType,
            componentId: l.componentId,
            itemName: l.itemName.trim(),
            quantity: num(l.quantity),
            unit: l.unit,
            unitPrice: l.unitPrice.trim() ? num(l.unitPrice) : null,
            gstPercent: l.gstPercent,
            subtotal: c.subtotal,
            gstAmount: c.gstAmount,
            lineTotal: c.lineTotal,
          };
        }),
      });

      setSaved(created);
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      queryClient.invalidateQueries({
        queryKey: ["component_parties", component.id],
      });

      setPartyId(null);
      setLines([newLine(1)]);
      setChallanNumber("");
      setDate(todayISO());
      setVehicle("");
      setPaymentStatus("pending");
      setSource("supplier");
      setKind("raw-material");
    } catch (e) {
      setErrors({
        form:
          e instanceof Error
            ? e.message
            : "Could not save the receive document.",
      });
    } finally {
      submittingRef.current = false;
      setSaving(false);
    }
  }

  // ----- success state -----
  if (saved) {
    return (
      <div className="mx-auto max-w-md rounded-xl border bg-white p-6 text-center shadow-sm">
        <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
          <CheckIcon className="size-6" />
        </div>
        <p className="text-sm font-medium text-zinc-600">
          Received · {component.name}
        </p>
        <h2 className="mt-1 text-3xl font-semibold tracking-tight">
          {saved.document_number}
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {selectedParty?.name ?? "—"} ·{" "}
          {formatDate(saved.transaction_date)} ·{" "}
          {saved.items.length}{" "}
          {saved.items.length === 1 ? "item" : "items"} ·{" "}
          {formatINR(saved.total_amount)}
        </p>

        <div className="mt-6 grid gap-2">
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

  // ----- the one-screen multi-item form -----
  return (
    <div className="mx-auto max-w-[1280px]">
      {/* Page header */}
      <div className="flex items-center gap-3">
        <span className="flex size-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
          <ArrowDownLeftIcon className="size-5" />
        </span>
        <div>
          <h1 className="text-[24px] font-semibold tracking-tight">
            Material Receipt &amp; Purchase
          </h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Record incoming stock to the register.
          </p>
          <div className="mt-2 inline-flex items-center gap-2 rounded-lg border border-border bg-white px-3 py-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
              Component
            </span>
            <span className="text-sm font-medium text-foreground">
              {component.name}
            </span>
          </div>
        </div>
      </div>

      {!canCreate && (
        <p className="mt-2 text-xs text-zinc-400">
          You have read-only access. Receiving requires an operator or admin account.
        </p>
      )}

      {/* Smart selection bar */}
      <div className="mt-4 rounded-xl border border-border bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-center">
          <div className="flex-1">
            <Label className="text-xs font-semibold uppercase tracking-wider">
              What are you receiving?
            </Label>
            <SegmentedControl
              options={DOCUMENT_KINDS.map((k) => ({
                value: k,
                label: KIND_LABELS[k],
              }))}
              value={kind}
              onChange={setKind}
            />
          </div>
          <div className="flex-1">
            <Label className="text-xs font-semibold uppercase tracking-wider">
              Source
            </Label>
            <SegmentedControl
              options={DOCUMENT_SOURCES.map((s) => ({
                value: s,
                label: SOURCE_LABELS[s],
              }))}
              value={source}
              onChange={setSource}
            />
          </div>
        </div>
      </div>

      {/* General Information */}
      <section className="mt-4 rounded-xl border border-border bg-white">
        <h2 className="border-b px-5 py-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          General Information
        </h2>
        <div className="grid gap-4 px-5 py-5 md:grid-cols-12">
          <Field
            label={source === "supplier" ? "Supplier / Party" : "Shop / Party"}
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

          {source === "supplier" && (
            <Field
              label="Challan / Ref No."
              error={errors.challanNumber}
              className="md:col-span-2"
            >
              <Input
                value={challanNumber}
                onChange={(e) => setChallanNumber(e.target.value)}
                placeholder="e.g. CH-001"
              />
            </Field>
          )}

          <Field label="Date" error={errors.date} className="md:col-span-2">
            <Input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </Field>

          {source === "supplier" && (
            <Field label="Vehicle Details" className="md:col-span-4">
              <Input
                value={vehicle}
                onChange={(e) => setVehicle(e.target.value.toUpperCase())}
                placeholder="e.g. UK06AB1234"
              />
            </Field>
          )}

          {source === "shop" && (
            <Field label="Payment Status" className="md:col-span-4">
              <SegmentedControl
                options={PAYMENT_STATUSES.map((p) => ({
                  value: p,
                  label: PAYMENT_LABELS[p],
                }))}
                value={paymentStatus}
                onChange={setPaymentStatus}
              />
            </Field>
          )}
        </div>
      </section>

      {/* Items */}
      <section className="mt-4 rounded-xl border border-border bg-white">
        <div className="flex items-center justify-between border-b px-5 py-3">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Items
          </h2>
          <button
            type="button"
            onClick={addLine}
            className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 hover:underline"
          >
            <PlusIcon className="size-3.5" /> Add Another Item
          </button>
        </div>

        {errors.items ? (
          <p role="alert" className="px-5 py-1 text-xs font-medium text-red-600">
            {errors.items}
          </p>
        ) : null}

        <div className="grid gap-3 p-4 sm:grid-cols-2 sm:items-start sm:p-5">
          {lines.map((line) => (
            <LineCard
              key={line.id}
              line={line}
              canRemove={lines.length > 1}
              onUpdate={(fn) => updateLine(line.id, fn)}
              onRemove={() => removeLine(line.id)}
            />
          ))}
        </div>
      </section>

      {/* Document totals footer */}
      <div className="mt-4 rounded-xl border border-border bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex flex-col gap-1.5">
            <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Total Items:{" "}
              <span className="text-xl font-semibold text-foreground">
                {lines.length}
              </span>
            </p>
            <p className="flex items-center gap-2 flex-wrap text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Total Qty:{" "}
              {docTotals.qtyByUnit.size === 0 ? (
                <span className="text-base font-semibold text-foreground">—</span>
              ) : (
                <span className="text-base font-semibold text-foreground">
                  {[...docTotals.qtyByUnit.entries()]
                    .map(
                      ([unit, qty]) =>
                        `${new Intl.NumberFormat("en-IN").format(qty)} ${UNIT_LABELS[unit]}`
                    )
                    .join(", ")}
                </span>
              )}
            </p>
          </div>

          <div className="flex flex-col items-end gap-1.5">
            <div className="flex items-center gap-4 text-right">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Total (Excl. GST):
              </span>
              <span className="text-sm font-semibold text-foreground">
                {formatINR(docTotals.subtotal)}
              </span>
            </div>
            <div className="flex items-center gap-4 text-right">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Total GST:
              </span>
              <span className="text-sm font-semibold text-foreground">
                {formatINR(docTotals.gstTotal)}
              </span>
            </div>
            <div className="flex items-center gap-4 border-t px-2 py-1 text-right">
              <span className="text-xs font-bold uppercase tracking-wider text-emerald-700">
                Total (Incl. GST):
              </span>
              <span className="text-xl font-bold text-emerald-700">
                {formatINR(docTotals.lineTotal)}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => router.back()}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleSubmit}
              disabled={saving}
              className="h-11 min-w-40 text-sm"
            >
              <CheckIcon />
              {saving ? "Saving…" : "Save Document"}
            </Button>
          </div>
        </div>

        {errors.form ? (
          <p
            role="alert"
            className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700"
          >
            {errors.form}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function LineCard({
  line,
  canRemove,
  onUpdate,
  onRemove,
}: {
  line: Line;
  canRemove: boolean;
  onUpdate: (fn: (l: Line) => Line) => void;
  onRemove: () => void;
}) {
  const calc = lineCalc(line);

  return (
    <article className="rounded-xl border border-border bg-white p-4">
      <header className="mb-3 flex items-center justify-between gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
          Item {line.lineNo}
        </span>
        {canRemove && (
          <button
            type="button"
            onClick={onRemove}
            className="inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-red-50 hover:text-red-600"
            title="Remove item"
          >
            <Trash2Icon className="size-4" /> Remove
          </button>
        )}
      </header>

      <div className="grid gap-3">
        {/* Item / Material Name */}
        <div className="grid gap-1.5">
          <Label className="text-xs font-semibold uppercase tracking-wider">
            Item / Material Name
          </Label>
          <Input
            value={line.itemName}
            onChange={(e) =>
              onUpdate((l) => ({ ...l, itemName: e.target.value }))
            }
            placeholder="e.g. MS Rod"
            className="h-10"
          />
        </div>

        {/* Quantity | Unit */}
        <div className="grid grid-cols-2 gap-3">
          <div className="grid gap-1.5">
            <Label className="text-xs font-semibold uppercase tracking-wider">
              Quantity
            </Label>
            <Input
              inputMode="decimal"
              placeholder="0"
              value={line.quantity}
              onChange={(e) =>
                onUpdate((l) => ({ ...l, quantity: e.target.value }))
              }
              className="h-10"
            />
          </div>
          <div className="grid gap-1.5">
            <Label className="text-xs font-semibold uppercase tracking-wider">
              Unit
            </Label>
            <select
              value={line.unit}
              onChange={(e) =>
                onUpdate((l) => ({ ...l, unit: e.target.value as UnitType }))
              }
              className="h-10 w-full rounded-lg border border-border bg-white px-2 text-sm"
            >
              {UNIT_TYPES.map((u) => (
                <option key={u} value={u}>
                  {UNIT_LABELS[u]}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Rate | GST % */}
        <div className="grid grid-cols-2 gap-3">
          <div className="grid gap-1.5">
            <Label className="text-xs font-semibold uppercase tracking-wider">
              Rate (₹)
            </Label>
            <InputGroup>
              <InputGroupAddon align="inline-start">₹</InputGroupAddon>
              <InputGroupInput
                inputMode="decimal"
                placeholder="0.00"
                value={line.unitPrice}
                onChange={(e) =>
                  onUpdate((l) => ({ ...l, unitPrice: e.target.value }))
                }
              />
            </InputGroup>
          </div>
          <div className="grid gap-1.5">
            <Label className="text-xs font-semibold uppercase tracking-wider">
              GST %
            </Label>
            <select
              value={String(line.gstPercent)}
              onChange={(e) =>
                onUpdate((l) => ({
                  ...l,
                  gstPercent: Number(e.target.value) || 0,
                }))
              }
              className="h-10 w-full rounded-lg border border-border bg-white px-2 text-sm"
            >
              {GST_PERCENTS.map((g) => (
                <option key={g} value={g}>
                  {g}%
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Totals — visually separated from editable fields */}
        <div className="rounded-lg border bg-muted/30 px-3 py-2.5">
          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="text-muted-foreground">Total (Excl. GST)</span>
            <span className="font-medium">{formatINR(calc.subtotal)}</span>
          </div>
          <div className="mt-0.5 flex items-center justify-between gap-3 text-sm">
            <span className="font-semibold text-emerald-700">
              Total (Incl. GST)
            </span>
            <span className="text-lg font-bold text-emerald-700">
              {formatINR(calc.lineTotal)}
            </span>
          </div>
        </div>
      </div>
    </article>
  );
}

function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex rounded-lg border border-border bg-zinc-100 p-1 shadow-sm">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={`flex-1 rounded-md px-3 py-1.5 text-xs font-semibold transition-all ${
            value === opt.value
              ? "bg-white text-foreground shadow-sm border border-border/40"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {opt.label}
        </button>
      ))}
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