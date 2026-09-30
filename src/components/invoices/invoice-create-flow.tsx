"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeftIcon,
  CheckIcon,
  ChevronLeftIcon,
  FilePlus2Icon,
  Loader2Icon,
  PackageOpenIcon,
  PlusIcon,
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
import { useAuth } from "@/hooks/useAuth";
import {
  useActiveMaterials,
  useChallanComponent,
  useEligibleChallans,
} from "@/hooks/useInvoices";
import { createInvoiceApi } from "@/lib/invoices/invoiceApi";
import { computeLineMoney } from "@/lib/invoices/types";
import { formatDate, formatINR } from "@/lib/format";
import { GST_PERCENTS, UNIT_LABELS } from "@/lib/supabase/types";
import { cn } from "@/lib/utils";

type Step = "component" | "challans" | "review";

const STEP_LABELS: { key: Step; label: string }[] = [
  { key: "component", label: "Component" },
  { key: "challans", label: "Delivery Challans" },
  { key: "review", label: "Review & Create" },
];

function todayLocal(): string {
  const d = new Date();
  const offset = d.getTimezoneOffset();
  return new Date(d.getTime() - offset * 60000).toISOString().slice(0, 10);
}

export function InvoiceCreateFlow({
  preselectChallanId = null,
}: {
  /** Challan to start from, from /invoices/new?challan=<id>. Resolves its
   *  component, then jumps straight to Review with that challan ticked. */
  preselectChallanId?: string | null;
}) {
  const { canManageMasters } = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();

  const { items: materials, isLoading: materialsLoading } = useActiveMaterials();

  const [step, setStep] = useState<Step>("component");
  const [componentId, setComponentId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [rates, setRates] = useState<Record<string, { rate: number; gst: number }>>({});
  const [invoiceDate, setInvoiceDate] = useState(todayLocal());
  const [customerRefNo, setCustomerRefNo] = useState("");
  const [customerRefDate, setCustomerRefDate] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  /** Set by any wizard navigation/choice, which retires the ?challan= preselect. */
  const [wizardTouched, setWizardTouched] = useState(false);
  const submittingRef = useRef(false);

  // ---- ?challan=<id> preselect (derived, never written into state) -------
  // The flow is component-first, so the preselected challan supplies its own
  // component. Rather than pushing that into state from an effect (which
  // fights the async query and trips react-hooks/set-state-in-effect), the
  // preselect is folded into the values the wizard reads. It only applies
  // until the user touches the wizard, so Back / un-ticking behave normally.
  const { componentId: preselectComponentId } = useChallanComponent(
    preselectChallanId
  );
  const activeComponentId = componentId ?? preselectComponentId;

  const { items: eligible, isLoading: eligLoading, refetch } = useEligibleChallans(
    activeComponentId
  );

  // Ready once the eligible list for that component has loaded AND contains
  // the preselected challan (it is not eligible if already invoiced, or if
  // the component no longer matches — then the user just starts at step 1).
  const preselectReady =
    Boolean(preselectChallanId) &&
    Boolean(preselectComponentId) &&
    !eligLoading &&
    eligible.some((c) => c.id === preselectChallanId);

  const preselectActive = preselectChallanId !== null && preselectReady && !wizardTouched;

  const activeSelected = useMemo(
    () => (preselectActive ? new Set([preselectChallanId as string]) : selected),
    [preselectActive, preselectChallanId, selected]
  );
  const activeStep: Step = preselectActive ? "review" : step;

  const selectedChallans = useMemo(
    () => eligible.filter((c) => activeSelected.has(c.id)),
    [eligible, activeSelected]
  );

  const reviewLines = useMemo(() => {
    const out: Array<{
      key: string;
      ordinal: number;
      sourceItemId: string;
      sourceDocumentId: string;
      sourceDocumentNumber: string;
      lineType: "component" | "other";
      componentId: string | null;
      componentName: string | null;
      itemName: string;
      quantity: number;
      unit: "pieces" | "kg" | "meter" | "litre" | "set";
      hsnCode: string | null;
      rate: number;
      gst: number;
      subtotal: number;
      gstAmount: number;
      lineTotal: number;
    }> = [];
    let ordinal = 1;
    for (const c of selectedChallans) {
      for (const it of c.items) {
        const edit = rates[it.sourceItemId];
        const rate = edit?.rate ?? it.unitPrice;
        const gst = edit?.gst ?? it.gstPercent;
        out.push({
          key: it.sourceItemId,
          ordinal,
          sourceItemId: it.sourceItemId,
          sourceDocumentId: it.sourceDocumentId,
          sourceDocumentNumber: c.document_number,
          lineType: it.lineType,
          componentId: it.componentId,
          componentName: it.componentName,
          itemName: it.itemName,
          quantity: it.quantity,
          unit: it.unit,
          hsnCode: it.hsnCode,
          rate,
          gst,
          ...computeLineMoney(it.quantity, rate, gst),
        });
        ordinal++;
      }
    }
    return out;
  }, [selectedChallans, rates]);

  const totals = useMemo(() => {
    let subtotal = 0;
    let gst = 0;
    let total = 0;
    for (const l of reviewLines) {
      subtotal += l.subtotal;
      gst += l.gstAmount;
      total += l.lineTotal;
    }
    return { subtotal, gst, total };
  }, [reviewLines]);

  if (!canManageMasters) {
    return (
      <div className="rounded-xl border bg-white p-12 text-center">
        <PackageOpenIcon className="mx-auto mb-2 size-8 text-zinc-300" />
        <p className="text-sm font-medium">Access limited to admin & operators</p>
        <p className="mt-1 text-xs text-zinc-500">
          Only users with an admin or operator role can create invoices.
        </p>
      </div>
    );
  }

  function toggleChallan(id: string) {
    setWizardTouched(true);
    setSelected((prev) => {
      // The preselect is derived, never stored in `selected`, so materialise
      // it here or the un-tick would be swallowed.
      const base =
        preselectActive && preselectChallanId
          ? new Set([preselectChallanId])
          : prev;
      const next = new Set(base);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function enterReview() {
    const defaults: Record<string, { rate: number; gst: number }> = {};
    for (const c of selectedChallans) {
      for (const it of c.items) {
        defaults[it.sourceItemId] = { rate: it.unitPrice, gst: it.gstPercent };
      }
    }
    setRates(defaults);
    setWizardTouched(true);
    setStep("review");
  }

  async function handleCreate() {
    if (saving || submittingRef.current) return;
    if (reviewLines.length === 0) {
      toast.error("Select at least one challan to invoice.");
      return;
    }
    submittingRef.current = true;
    setSaving(true);
    try {
      const lines = reviewLines.map((l, idx) => ({
        line_no: idx + 1,
        source_document_id: l.sourceDocumentId,
        source_item_id: l.sourceItemId,
        line_type: l.lineType,
        component_id: l.componentId,
        item_name: l.itemName,
        quantity: l.quantity,
        unit: l.unit,
        hsn_code: l.hsnCode,
        item_remarks: null,
        unit_price: l.rate,
        gst_percent: l.gst,
      }));

      const number = await createInvoiceApi({
        companyId: selectedChallans[0].company_id,
        invoiceDate,
        notes: notes.trim() || null,
        customerRefNo: customerRefNo.trim() || null,
        customerRefDate: customerRefDate || null,
        // From selectedChallans (i.e. activeSelected), NOT the raw `selected`
        // state: the ?challan= preselect is derived, never written to state,
        // so `selected` is empty on that path and create_invoice would reject
        // it with "Select at least one Delivery Challan." Deriving it here
        // also guarantees p_challans matches the lines above.
        challans: selectedChallans.map((c) => c.id),
        lines,
      });

      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      queryClient.invalidateQueries({ queryKey: ["invoices", "eligible"] });
      toast.success(`Invoice ${number} created.`);
      router.replace(`/invoices/${number}`);
    } catch (e) {
      submittingRef.current = false;
      setSaving(false);
      const msg = e instanceof Error ? e.message : "Please try again.";
      toast.error(`Could not create the invoice. ${msg}`);
      queryClient.invalidateQueries({ queryKey: ["invoices", "eligible"] });
    }
  }

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-4 flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => {
            setWizardTouched(true);
            if (activeStep === "review") setStep("challans");
            else if (activeStep === "challans") setStep("component");
            else router.push("/invoices");
          }}
          aria-label="Back"
        >
          <ArrowLeftIcon />
        </Button>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">New Invoice</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Bill one or more Delivery Challans to a customer in one go.
          </p>
        </div>
      </div>

      {/* Stepper */}
      <div className="mb-6 flex items-center gap-2">
        {STEP_LABELS.map((s, i) => {
          const current = s.key === activeStep;
          const done =
            (s.key === "component" &&
              (activeStep === "challans" || activeStep === "review")) ||
            (s.key === "challans" && activeStep === "review");
          return (
            <div key={s.key} className="flex items-center gap-2">
              <div
                className={cn(
                  "flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium",
                  current
                    ? "border-emerald-600 bg-emerald-50 text-emerald-700"
                    : done
                      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                      : "border-border text-zinc-400"
                )}
              >
                <span
                  className={cn(
                    "flex size-4 items-center justify-center rounded-full text-[10px]",
                    done ? "bg-emerald-600 text-white" : "bg-muted text-zinc-500"
                  )}
                >
                  {done ? <CheckIcon className="size-3" /> : i + 1}
                </span>
                {s.label}
              </div>
              {i < STEP_LABELS.length - 1 && (
                <div className="h-px w-4 bg-border" />
              )}
            </div>
          );
        })}
      </div>

      {activeStep === "component" && (
        <>
          <p className="mb-3 text-sm text-zinc-500">
            Start with a Component Master. We show every saved Send challan
            that contains it — a challan is billed as a whole, all lines included.
          </p>
          {materialsLoading ? (
            <div className="flex items-center gap-2 rounded-xl border bg-white p-8 text-sm text-zinc-500">
              <Loader2Icon className="size-4 animate-spin" /> Loading components…
            </div>
          ) : materials.length === 0 ? (
            <div className="rounded-xl border bg-white p-12 text-center">
              <p className="text-sm text-zinc-500">
                No components yet. Add Component Masters in Settings first.
              </p>
            </div>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              {materials.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => {
                    setWizardTouched(true);
                    setComponentId(m.id);
                    setSelected(new Set());
                    setStep("challans");
                  }}
                  className="rounded-xl border bg-white p-4 text-left transition-colors hover:border-emerald-300 hover:bg-emerald-50/40"
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-sm font-semibold">{m.name}</p>
                    <Badge variant="secondary">{UNIT_LABELS[m.unit]}</Badge>
                  </div>
                  <p className="mt-1 truncate text-xs text-zinc-500">
                    {m.part_code ? m.part_code : "No part code"}
                    {m.default_price != null
                      ? ` · ${formatINR(m.default_price)}`
                      : " · Price not set"}
                  </p>
                </button>
              ))}
            </div>
          )}
        </>
      )}

      {activeStep === "challans" && (
        <ChallanPicker
          isLoading={eligLoading}
          eligible={eligible}
          selected={activeSelected}
          onToggle={toggleChallan}
          onNext={enterReview}
          onRetry={refetch}
        />
      )}

      {activeStep === "review" && (
        <>
          {/* Invoice header fields */}
          <div className="mb-4 rounded-xl border bg-white p-4">
            <h3 className="mb-3 text-sm font-semibold">Invoice details</h3>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="grid gap-1.5">
                <Label className="text-sm font-medium">Invoice date</Label>
                <Input
                  type="date"
                  value={invoiceDate}
                  onChange={(e) => setInvoiceDate(e.target.value)}
                  className="h-10"
                />
              </div>
              <div className="grid gap-1.5">
                <Label className="text-sm font-medium">Customer ref no.</Label>
                <Input
                  value={customerRefNo}
                  onChange={(e) => setCustomerRefNo(e.target.value)}
                  placeholder="Optional"
                  className="h-10"
                />
              </div>
              <div className="grid gap-1.5">
                <Label className="text-sm font-medium">Customer ref date</Label>
                <Input
                  type="date"
                  value={customerRefDate}
                  onChange={(e) => setCustomerRefDate(e.target.value)}
                  className="h-10"
                />
              </div>
              <div className="grid gap-1.5">
                <Label className="text-sm font-medium">Notes</Label>
                <Input
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Optional"
                  className="h-10"
                />
              </div>
            </div>
          </div>

          {/* Party + challans summary */}
          <div className="mb-4 rounded-xl border bg-white p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-xs uppercase tracking-wide text-zinc-500">
                  Bill To
                </p>
                <p className="text-sm font-semibold">
                  {selectedChallans[0]?.party_company ??
                    selectedChallans[0]?.party_name ??
                    "Customer"}
                </p>
                <p className="text-xs text-zinc-500">
                  {selectedChallans[0]?.party_location ?? ""}
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setWizardTouched(true);
                  setStep("challans");
                }}
              >
                <ChevronLeftIcon /> Change challans
              </Button>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {selectedChallans.map((c) => (
                <Badge key={c.id} variant="secondary">
                  {c.document_number}
                </Badge>
              ))}
            </div>
          </div>

          {/* Lines */}
          <div className="mb-4 overflow-hidden rounded-xl border bg-white">
            <div className="border-b px-4 py-3">
              <h3 className="text-sm font-semibold">Line items</h3>
              <p className="mt-0.5 text-xs text-zinc-500">
                Rates come from each Component Master (or the challan). Edit any
                line below — the rate is snapshotted onto this invoice only.
              </p>
            </div>
            <div className="divide-y">
              {reviewLines.map((l) => (
                <div key={l.key} className="px-4 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        <span className="mr-1.5 text-zinc-400">{l.ordinal}.</span>
                        {l.itemName}
                      </p>
                      <p className="truncate text-xs text-zinc-500">
                        {l.sourceDocumentNumber}
                        {l.componentName ? ` · ${l.componentName}` : ""}
                      </p>
                    </div>
                    <p className="whitespace-nowrap text-sm font-semibold">
                      {formatINR(l.lineTotal)}
                    </p>
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                    <div className="col-span-2 text-xs text-zinc-500 sm:col-span-1">
                      {formatQtyLocal(l.quantity)} {UNIT_LABELS[l.unit]}
                      {l.hsnCode ? (
                        <span className="text-zinc-400"> · HSN {l.hsnCode}</span>
                      ) : null}
                    </div>
                    <Field label="Rate (₹)">
                      <Input
                        type="number"
                        min={0}
                        step="0.01"
                        value={l.rate}
                        onChange={(e) => {
                          const rate = Number(e.target.value);
                          setRates((prev) => ({
                            ...prev,
                            [l.sourceItemId]: {
                              rate: Number.isFinite(rate) ? rate : l.rate,
                              gst: prev[l.sourceItemId]?.gst ?? l.gst,
                            },
                          }));
                        }}
                        className="h-9 text-sm"
                      />
                    </Field>
                    <Field label="GST %">
                      <Select
                        value={String(l.gst)}
                        onValueChange={(v) =>
                          setRates((prev) => ({
                            ...prev,
                            [l.sourceItemId]: {
                              rate: prev[l.sourceItemId]?.rate ?? l.rate,
                              gst: Number(v),
                            },
                          }))
                        }
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

          <div className="flex items-center justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => {
                  setWizardTouched(true);
                  setStep("challans");
                }}
              disabled={saving}
            >
              Back
            </Button>
            <Button onClick={handleCreate} disabled={saving}>
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
      )}
    </div>
  );
}

