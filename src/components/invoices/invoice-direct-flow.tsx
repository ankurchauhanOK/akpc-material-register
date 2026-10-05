"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeftIcon, CheckIcon, PlusIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { createClient } from "@/lib/supabase/client";
import { useActiveParties } from "@/hooks/useMasters";
import { createInvoiceApi } from "@/lib/invoices/invoiceApi";
import {
  EntityCombobox,
  type PickerItem,
} from "@/components/transactions/entity-combobox";
import {
  AccessDeniedPanel,
  InvoiceStepper,
  NoPartiesPanel,
  partyLabel,
} from "@/components/invoices/invoice-mode-chooser";
import {
  DirectInvoiceLineEditor,
  DirectTotalsCard,
  directLinesTotals,
  directLineError,
  newDirectLineDraft,
  toDirectLinePayloads,
  type DirectLineDraft,
} from "@/components/invoices/direct-invoice-line-editor";
import {
  InvoiceReviewStep,
  type ReviewLine,
} from "@/components/invoices/invoice-review-step";

type Step = "items" | "review";

const STEP_LABELS = ["Customer", "Items", "Review & Create"];

const toPicker = (p: { id: string; name: string }): PickerItem => ({
  id: p.id,
  name: p.name,
});

/**
 * Direct Invoice creation: pick a customer, type the items in, review, save.
 *
 * Reached only after an explicit "Direct Invoice" choice on /invoices/new.
 * The challan-backed wizard stays a separate component, so this one never
 * has to reason about a source document it does not have.
 *
 * `onSwitchMode` returns to the chooser rather than stepping "back" into the
 * challan wizard — letting one component hold both modes is what would
 * eventually leak a half-challan state into a direct save.
 */
