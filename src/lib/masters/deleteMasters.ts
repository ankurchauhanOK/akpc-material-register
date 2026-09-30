import { createClient } from "@/lib/supabase/client";
import { removeChallan } from "@/lib/supabase/storage";

/**
 * Trial-mode permanent deletes for master records.
 *
 * DELETE semantics (trial): permanently remove the master AND its
 * dependent records. Dependent records are disclosed by the UI before
 * the destructive action runs (see the breakdown helpers below). No
 * unrelated business data is ever touched.
 *
 * These are intentionally separate, clearly-named functions so the
 * production switch later is trivial: swap
 *   deleteComponentPermanently() -> archiveComponent()
 *   deleteCompanyPermanently()   -> archiveCompany()
 * (soft-delete via deleted_at) without touching the UI wiring.
 *
 * RLS enforces admin-only for every DELETE (migration 0004 and 0007).
 */

export type MasterUsageBreakdown = {
  /** Documents (receiving_documents) for a company; 0 for a component. */
  documents: number;
  /** Line items attached to a company's documents / referencing a component. */
  items: number;
  /** Transactions (visible/active only — RLS hides archived transactions). */
  transactions: number;
  /** Documents that are soft-deleted or cancelled (hidden from the UI). */
  ghostDocuments: number;
  /** Tax invoices billed against this master's records. */
  invoices: number;
};

/**
 * Permanently DELETE the given invoices, dependents first.
 *
 * Always deletes WHOLE invoices, never a subset of their lines: a header whose
 * totals no longer match its items is worse than no invoice at all. The DB has
 * ON DELETE CASCADE as the backstop, but doing it here keeps the deletion
 * explicit and lets the UI disclose the invoice count beforehand.
 */
export async function sweepInvoices(invoiceIds: string[]): Promise<void> {
  if (invoiceIds.length === 0) return;
  const supabase = createClient();

  // Must go through delete_invoice(), never a direct DELETE: the invoice RLS
  // policies are `using (false)` / absent on purpose so clients cannot bypass
  // the RPC's role and business-rule checks (see 20260927000001 §6). A direct
  // delete would match zero rows and silently orphan the invoice, so this
  // would look successful while leaving the invoice alive. delete_invoice is
  // SECURITY DEFINER (RLS-bypassing) and removes items + challan links itself.
  // It is admin-only, which matches every caller here: all three permanent
  // master deletes are admin-only.
  for (const invoiceId of new Set(invoiceIds)) {
    const { error } = await supabase.rpc("delete_invoice", {
      p_invoice_id: invoiceId,
    });
    if (error) throw error;
  }
}

/**
 * Permanently DELETE every invoice that bills the given Delivery Challans.
 * Called by the trial-mode company / transaction deletes so an invoiced challan
 * never blocks the sweep. An invoice bills challans of ONE company only, so
 * nothing unrelated is touched.
 */
export async function sweepInvoicesForChallans(
  challanIds: string[]
): Promise<void> {
  if (challanIds.length === 0) return;
  const supabase = createClient();

  const { data: links, error: linkError } = await supabase
    .from("invoice_challans")
    .select("invoice_id")
    .in("challan_id", challanIds);
  if (linkError) throw linkError;

  await sweepInvoices([...new Set((links ?? []).map((l) => l.invoice_id))]);
}

/**
 * Permanently DELETE every invoice that bills a line for the given component.
 * An invoice may also bill other components; it is removed whole rather than
 * left with a hole (see sweepInvoices). Matches what
 * getComponentUsageBreakdown discloses.
 */
export async function sweepInvoicesForComponent(componentId: string): Promise<void> {
  const supabase = createClient();

  const { data: billed, error: billedError } = await supabase
    .from("invoice_items")
    .select("invoice_id")
    .eq("component_id", componentId);
  if (billedError) throw billedError;

  await sweepInvoices([...new Set((billed ?? []).map((b) => b.invoice_id))]);
}

/**
 * Live + ghost reference breakdown for a company (party) master.
 *
 * Note: the transactions SELECT policy hides archived transactions from
 * the app, so only visible transactions are counted here. Archived
 * transactions are still swept by deleteCompanyPermanently() (admin
 * DELETE policy has no deleted_at filter).
 */
export async function getCompanyUsageBreakdown(
  id: string
): Promise<MasterUsageBreakdown> {
  const supabase = createClient();

  const { count: docCount, error: docError } = await supabase
    .from("receiving_documents")
    .select("id", { count: "exact", head: true })
    .eq("company_id", id);
  if (docError) throw docError;

  const { count: ghostCount, error: ghostError } = await supabase
    .from("receiving_documents")
    .select("id", { count: "exact", head: true })
    .eq("company_id", id)
    .or("deleted_at.not.is.null,status.eq.cancelled");
  if (ghostError) throw ghostError;

  const { data: companyDocs, error: companyDocsError } = await supabase
    .from("receiving_documents")
    .select("id")
    .eq("company_id", id);
  if (companyDocsError) throw companyDocsError;

  const { count: itemCount, error: itemError } = await supabase
    .from("receiving_document_items")
    .select("id", { count: "exact", head: true })
    .in("document_id", (companyDocs ?? []).map((d) => d.id));
  if (itemError) throw itemError;

  const { count: txnCount, error: txnError } = await supabase
    .from("transactions")
    .select("id", { count: "exact", head: true })
    .eq("company_id", id);
  if (txnError) throw txnError;

  // Invoices bill challans, so count the DISTINCT invoices linked to this
  // company's documents. Selecting the rows (instead of a head count) and
  // de-duplicating is required: one invoice can bill several challans of the
  // same company, and a head count would report it once per challan.
  const { data: invoiceLinks, error: invoiceError } = await supabase
    .from("invoice_challans")
    .select("invoice_id")
    .in("challan_id", (companyDocs ?? []).map((d) => d.id));
  if (invoiceError) throw invoiceError;
  const invoiceCount = new Set(
    (invoiceLinks ?? []).map((l) => l.invoice_id)
  ).size;

  return {
    documents: docCount ?? 0,
    items: itemCount ?? 0,
    transactions: txnCount ?? 0,
    ghostDocuments: ghostCount ?? 0,
    invoices: invoiceCount,
  };
}