function ChallanPicker({
  isLoading,
  eligible,
  selected,
  onToggle,
  onNext,
  onRetry,
}: {
  isLoading: boolean;
  eligible: ReturnType<typeof useEligibleChallans>["items"];
  selected: Set<string>;
  onToggle: (id: string) => void;
  onNext: () => void;
  onRetry: () => void;
}) {
  return (
    <div>
      {isLoading ? (
        <div className="flex items-center gap-2 rounded-xl border bg-white p-8 text-sm text-zinc-500">
          <Loader2Icon className="size-4 animate-spin" /> Loading challans…
        </div>
      ) : eligible.length === 0 ? (
        <div className="rounded-xl border bg-white p-12 text-center">
          <PackageOpenIcon className="mx-auto mb-2 size-8 text-zinc-300" />
          <p className="text-sm font-medium">No billable challans found</p>
          <p className="mx-auto mt-1 max-w-md text-xs text-zinc-500">
            Every saved Send challan containing this component that is not
            already invoiced is listed here. Nothing to bill right now.
          </p>
          <Button variant="outline" size="sm" className="mt-4" onClick={onRetry}>
            Refresh
          </Button>
        </div>
      ) : (
        <>
          <p className="mb-3 text-sm text-zinc-500">
            Select one or more challans. All items on a selected challan are
            included.
          </p>
          <div className="grid gap-2">
            {eligible.map((c) => {
              const isSelected = selected.has(c.id);
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => onToggle(c.id)}
                  className={cn(
                    "flex items-center gap-3 rounded-xl border bg-white p-3 text-left transition-colors",
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
                        : "border-zinc-300 bg-white"
                    )}
                  >
                    {isSelected && <CheckIcon className="size-3.5" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="truncate text-sm font-semibold">
                        {c.document_number}
                      </p>
                      <p className="text-xs text-zinc-500">
                        {formatDate(c.transaction_date)}
                      </p>
                    </div>
                    <p className="mt-0.5 truncate text-xs text-zinc-500">
                      {(c.party_company ?? c.party_name ?? "—")}
                      {c.party_location ? ` · ${c.party_location}` : ""}
                    </p>
                    <p className="mt-1 truncate text-xs text-zinc-400">
                      {c.itemCount} {c.itemCount === 1 ? "item" : "items"} ·{" "}
                      {c.qtySummary}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>

          <div className="mt-4 flex items-center justify-end">
            <Button onClick={onNext} disabled={selected.size === 0}>
              <PlusIcon /> Review ({selected.size})
            </Button>
          </div>
        </>
      )}
    </div>
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