"use client";

import { FileTextIcon, Loader2Icon, PackageOpenIcon, PenLineIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/useAuth";
import type { InvoiceType } from "@/lib/invoices/types";
import { cn } from "@/lib/utils";

/**
 * Step 0 of Create Invoice — an explicit choice between the two ways an
 * invoice can be raised.
 *
 * These are cards rather than a checkbox or a dropdown because the two modes
 * differ in kind, not in degree: one derives its items from Delivery Challans
 * already sent, the other types them in by hand. A user who has to infer that
 * from a toggle will pick wrong.
 */
export function InvoiceModeChooser({
  onChoose,
  backToInvoices,
}: {
  onChoose: (mode: InvoiceType) => void;
  backToInvoices: () => void;
}) {
  const { canManageMasters } = useAuth();

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

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">New Invoice</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Bill Delivery Challans already sent, or raise a direct invoice with
          items typed in by hand.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <ModeCard
          icon={<PackageOpenIcon className="size-5" />}
          title="From Delivery Challan"
          description="Pick one or more Send challans and bill them. Items come from the challan and each one can be billed only once."
          badge="Links to challans"
          onClick={() => onChoose("challan")}
        />
        <ModeCard
          icon={<PenLineIcon className="size-5" />}
          title="Direct Invoice"
          description="Type the items in yourself — description, HSN, qty, rate and GST. Nothing is linked to a challan."
          badge="No challan"
          onClick={() => onChoose("direct")}
        />
      </div>

      <div className="mt-6">
        <Button variant="ghost" size="sm" onClick={backToInvoices}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

function ModeCard({
  icon,
  title,
  description,
  badge,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  badge: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group rounded-xl border bg-white p-5 text-left transition-colors",
        "hover:border-emerald-400 hover:bg-emerald-50/40 focus-visible:outline-none",
        "focus-visible:ring-2 focus-visible:ring-emerald-600"
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <span className="flex size-9 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700">
          {icon}
        </span>
        <Badge variant="secondary">{badge}</Badge>
      </div>
      <p className="mt-3 text-sm font-semibold">{title}</p>
      <p className="mt-1 text-xs leading-relaxed text-zinc-500">{description}</p>
    </button>
  );
}

/** Shared stepper pill row (Direct flow + review), same visual language as the
 *  challan wizard's. */
export function InvoiceStepper({
  labels,
  activeIndex,
}: {
  labels: string[];
  activeIndex: number;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-center gap-2">
      {labels.map((label, i) => {
        const current = i === activeIndex;
        const done = i < activeIndex;
        return (
          <div key={label} className="flex items-center gap-2">
            <div
              className={cn(
                "flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium",
                current || done
                  ? "border-emerald-600/60 bg-emerald-50 text-emerald-700"
                  : "border-border text-zinc-400"
              )}
            >
              <span
                className={cn(
                  "flex size-4 items-center justify-center rounded-full text-[10px]",
                  done ? "bg-emerald-600 text-white" : "bg-muted text-zinc-500"
                )}
              >
                {i + 1}
              </span>
              {label}
            </div>
            {i < labels.length - 1 && <div className="h-px w-4 bg-border" />}
          </div>
        );
      })}
    </div>
  );
}

export function AccessDeniedPanel() {
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

export function NoPartiesPanel() {
  return (
    <div className="rounded-xl border bg-white p-12 text-center">
      <FileTextIcon className="mx-auto mb-2 size-8 text-zinc-300" />
      <p className="text-sm font-medium">No parties yet</p>
      <p className="mt-1 text-xs text-zinc-500">
        An invoice needs a customer. Add Party Masters in Settings first.
      </p>
    </div>
  );
}

export function LoadingPanel({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 rounded-xl border bg-white p-8 text-sm text-zinc-500">
      <Loader2Icon className="size-4 animate-spin" /> {label}
    </div>
  );
}

/** Party label for the Bill To block. `companies` stores the trading name in
 *  `name` (there is no separate `party_company` column on the master). */
export function partyLabel(p: {
  name?: string | null;
  location?: string | null;
} | null): string {
  if (!p) return "Customer";
  return p.name?.trim() || "Customer";
}