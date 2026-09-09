import { createClient } from "@/lib/supabase/client";

/**
 * Trial-mode permanent deletes for master records.
 *
 * These are intentionally separate, clearly-named functions so the
 * production switch later is trivial: swap
 *   deleteComponentPermanently() -> archiveComponent()
 *   deleteCompanyPermanently()   -> archiveCompany()
 * (soft-delete via deleted_at) without touching the UI wiring.
 *
 * RLS enforces admin-only for every DELETE (migration 0004).
 */

/**
 * Count live records that reference a component (materials) master.
 * Archived/hidden rows (deleted_at set) are excluded by the transactions
 * SELECT policy; FK RESTRICT still guards physical rows as a backstop.
 */
export async function getComponentUsageCount(id: string): Promise<number> {
  const supabase = createClient();

  const { count: txnCount, error: txnError } = await supabase
    .from("transactions")
    .select("id", { count: "exact", head: true })
    .eq("material_id", id);
  if (txnError) throw txnError;

  const { count: itemCount, error: itemError } = await supabase
    .from("receiving_document_items")
    .select("id", { count: "exact", head: true })
    .eq("component_id", id);
  if (itemError) throw itemError;

  return (txnCount ?? 0) + (itemCount ?? 0);
}

/**
 * Count live records that reference a company (party) master.
 * Same archived-row caveat as getComponentUsageCount.
 */
export async function getCompanyUsageCount(id: string): Promise<number> {
  const supabase = createClient();

  const { count: txnCount, error: txnError } = await supabase
    .from("transactions")
    .select("id", { count: "exact", head: true })
    .eq("company_id", id);
  if (txnError) throw txnError;

  const { count: docCount, error: docError } = await supabase
    .from("receiving_documents")
    .select("id", { count: "exact", head: true })
    .eq("company_id", id);
  if (docError) throw docError;

  return (txnCount ?? 0) + (docCount ?? 0);
}

/**
 * Permanently DELETE a component master — admin only (RLS enforces).
 */
export async function deleteComponentPermanently(id: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from("materials").delete().eq("id", id);
  if (error) throw error;
}

/**
 * Permanently DELETE a company/party master — admin only (RLS enforces).
 */
export async function deleteCompanyPermanently(id: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from("companies").delete().eq("id", id);
  if (error) throw error;
}