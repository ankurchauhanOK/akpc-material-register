import type { Database } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/client";

type Row = Database["public"]["Tables"]["transactions"]["Row"];
type ReceivingDocRow =
  Database["public"]["Tables"]["receiving_documents"]["Row"];

export type UpdateTransactionInput = {
  materialId: string;
  companyId: string;
  pieces: number;
  totalAmount: number;
  transactionDate: string;
  challanPath: string; // "" when the challan was removed or never present
  unitPrice?: number | null;
  challanNumber?: string | null;
  externalDocumentPath?: string | null;
  partySnapshot?: {
    name?: string | null;
    company?: string | null;
    location?: string | null;
    post?: string | null;
    contact?: string | null;
    pincode?: string | null;
  };
  partyGstin?: string | null;
  partyState?: string | null;
};

export type UpdateTransactionTarget =
  | { source: "transactions"; id: string }
  | { source: "documents"; documentId: string };

/**
 * Updates an EXISTING transaction/document — it never inserts a new one.
 * The transaction `type` is intentionally NOT part of the input: it is
 * immutable once created (enforced in the DB and here in the UI).
 *
 * Legacy rows (`transactions`) are fully editable (material, company,
 * pieces, amount, date, challan). v2 documents (`receiving_documents`)
 * are more locked down by design (RLS): only the HEADER is editable and
 * only by admins — company/destination, date, and the party snapshot.
 * Line items are immutable on purpose (no update policy is granted), so
 * a Tools/Other document NEVER requires picking a component master when
 * its destination/date are corrected.
 */
export async function updateTransaction(
  target: UpdateTransactionTarget,
  input: UpdateTransactionInput
): Promise<Row | ReceivingDocRow> {
  const supabase = createClient();

  if (target.source === "documents") {
    const { data, error } = await supabase
      .from("receiving_documents")
      .update({
        company_id: input.companyId,
        transaction_date: input.transactionDate,
        party_name: input.partySnapshot?.name ?? null,
        party_company: input.partySnapshot?.company ?? null,
        party_location: input.partySnapshot?.location ?? null,
        party_post: input.partySnapshot?.post ?? null,
        party_contact: input.partySnapshot?.contact ?? null,
        party_pincode: input.partySnapshot?.pincode ?? null,
        party_gstin: input.partyGstin ?? null,
        party_state: input.partyState ?? null,
      })
      .eq("id", target.documentId)
      .select("*")
      .single();
    if (error) throw error;
    if (!data) throw new Error("Document not found or update not permitted.");
    return data as ReceivingDocRow;
  }

  const { data, error } = await supabase
    .from("transactions")
    .update({
      material_id: input.materialId,
      company_id: input.companyId,
      pieces: input.pieces,
      unit_price: input.unitPrice ?? null,
      total_amount: input.totalAmount,
      transaction_date: input.transactionDate,
      challan_path: input.challanPath,
      challan_number: input.challanNumber ?? null,
      external_document_path: input.externalDocumentPath ?? null,
      party_name: input.partySnapshot?.name ?? null,
      party_company: input.partySnapshot?.company ?? null,
      party_location: input.partySnapshot?.location ?? null,
      party_post: input.partySnapshot?.post ?? null,
      party_contact: input.partySnapshot?.contact ?? null,
      party_pincode: input.partySnapshot?.pincode ?? null,
    })
    .eq("id", target.id)
    .select("*")
    .single();

  if (error) throw error;
  if (!data) throw new Error("Transaction not found or update not permitted.");
  return data as Row;
}

/**
 * Soft-delete (archive) a transaction — admin only (RLS enforces).
 * No physical row removal. Kept for production mode.
 */
export async function archiveTransaction(id: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from("transactions")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

export type DeleteTransactionTarget =
  | { source: "transactions"; id: string }
  | { source: "documents"; documentId: string };

/**
 * Permanent (physical) DELETE — admin only (RLS enforces per table).
 * Used in the TRIAL version. Will be replaced by archiveTransaction()
 * when the software moves to production.
 *
 * - legacy rows: the `transactions` row itself
 * - v2 document rows: the document header AND all its line items
 *   (items are deleted first — document_id FK has no ON DELETE CASCADE)
 */
export async function deleteTransactionPermanently(
  target: DeleteTransactionTarget
): Promise<void> {
  const supabase = createClient();

  if (target.source === "documents") {
    const { error: itemsError } = await supabase
      .from("receiving_document_items")
      .delete()
      .eq("document_id", target.documentId);
    if (itemsError) throw itemsError;

    const { error } = await supabase
      .from("receiving_documents")
      .delete()
      .eq("id", target.documentId);
    if (error) throw error;
    return;
  }

  const { error } = await supabase
    .from("transactions")
    .delete()
    .eq("id", target.id);
  if (error) throw error;
}