export function InvoiceDirectFlow({
  canManageMasters,
  onSwitchMode,
}: {
  canManageMasters: boolean;
  onSwitchMode: () => void;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();

  const { items: parties } = useActiveParties();

  const [step, setStep] = useState<Step>("items");
  const [partyId, setPartyId] = useState<string | null>(null);
  const [lines, setLines] = useState<DirectLineDraft[]>([newDirectLineDraft(0)]);
  const [invoiceDate, setInvoiceDate] = useState(todayLocal());
  const [customerRefNo, setCustomerRefNo] = useState("");
  const [customerRefDate, setCustomerRefDate] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const submittingRef = useRef(false);

  const selectedParty = useMemo(
    () => parties.find((p) => p.id === partyId) ?? null,
    [parties, partyId]
  );

  const totals = useMemo(() => directLinesTotals(lines), [lines]);

  const allLinesValid = useMemo(
    () => lines.length > 0 && lines.every((l) => directLineError(l) === null),
    [lines]
  );

  const reviewLines = useMemo<ReviewLine[]>(
    () =>
      lines.map((l, i) => ({
        key: l.key,
        ordinal: i + 1,
        sourceItemId: null,
        sourceDocumentId: null,
        sourceDocumentNumber: null,
        lineType: "other",
        componentId: null,
        componentName: null,
        itemName: l.itemName.trim(),
        quantity: Number(l.quantity) || 0,
        unit: l.unit,
        hsnCode: l.hsnCode.trim() || null,
        remarks: l.remarks.trim() || null,
        rate: Number(l.rate) || 0,
        gst: l.gst,
      })),
    [lines]
  );

  // Inline party creation, same pattern as multi-item-receive-form: a customer
  // that does not exist yet should not block the invoice.
  const createParty = useMutation({
    mutationFn: async (name: string): Promise<PickerItem> => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("companies")
        .insert({ name })
        .select("*")
        .single();
      if (error) throw new Error("Could not add party.");
      return toPicker(data as { id: string; name: string });
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["companies"] }),
  });

  if (!canManageMasters) {
    return (
      <div className="mx-auto max-w-4xl">
        <AccessDeniedPanel />
      </div>
    );
  }

  function patchLine(key: string, patch: Partial<DirectLineDraft>) {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }

  function addLine() {
    setLines((prev) => [...prev, newDirectLineDraft(prev.length)]);
  }

  function removeLine(key: string) {
    // Never leave zero rows behind: remove_invoice lines would be a no-op and
    // an empty editor is a dead end. The last row is cleared instead.
    setLines((prev) =>
      prev.length === 1
        ? [newDirectLineDraft(0)]
        : prev.filter((l) => l.key !== key)
    );
  }

  function enterReview() {
    if (!partyId) {
      toast.error("Select a customer first.");
      return;
    }
    if (!allLinesValid) {
      toast.error("Fix the highlighted items first.");
      return;
    }
    setStep("review");
  }

  async function handleCreate() {
    if (saving || submittingRef.current) return;
    if (!selectedParty) {
      toast.error("Select a customer first.");
      return;
    }
    if (!allLinesValid) {
      toast.error("Fix the highlighted items first.");
      return;
    }
    submittingRef.current = true;
    setSaving(true);
    try {
      // The SAME create_invoice RPC as the challan flow, with an EMPTY challan
      // array: the server reads that as "direct", stores invoice_type='direct'
      // and inserts zero invoice_challans rows. One persistence path, so the
      // two modes cannot drift apart in the database.
      const number = await createInvoiceApi({
        companyId: selectedParty.id,
        invoiceDate,
        notes: notes.trim() || null,
        customerRefNo: customerRefNo.trim() || null,
        customerRefDate: customerRefDate || null,
        challans: [],
        lines: toDirectLinePayloads(lines),
      });

      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      toast.success(`Invoice ${number} created.`);
      router.replace(`/invoices/${number}`);
    } catch (e) {
      submittingRef.current = false;
      setSaving(false);
      const msg = e instanceof Error ? e.message : "Please try again.";
      toast.error(`Could not create the invoice. ${msg}`);
    }
  }

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-4 flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => {
            if (step === "review") setStep("items");
            else onSwitchMode();
          }}
          aria-label="Back"
        >
          <ArrowLeftIcon />
        </Button>
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-semibold tracking-tight">
            New Invoice
          </h1>
          <p className="mt-1 truncate text-sm text-zinc-500">
            Direct Invoice — items typed in by hand, no Delivery Challan linked.
          </p>
        </div>
        <Badge variant="secondary" className="ml-auto shrink-0">
          Direct
        </Badge>
      </div>

      <InvoiceStepper
        labels={STEP_LABELS}
        activeIndex={step === "items" ? 1 : 2}
      />

      {step === "items" && (
        <>
          {/* Customer */}
          <div className="mb-4 rounded-xl border bg-white p-4">
            <h3 className="mb-3 text-sm font-semibold">Customer</h3>
            {parties.length === 0 ? (
              <NoPartiesPanel />
            ) : (
              <>
                <EntityCombobox
                  items={parties.map(toPicker)}
                  selectedId={partyId}
                  placeholder="Search Party Master..."
                  searchPlaceholder="Search party..."
                  emptyText="No parties found."
                  createLabel="Add party"
                  canCreate={true}
                  onSelect={(i) => setPartyId(i.id)}
                  onCreate={(name) => createParty.mutateAsync(name)}
                />
                <p className="mt-2 flex items-center gap-1 text-xs text-zinc-500">
                  {selectedParty ? (
                    <>
                      <CheckIcon className="size-3 text-emerald-600" />
                      {partyLabel(selectedParty)}
                      {selectedParty.location
                        ? ` · ${selectedParty.location}`
                        : ""}
                      {selectedParty.gstin
                        ? ` · GSTIN ${selectedParty.gstin}`
                        : ""}
                    </>
                  ) : (
                    "Pick the Party Master record to bill."
                  )}
                </p>
                <p className="mt-1 text-xs text-zinc-500">
                  The invoice snapshots this party&apos;s details as they are
                  now, so later edits to the Party Master never rewrite an
                  issued invoice.
                </p>
              </>
            )}
          </div>

          <DirectInvoiceLineEditor
            lines={lines}
            onChange={patchLine}
            onAdd={addLine}
            onRemove={removeLine}
          />

          <DirectTotalsCard
            subtotal={totals.subtotal}
            gst={totals.gst}
            total={totals.total}
          />

          <div className="flex items-center justify-end gap-2">
            <Button variant="outline" onClick={onSwitchMode} disabled={saving}>
              Change mode
            </Button>
            <Button onClick={enterReview} disabled={!partyId || !allLinesValid}>
              <PlusIcon /> Review
            </Button>
          </div>
        </>
      )}

      {step === "review" && (
        <InvoiceReviewStep
          mode="direct"
          header={{ invoiceDate, customerRefNo, customerRefDate, notes }}
          onHeaderChange={(patch) => {
            if (patch.invoiceDate !== undefined) setInvoiceDate(patch.invoiceDate);
            if (patch.customerRefNo !== undefined)
              setCustomerRefNo(patch.customerRefNo);
            if (patch.customerRefDate !== undefined)
              setCustomerRefDate(patch.customerRefDate);
            if (patch.notes !== undefined) setNotes(patch.notes);
          }}
          partyName={partyLabel(selectedParty)}
          partyLocation={selectedParty?.location ?? null}
          challanChips={[]}
          lines={reviewLines}
          onRateChange={() => {
            /* no-op: a direct invoice's items are edited on the items step */
          }}
          onBack={() => setStep("items")}
          onEditItems={() => setStep("items")}
          onConfirm={handleCreate}
          saving={saving}
        />
      )}
    </div>
  );
}

function todayLocal(): string {
  const d = new Date();
  const offset = d.getTimezoneOffset();
  return new Date(d.getTime() - offset * 60000).toISOString().slice(0, 10);
}

