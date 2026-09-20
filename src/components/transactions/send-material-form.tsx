"use client";

import { useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowUpRightIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  EntityCombobox,
  type PickerItem,
} from "@/components/transactions/entity-combobox";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/useAuth";
import { useActiveParties, useActiveComponents } from "@/hooks/useMasters";
import { createReceivingDocument } from "@/lib/transactions/createReceivingDocument";
import { formatDate } from "@/lib/format";
import type { Enums, Tables } from "@/lib/supabase/database.types";
import { UNIT_TYPES, UNIT_LABELS } from "@/lib/supabase/types";

type Component = Tables<"materials">;
type Party = Tables<"companies">;
type RecordCategory = Enums<"record_category">;
type UnitType = Enums<"unit_type">;
type LineType = Enums<"document_line_type">;
type CompanySettings = Tables<"company_settings">;

const RECORD_CATEGORY_OPTIONS: {
  value: RecordCategory;
  label: string;
}[] = [
  { value: "manufacturing", label: "Manufacturing Material" },
  { value: "other", label: "Tools / Other" },
];

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

function newLine(
  lineNo: number,
  componentName: string,
  lineType: LineType = "component"
): {
  id: string;
  lineNo: number;
  lineType: LineType;
  componentId: string | null;
  itemName: string;
  quantity: string;
  unit: UnitType;
  hsnCode: string;
  itemRemarks: string;
} {
  return {
    id: crypto.randomUUID(),
    lineNo,
    lineType,
    componentId: null,
    itemName: lineType === "component" ? componentName : "",
    quantity: "",
    unit: "pieces",
    hsnCode: "",
    itemRemarks: "",
  };
}

type Line = ReturnType<typeof newLine>;

const num = (s: string) => Number(s.replace(/,/g, "")) || 0;