/**
 * Live + ghost reference breakdown for a component master.
 */
export async function getComponentUsageBreakdown(
  id: string
): Promise<MasterUsageBreakdown> {
  const supabase = createClient();

  const { count: itemCount, error: itemError } = await supabase
    .from("receiving_document_items")
    .select("id", { count: "exact", head: true })
    .eq("component_id", id);
  if (itemError) throw itemError;

  const { count: txnCount, error: txnError } = await supabase
    .from("transactions")
    .select("id", { count: "exact", head: true })
    .eq("material_id", id);
  if (txnError) throw txnError;

  // An invoice line can reference this component directly, so count the
  // distinct invoices reached through those lines.
  const { data: billedItems, error: billedError } = await supabase
    .from("invoice_items")
    .select("invoice_id")
    .eq("component_id", id);
  if (billedError) throw billedError;

  return {
    documents: 0,
    items: itemCount ?? 0,
    transactions: txnCount ?? 0,
    ghostDocuments: 0,
    invoices: new Set((billedItems ?? []).map((b) => b.invoice_id)).size,
  };
}

/** Best-effort removal of stored challan/external document files. */
async function purgeStoragePaths(paths: (string | null)[]): Promise<void> {
  for (const p of paths) {
    if (p) removeChallan(p).catch(() => {});
  }
}

/**
 * Permanently DELETE a company/party master together with its dependent
 * records — admin only (RLS enforces per table).
 *
 * Sweeps (dependents first, never unrelated companies):
 *   0. invoices billed against this company's challans
 *   1. documents' line items
 *   2. documents (incl. cancelled/archived)
 *   3. transactions (incl. archived — admin DELETE policy allows)
 *   4. component_parties links (also CASCADE at the DB)
 *   5. the company row
 */
export async function deleteCompanyPermanently(id: string): Promise<void> {
  const supabase = createClient();

  const { data: documents, error: docError } = await supabase
    .from("receiving_documents")
    .select("id, external_document_path")
    .eq("company_id", id);
  if (docError) throw docError;

  const { data: txns, error: txnError } = await supabase
    .from("transactions")
    .select("challan_path, external_document_path")
    .eq("company_id", id);
  if (txnError) throw txnError;

  const documentIds = (documents ?? []).map((d) => d.id);
  await purgeStoragePaths([
    ...(documents ?? []).map((d) => d.external_document_path),
    ...(txns ?? []).flatMap((t) => [t.challan_path, t.external_document_path]),
  ]);

  if (documentIds.length > 0) {
    // Before the documents go: an invoiced challan would otherwise be
    // cascade-swept by the DB, silently destroying billing history the admin
    // was never told about.
    await sweepInvoicesForChallans(documentIds);

    const { error } = await supabase
      .from("receiving_document_items")
      .delete()
      .in("document_id", documentIds);
    if (error) throw error;

    const { error: e2 } = await supabase
      .from("receiving_documents")
      .delete()
      .eq("company_id", id);
    if (e2) throw e2;
  }

  const { error: e3 } = await supabase
    .from("transactions")
    .delete()
    .eq("company_id", id);
  if (e3) throw e3;

  const { error: e4 } = await supabase
    .from("component_parties")
    .delete()
    .eq("party_id", id);
  if (e4) throw e4;

  const { error: e5 } = await supabase.from("companies").delete().eq("id", id);
  if (e5) throw e5;
}

/**
 * Permanently DELETE a component master together with its dependent
 * records — admin only (RLS enforces per table).
 *
 * Sweeps (dependents first, never deletes other companies' documents):
 *   0. invoices containing a billed line for this component (removed whole)
 *   1. line items referencing the component
 *   2. transactions for the component
 *   3. component_parties links (also CASCADE at the DB)
 *   4. the component row
 */
export async function deleteComponentPermanently(id: string): Promise<void> {
  const supabase = createClient();

  // Before anything else: an invoice line referencing this component would
  // otherwise be cascade-swept by the DB, leaving its header totals stale.
  await sweepInvoicesForComponent(id);

  const { data: items, error: itemError } = await supabase
    .from("receiving_document_items")
    .select("id")
    .eq("component_id", id);
  if (itemError) throw itemError;

  const { data: txns, error: txnError } = await supabase
    .from("transactions")
    .select("challan_path, external_document_path")
    .eq("material_id", id);
  if (txnError) throw txnError;

  await purgeStoragePaths(
    (txns ?? []).flatMap((t) => [t.challan_path, t.external_document_path])
  );

  if ((items ?? []).length > 0) {
    const { error } = await supabase
      .from("receiving_document_items")
      .delete()
      .eq("component_id", id);
    if (error) throw error;
  }

  const { error: e2 } = await supabase
    .from("transactions")
    .delete()
    .eq("material_id", id);
  if (e2) throw e2;

  const { error: e3 } = await supabase
    .from("component_parties")
    .delete()
    .eq("component_id", id);
  if (e3) throw e3;

  const { error: e4 } = await supabase.from("materials").delete().eq("id", id);
  if (e4) throw e4;
}