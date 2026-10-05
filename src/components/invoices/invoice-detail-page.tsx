"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeftIcon,
  FileTextIcon,
  Loader2Icon,
  PencilIcon,
  TrashIcon,
} from "lucide-react";
import { toast } from "sonner";
import { Button, buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAuth } from "@/hooks/useAuth";
import { useInvoice } from "@/hooks/useInvoices";
import { deleteInvoiceApi } from "@/lib/invoices/invoiceApi";
import { formatDate, formatINR } from "@/lib/format";
import { UNIT_LABELS } from "@/lib/supabase/types";
import { InvoiceEditFlow } from "@/components/invoices/invoice-edit-flow";
import { DirectInvoiceEditFlow } from "@/components/invoices/direct-invoice-edit";
import type { InvoiceDetail } from "@/lib/invoices/types";

export function InvoiceDetailPage({ invoiceNumber }: { invoiceNumber: string }) {
  const { isAdmin, canManageMasters } = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { invoice, isLoading, error } = useInvoice(invoiceNumber);

  const [editing, setEditing] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Routed by invoice_type, NOT by "has no challans": a challan invoice that
  // lost its last challan cannot happen (update_invoice forbids it), and
  // guessing would mean loading the wrong editor for a direct invoice.
  const isDirect = invoice?.invoice_type === "direct";

  if (editing && invoice) {
    const afterSave = () => {
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      queryClient.invalidateQueries({
        queryKey: ["invoices", "detail", invoiceNumber],
      });
      setEditing(false);
    };
    return (
      <div className="mx-auto max-w-5xl">
        {isDirect ? (
          <DirectInvoiceEditFlow
            invoice={invoice}
            onCancel={() => setEditing(false)}
            onSaved={afterSave}
          />
        ) : (
          <InvoiceEditFlow
            invoice={invoice}
            onCancel={() => setEditing(false)}
            onSaved={afterSave}
          />
        )}
      </div>
    );
  }

  async function handleDelete() {
    if (deleting || !invoice) return;
    setDeleting(true);
    try {
      await deleteInvoiceApi(invoice.id);
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      // A direct invoice never held a challan hostage, so claiming otherwise
      // here would be wrong copy.
      toast.success(
        invoice.invoice_type === "direct"
          ? "Invoice deleted."
          : "Invoice deleted. Its challans are available again."
      );
      router.replace("/invoices");
    } catch (e) {
      // Surface the real reason, as the create/edit flows already do. A generic
      // message here hides exactly the failure that matters most — a role
      // guard or constraint error from delete_invoice — and leaves no way to
      // tell a permissions problem from a transient one.
      const msg = e instanceof Error ? e.message : "Please try again.";
      toast.error(`Could not delete the invoice. ${msg}`);
      setDeleting(false);
    }
  }

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Link
            href="/invoices"
            className={buttonVariants({ variant: "ghost", size: "icon-sm" })}
            aria-label="Back to invoices"
          >
            <ArrowLeftIcon />
          </Link>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              {invoice?.invoice_number ?? invoiceNumber}
            </h1>
            <p className="mt-0.5 text-sm text-zinc-500">
              {invoice ? formatDate(invoice.invoice_date) : ""}
            </p>
          </div>
        </div>
        {/* The A4 is the printable artifact, so its entry point is available to
            every role (incl. viewer) and sits outside the manage gate. Print and
            Download PDF live on the preview sheet itself — one implementation,
            built from the same view model. */}
        <div className="flex items-center gap-2">
          {invoice && (
            <Link
              href={`/invoices/${invoice.invoice_number}/preview`}
              className="inline-flex"
            >
              <Button
                variant="outline"
                className="bg-emerald-600 text-white hover:bg-emerald-700"
              >
                <FileTextIcon /> View A4
              </Button>
            </Link>
          )}
          {invoice && canManageMasters && (
            <>
              <Button variant="outline" onClick={() => setEditing(true)}>
                <PencilIcon /> Edit
              </Button>
              {isAdmin && (
                <Button
                  variant="outline"
                  className="text-destructive hover:text-destructive"
                  onClick={() => setDeleteOpen(true)}
                >
                  <TrashIcon /> Delete
                </Button>
              )}
            </>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 rounded-xl border bg-white p-8 text-sm text-zinc-500">
          <Loader2Icon className="size-4 animate-spin" /> Loading invoice…
        </div>
      ) : error ? (
        <div className="rounded-xl border bg-red-50 p-8 text-center text-sm text-red-700">
          Could not load this invoice. Please try again.
        </div>
      ) : !invoice ? (
        <div className="rounded-xl border bg-white p-12 text-center">
          <p className="text-sm text-zinc-500">Invoice not found.</p>
        </div>
      ) : (
        <>
          {/* Identity blocks */}
          <div className="mb-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border bg-white p-4">
              <p className="text-xs uppercase tracking-wide text-zinc-500">From</p>
              <p className="mt-1 text-sm font-semibold">
                {invoice.our_company_name ?? "—"}
              </p>
              <p className="mt-0.5 whitespace-pre-line text-xs text-zinc-600">
                {[invoice.our_address, invoice.our_city, invoice.our_state]
                  .filter(Boolean)
                  .join(", ")}
              </p>
              <p className="mt-1 text-xs text-zinc-500">
                {invoice.our_pincode ? `PIN ${invoice.our_pincode}` : ""}
              </p>
              {(invoice.our_gstin || invoice.our_pan) && (
                <p className="mt-1 text-xs text-zinc-500">
                  {invoice.our_gstin ? `GSTIN ${invoice.our_gstin}` : ""}
                  {invoice.our_gstin && invoice.our_pan ? " · " : ""}
                  {invoice.our_pan ? `PAN ${invoice.our_pan}` : ""}
                </p>
              )}
            </div>
            <div className="rounded-xl border bg-white p-4">
              <p className="text-xs uppercase tracking-wide text-zinc-500">To</p>
              <p className="mt-1 text-sm font-semibold">
                {invoice.party_company ?? invoice.party_name ?? "—"}
              </p>
              <p className="mt-0.5 whitespace-pre-line text-xs text-zinc-600">
                {[invoice.party_location, invoice.party_post].filter(Boolean).join(", ")}
              </p>
              <p className="mt-1 text-xs text-zinc-500">
                {invoice.party_pincode ? `PIN ${invoice.party_pincode}` : ""}
                {invoice.party_contact ? ` · ${invoice.party_contact}` : ""}
              </p>
              {invoice.party_gstin && (
                <p className="mt-1 text-xs text-zinc-500">
                  GSTIN {invoice.party_gstin}
                  {invoice.party_state ? ` · ${invoice.party_state}` : ""}
                </p>
              )}
            </div>
          </div>

          {/* Reference strip */}
          {(invoice.customer_ref_no || invoice.customer_ref_date || invoice.notes) && (
            <div className="mb-4 rounded-xl border bg-white p-4 text-sm">
              {invoice.customer_ref_no && (
                <p className="text-zinc-600">
                  <span className="text-zinc-400">Customer ref: </span>
                  {invoice.customer_ref_no}
                  {invoice.customer_ref_date
                    ? ` · ${formatDate(invoice.customer_ref_date)}`
                    : ""}
                </p>
              )}
              {invoice.notes && (
                <p className="mt-1 text-zinc-600">
                  <span className="text-zinc-400">Notes: </span>
                  {invoice.notes}
                </p>
              )}
            </div>
          )}

          {/* Challans — only meaningful for a challan-backed invoice. A Direct
              Invoice would render an empty "Delivery Challans" panel, which
              reads like something is missing rather than by design. */}
          {invoice.invoice_type !== "direct" && (
            <ChallansBlock invoice={invoice} />
          )}

          {invoice.invoice_type === "direct" && (
            <div className="mb-4 rounded-xl border bg-white p-4">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold">Direct Invoice</h2>
                <Badge variant="secondary">No Delivery Challan</Badge>
              </div>
              <p className="mt-1 text-xs text-zinc-500">
                The items below were typed in by hand. Nothing is billed against
                a Delivery Challan, so no challan is marked as invoiced by this
                document.
              </p>
            </div>
          )}

          {/* Items */}
          <div className="mb-4 overflow-hidden rounded-xl border bg-white">
            <div className="border-b px-4 py-3">
              <h2 className="text-sm font-semibold">Line items</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/40 text-left text-xs uppercase tracking-wide text-zinc-500">
                    <th className="px-4 py-2">#</th>
                    <th className="px-4 py-2">HSN</th>
                    <th className="px-4 py-2">Description</th>
                    <th className="px-4 py-2 text-right">Qty</th>
                    <th className="px-4 py-2">Unit</th>
                    <th className="px-4 py-2 text-right">Rate</th>
                    <th className="px-4 py-2 text-right">GST</th>
                    <th className="px-4 py-2 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {invoice.items.map((it) => (
                    <tr key={it.id}>
                      <td className="px-4 py-2 text-zinc-400">{it.line_no}</td>
                      <td className="px-4 py-2 text-zinc-500">
                        {it.hsn_code ?? "—"}
                      </td>
                      <td className="px-4 py-2">
                        <div>
                          <p className="font-medium">{it.item_name}</p>
                          {it.item_remarks ? (
                            <p className="text-xs text-zinc-500">
                              {it.item_remarks}
                            </p>
                          ) : null}
                        </div>
                      </td>
                      <td className="px-4 py-2 text-right">
                        {formatQtyLocal(it.quantity)}
                      </td>
                      <td className="px-4 py-2 text-zinc-600">
                        {UNIT_LABELS[it.unit]}
                      </td>
                      <td className="px-4 py-2 text-right">
                        {formatINR(it.unit_price)}
                      </td>
                      <td className="px-4 py-2 text-right">
                        {it.gst_percent}%
                      </td>
                      <td className="px-4 py-2 text-right font-medium">
                        {formatINR(it.line_total)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="border-t border-border px-4 py-3">
              <div className="ml-auto max-w-xs space-y-1 text-sm">
                <div className="flex justify-between text-zinc-600">
                  <span>Subtotal</span>
                  <span>{formatINR(invoice.subtotal)}</span>
                </div>
                {/* AKPC bills intra-state, so GST is always split into CGST +
                    SGST (SGST is the residual so the pair always sums to
                    gst_total). */}
                <div className="flex justify-between text-zinc-600">
                  <span>CGST</span>
                  <span>{formatINR(invoice.cgst_total)}</span>
                </div>
                <div className="flex justify-between text-zinc-600">
                  <span>SGST</span>
                  <span>{formatINR(invoice.sgst_total)}</span>
                </div>
                <div className="flex justify-between border-t border-border pt-1.5 font-semibold">
                  <span>Total</span>
                  <span>{formatINR(invoice.total_amount)}</span>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Delete confirmation */}
      <Dialog open={deleteOpen} onOpenChange={(o) => !o && !deleting && setDeleteOpen(false)}>
        <DialogContent className="max-w-sm">
          <DialogTitle>Delete this invoice permanently?</DialogTitle>
          <DialogDescription>
            {invoice &&
              (invoice.invoice_type === "direct"
                ? `Invoice ${invoice.invoice_number} will be deleted permanently. It has no
              Delivery Challan linked, so no challan is affected. The invoice number
              is never reused.`
                : `Invoice ${invoice.invoice_number} will be deleted permanently. Its Delivery
              Challans become available for billing again. The invoice number is never
              reused.`)}
          </DialogDescription>
          <DialogFooter>
            <Button
              variant="outline"
              disabled={deleting}
              onClick={() => setDeleteOpen(false)}
            >
              Cancel
            </Button>
            <Button variant="destructive" disabled={deleting} onClick={handleDelete}>
              {deleting ? (
                <>
                  <Loader2Icon className="size-4 animate-spin" /> Deleting…
                </>
              ) : (
                "Delete Permanently"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ChallansBlock({ invoice }: { invoice: InvoiceDetail }) {
  // Keyed by source_document_id, which is only non-null for challan-backed
  // items -- this block is not rendered for a Direct Invoice at all. The null
  // guard is kept so a manual line could never silently merge into a
  // "null" bucket if that ever changed.
  const counts = new Map<string, number>();
  for (const it of invoice.items) {
    if (it.source_document_id == null) continue;
    counts.set(
      it.source_document_id,
      (counts.get(it.source_document_id) ?? 0) + 1
    );
  }

  return (
    <div className="mb-4 rounded-xl border bg-white p-4">
      <h2 className="mb-3 text-sm font-semibold">Delivery Challans</h2>
      {invoice.challans.length === 0 ? (
        <p className="text-sm text-zinc-400">No challans linked.</p>
      ) : (
        <ul className="divide-y">
          {invoice.challans.map((c) => (
            <li key={c.challanId} className="flex items-center justify-between gap-3 py-2">
              <div>
                <p className="text-sm font-medium">{c.document_number}</p>
                <p className="text-xs text-zinc-500">
                  {formatDate(c.transaction_date)}
                  {c.challan_number ? ` · Challan ${c.challan_number}` : ""}
                </p>
              </div>
              <Badge variant="secondary">
                {counts.get(c.challanId) ?? 0}{" "}
                {(counts.get(c.challanId) ?? 0) === 1 ? "item" : "items"}
              </Badge>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function formatQtyLocal(n: number): string {
  return new Intl.NumberFormat("en-IN", { maximumFractionDigits: 4 }).format(n);
}