export function SendMaterialForm({
  component,
}: {
  component?: Component | null;
}) {
  const router = useRouter();
  const { user, canCreate } = useAuth();
  const queryClient = useQueryClient();
  const { items: parties } = useActiveParties();
  const { items: activeComponents } = useActiveComponents();

  const [recordCategory, setRecordCategory] =
    useState<RecordCategory>("manufacturing");
  const [componentId, setComponentId] = useState<string | null>(
    component?.id ?? null
  );
  const [partyId, setPartyId] = useState<string | null>(null);
  const [date, setDate] = useState(todayISO());
  const [customerRefNo, setCustomerRefNo] = useState("");
  const [customerRefDate, setCustomerRefDate] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<Line[]>([
    newLine(1, component?.name ?? "", "component"),
  ]);

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const submittingRef = useRef(false);

  const selectedParty = parties.find((p) => p.id === partyId);

  const selectedComponent =
    activeComponents.find((c) => c.id === componentId) ??
    (component && component.id === componentId ? component : null) ??
    null;

  // Our own company details (FROM section) — snapshot onto the document.
  const { data: ourCompany } = useQuery({
    queryKey: ["company_settings"],
    queryFn: async (): Promise<CompanySettings | null> => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("company_settings")
        .select("*")
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as CompanySettings | null;
    },
  });

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

  // ----- line mutations -----
  function updateLine(id: string, fn: (l: Line) => Line) {
    setLines(lines.map((l) => (l.id === id ? fn(l) : l)));
  }

  function addLine() {
    setLines([
      ...lines,
      newLine(
        lines.length + 1,
        selectedComponent?.name ?? "",
        recordCategory === "other" ? "other" : "component"
      ),
    ]);
  }

  function removeLine(id: string) {
    if (lines.length === 1) return;
    const next = lines.filter((l) => l.id !== id);
    setLines(next.map((l, i) => ({ ...l, lineNo: i + 1 })));
  }

  function handleLineType(lineId: string, value: LineType) {
    // Tools / Other documents never reference a component master.
    if (recordCategory === "other" && value === "component") return;
    setLines((prev) =>
      prev.map((l) =>
        l.id === lineId
          ? {
              ...l,
              lineType: value,
              itemName:
                value === "component"
                  ? selectedComponent?.name ?? l.itemName
                  : l.itemName === selectedComponent?.name
                    ? ""
                    : l.itemName,
              unit:
                value === "component"
                  ? selectedComponent?.unit ?? l.unit
                  : l.unit,
            }
          : l
      )
    );
  }

  // ----- validation -----
  function validate(): boolean {
    const next: Record<string, string> = {};
    if (!partyId) next.party = "Select or add a customer / destination.";
    if (!date) next.date = "Enter a dispatch date.";
    if (recordCategory === "manufacturing" && !selectedComponent)
      next.component = "Select a component master for manufacturing material.";
    const emptyLines = lines.filter(
      (l) =>
        !l.itemName.trim() ||
        !l.quantity.trim() ||
        num(l.quantity) <= 0
    );
    if (emptyLines.length > 0)
      next.items = "Every item needs a description and a quantity above 0.";
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

    // Build FROM snapshot from saved company profile (fallback to defaults).
    const fromAddress =
      [ourCompany?.address_line1, ourCompany?.address_line2]
        .filter(Boolean)
        .join(", ") || null;

    try {
      const created = await createReceivingDocument({
        type: "given",
        kind: "other",
        source: "customer",
        recordCategory,
        companyId: selectedParty.id,
        transactionDate: date,
        customerRefNo: customerRefNo.trim() || null,
        customerRefDate: customerRefDate || null,
        notes: notes.trim() || null,
        createdBy: user.id,
        ourCompany: {
          companyName: ourCompany?.company_name ?? null,
          address: fromAddress,
          city: ourCompany?.city ?? null,
          state: ourCompany?.state ?? null,
          pincode: ourCompany?.pincode ?? null,
          gstin: ourCompany?.gstin ?? null,
          pan: ourCompany?.pan ?? null,
        },
        partySnapshot: {
          name: selectedParty.name,
          company: selectedParty.name,
          location: selectedParty.location,
          post: selectedParty.post,
          contact: selectedParty.contact,
          pincode: selectedParty.pincode,
        },
        partyGstin: selectedParty.gstin ?? null,
        partyState: selectedParty.state ?? null,
        items: lines.map((l) => ({
          lineNo: l.lineNo,
          lineType:
            recordCategory === "other" ? "other" : l.lineType,
          componentId:
            recordCategory === "other"
              ? null
              : l.lineType === "component"
                ? componentId
                : null,
          itemName: l.itemName.trim(),
          quantity: num(l.quantity),
          unit: l.unit,
          unitPrice: null,
          gstPercent: 0,
          hsnCode: l.hsnCode.trim() || null,
          itemRemarks: l.itemRemarks.trim() || null,
          subtotal: 0,
          gstAmount: 0,
          lineTotal: 0,
        })),
      });

      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      if (recordCategory === "manufacturing" && componentId) {
        queryClient.invalidateQueries({
          queryKey: ["component_parties", componentId],
        });
      }

      // Full-page redirect (not router.push): document numbers contain slashes
      // and a client-side nav can 404 from a stale route manifest; a hard load
      // always resolves through the server + catch-all route. Tools / Other
      // documents have no component scope and use the top-level catch-all.
      const target =
        recordCategory === "other"
          ? `/documents/${created.document_number}/challan`
          : `/components/${componentId}/documents/${created.document_number}/challan`;
      window.location.replace(target);
    } catch (e) {
      // Supabase throws a PostgrestError (plain object, not an Error), so
      // surface its `.message` directly instead of a generic fallback.
      const raw = (e as { message?: unknown } | null)?.message;
      setErrors({
        form:
          typeof raw === "string" && raw.trim().length > 0
            ? raw
            : "Could not save the send document.",
      });
    } finally {
      submittingRef.current = false;
      setSaving(false);
    }
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
          <div className="mt-2 inline-flex items-center gap-2 rounded-lg border border-border bg-white px-3 py-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
              {recordCategory === "manufacturing" ? "Component" : "Category"}
            </span>
            <span className="text-sm font-medium text-foreground">
              {recordCategory === "manufacturing"
                ? selectedComponent?.name ?? "Select a component…"
                : "Tools / Other"}
            </span>
          </div>
        </div>
      </div>

      {!canCreate && (
        <p className="mt-2 text-xs text-zinc-400">
          You have read-only access. Sending requires an operator or admin account.
        </p>
      )}

      {/* Record category */}
      <div className="mt-4 rounded-xl border border-border bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-center">
          <div className="flex-1">
            <Label className="text-xs font-semibold uppercase tracking-wider">
              What are you recording?
            </Label>
            <SegmentedControl
              options={RECORD_CATEGORY_OPTIONS}
              value={recordCategory}
              onChange={setRecordCategory}
            />
          </div>
        </div>
      </div>

      {/* Document details */}
      <section className="rounded-xl border border-border bg-white">
        <h2 className="border-b px-5 py-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          Document Details
        </h2>
        <div className="grid gap-4 px-5 py-5 md:grid-cols-12">
          {recordCategory === "manufacturing" && (
            <Field
              label="Component Master"
              error={errors.component}
              className="md:col-span-4"
            >
              <EntityCombobox
                items={activeComponents.map(toPicker)}
                selectedId={componentId}
                placeholder="Search Component Master..."
                searchPlaceholder="Search components..."
                emptyText="No components found."
                createLabel="Add component"
                canCreate={false}
                onSelect={(i) => {
                  setComponentId(i.id);
                  // A component line's description IS the master's name
                  // (shown as a read-only chip) — stamp it into the lines so
                  // validation/save see a non-empty item_name.
                  const master =
                    activeComponents.find((c) => c.id === i.id) ?? null;
                  if (master) {
                    setLines((prev) =>
                      prev.map((l) =>
                        l.lineType === "component"
                          ? {
                              ...l,
                              itemName: master.name,
                              unit: master.unit,
                            }
                          : l
                      )
                    );
                  }
                }}
                onCreate={async () => {
                  throw new Error("Manage components in Settings.");
                }}
              />
            </Field>
          )}

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

          <Field label="DC Date" error={errors.date} className="md:col-span-2">
            <Input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="h-10"
            />
          </Field>

          <Field label="Customer Ref. No." className="md:col-span-3">
            <Input
              value={customerRefNo}
              onChange={(e) => setCustomerRefNo(e.target.value)}
              placeholder="e.g. PO-2026-001"
              className="h-10"
            />
          </Field>

          <Field label="Customer Ref. Date" className="md:col-span-3">
            <Input
              type="date"
              value={customerRefDate}
              onChange={(e) => setCustomerRefDate(e.target.value)}
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
              {selectedParty.state && <p>{selectedParty.state}</p>}
              {selectedParty.gstin && <p>GSTIN: {selectedParty.gstin}</p>}
            </div>
          )}
        </div>
      </section>

      {/* Items */}
      <section className="mt-4 rounded-xl border border-border bg-white">
        <div className="flex items-center justify-between border-b px-5 py-3">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Material / Goods
          </h2>
          <button
            type="button"
            onClick={addLine}
            className="inline-flex items-center gap-1 text-xs font-semibold text-amber-700 hover:underline"
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
              component={selectedComponent}
              canChooseLineType={recordCategory === "manufacturing"}
              canRemove={lines.length > 1}
              onUpdate={(fn) => updateLine(line.id, fn)}
              onRemove={() => removeLine(line.id)}
              onLineType={(t) => handleLineType(line.id, t)}
            />
          ))}
        </div>
      </section>

      {/* Dispatch Details */}
      <section className="mt-4 rounded-xl border border-border bg-white">
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

      {/* Summary */}
      <section className="mt-4 rounded-xl border border-border bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Total Items:{" "}
              <span className="text-xl font-semibold text-foreground">
                {lines.length}
              </span>
            </p>
            <p className="mt-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {date ? `DC Date: ${formatDate(date)}` : "DC Date: —"}
              {customerRefNo.trim()
                ? ` · Ref: ${customerRefNo.trim()}`
                : ""}
            </p>
          </div>
        </div>

        {errors.form ? (
          <p
            role="alert"
            className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700"
          >
            {errors.form}
          </p>
        ) : null}

        <div className="mt-4 flex items-center justify-end gap-3 border-t border-border pt-4">
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
            {saving ? "Saving…" : "Save & Confirm Challan"}
          </Button>
        </div>
      </section>
    </div>
  );
}

