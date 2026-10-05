"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeftIcon,
  CheckIcon,
  Loader2Icon,
  PackageOpenIcon,
  PlusIcon,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/useAuth";
import {
  useActiveMaterials,
  useChallanComponent,
  useEligibleChallans,
} from "@/hooks/useInvoices";
import { createInvoiceApi } from "@/lib/invoices/invoiceApi";
import { formatDate, formatINR } from "@/lib/format";
import { UNIT_LABELS } from "@/lib/supabase/types";
import { cn } from "@/lib/utils";
import { InvoiceModeChooser } from "@/components/invoices/invoice-mode-chooser";
import { InvoiceDirectFlow } from "@/components/invoices/invoice-direct-flow";
import {
  InvoiceReviewStep,
  type ReviewLine,
} from "@/components/invoices/invoice-review-step";
import type { InvoiceType } from "@/lib/invoices/types";

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

/**
 * Entry point for /invoices/new: an explicit mode choice, then one of two
 * independent wizards.
 *
 * The two modes are separate components, not one component with a branch.
 * They share the Review screen (invoice-review-step.tsx) and nothing else —
 * a challan invoice has a source document per item, a direct one has none,
 * and the state to track that difference is enough on its own. Keeping them
 * apart is what guarantees a direct invoice can never be built out of
 * half-selected challans, or vice versa.
 *
 * `?challan=<id>` skips the chooser and goes straight into the challan wizard:
 * that deep link already implies the mode, and the caller is the "Create
 * invoice" action on an existing challan.
 */
export function InvoiceCreateFlow({
  preselectChallanId = null,
}: {
  /** Challan to start from, from /invoices/new?challan=<id>. Resolves its
   *  component, then jumps straight to Review with that challan ticked. */
  preselectChallanId?: string | null;
}) {
  const { canManageMasters } = useAuth();
  const router = useRouter();
  const [mode, setMode] = useState<InvoiceType | null>(
    preselectChallanId ? "challan" : null
  );

  const backToInvoices = () => router.push("/invoices");

  if (!mode) {
    return (
      <InvoiceModeChooser onChoose={setMode} backToInvoices={backToInvoices} />
    );
  }

  if (mode === "direct") {
    return (
      <InvoiceDirectFlow
        canManageMasters={canManageMasters}
        onSwitchMode={() => setMode(null)}
      />
    );
  }

  return <ChallanInvoiceWizard preselectChallanId={preselectChallanId} />;
}

/**
 * The pre-existing challan-backed wizard. Unchanged behaviour: component →
 * challans → review, with the ?challan= preselect. Only the Review screen was
 * swapped for the shared one.
 */
function ChallanInvoiceWizard({
  preselectChallanId = null,
}: {
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

  const reviewLines = useMemo<ReviewLine[]>(() => {
    const out: ReviewLine[] = [];
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
          remarks: null,
          rate,
          gst,
        });
        ordinal++;
      }
    }
    return out;
  }, [selectedChallans, rates]);

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
        <InvoiceReviewStep
          mode="challan"
          header={{ invoiceDate, customerRefNo, customerRefDate, notes }}
          onHeaderChange={(patch) => {
            if (patch.invoiceDate !== undefined) setInvoiceDate(patch.invoiceDate);
            if (patch.customerRefNo !== undefined)
              setCustomerRefNo(patch.customerRefNo);
            if (patch.customerRefDate !== undefined)
              setCustomerRefDate(patch.customerRefDate);
            if (patch.notes !== undefined) setNotes(patch.notes);
          }}
          partyName={
            selectedChallans[0]?.party_company ??
            selectedChallans[0]?.party_name ??
            "Customer"
          }
          partyLocation={selectedChallans[0]?.party_location ?? null}
          challanChips={selectedChallans.map((c) => c.document_number)}
          lines={reviewLines}
          onRateChange={(key, patch) =>
            setRates((prev) => {
              const line = reviewLines.find((l) => l.key === key);
              // 0 is not nullish: never seed this fallback with 0.
              // On the ?challan= path rates are not pre-seeded, so use the rendered line.
              const cur = prev[key] ?? { rate: line?.rate ?? 0, gst: line?.gst ?? 0 };
              return {
                ...prev,
                [key]: {
                  rate: patch.rate ?? cur.rate,
                  gst: patch.gst ?? cur.gst,
                },
              };
            })
          }
          onBack={() => {
            setWizardTouched(true);
            setStep("challans");
          }}
          onEditItems={() => {
            setWizardTouched(true);
            setStep("challans");
          }}
          onConfirm={handleCreate}
          saving={saving}
        />
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