function LineCard({
  line,
  component,
  canChooseLineType,
  canRemove,
  onUpdate,
  onRemove,
  onLineType,
}: {
  line: Line;
  component: Component | null;
  canChooseLineType: boolean;
  canRemove: boolean;
  onUpdate: (fn: (l: Line) => Line) => void;
  onRemove: () => void;
  onLineType: (t: LineType) => void;
}) {
  // Tools / Other documents are always free-text lines.
  const lineType = canChooseLineType ? line.lineType : "other";
  return (
    <article className="rounded-xl border border-border bg-white p-4">
      <header className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
          Item {line.lineNo}
        </span>

        {canChooseLineType && (
          <div className="flex items-center gap-2">
            {/* Manufactured Material | Other */}
            <div className="flex rounded-lg border border-border bg-zinc-100 p-0.5">
              {(["component", "other"] as LineType[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => onLineType(t)}
                  className={`rounded-md px-2.5 py-1 text-[11px] font-semibold transition-all ${
                    lineType === t
                      ? "bg-white text-foreground shadow-sm border border-border/40"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {t === "component" ? "Manufactured Material" : "Other"}
                </button>
              ))}
            </div>

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
          </div>
        )}

        {!canChooseLineType && canRemove && (
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
        {/* Description of Goods */}
        {lineType === "component" && component ? (
          <div className="grid gap-1.5">
            <Label className="text-xs font-semibold uppercase tracking-wider">
              Description of Goods
            </Label>
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
          </div>
        ) : (
          <div className="grid gap-1.5">
            <Label className="text-xs font-semibold uppercase tracking-wider">
              Description of Goods
            </Label>
            <Input
              value={line.itemName}
              onChange={(e) =>
                onUpdate((l) => ({ ...l, itemName: e.target.value }))
              }
              placeholder="e.g. Flange YOKE-8585-JW"
              className="h-10"
            />
          </div>
        )}

        {/* Quantity | Unit */}
        <div className="grid grid-cols-2 gap-3">
          <div className="grid gap-1.5">
            <Label className="text-xs font-semibold uppercase tracking-wider">
              MOQ / Quantity
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

        {/* HSN/SAC | Remarks */}
        <div className="grid grid-cols-2 gap-3">
          <div className="grid gap-1.5">
            <Label className="text-xs font-semibold uppercase tracking-wider">
              HSN/SAC
            </Label>
            <Input
              value={line.hsnCode}
              onChange={(e) =>
                onUpdate((l) => ({
                  ...l,
                  hsnCode: e.target.value.toUpperCase(),
                }))
              }
              placeholder="e.g. 8708"
              className="h-10 uppercase"
            />
          </div>
          <div className="grid gap-1.5">
            <Label className="text-xs font-semibold uppercase tracking-wider">
              Remarks
            </Label>
            <Input
              value={line.itemRemarks}
              onChange={(e) =>
                onUpdate((l) => ({ ...l, itemRemarks: e.target.value }))
              }
              placeholder="e.g. Return after machining"
              className="h-10"
            />
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