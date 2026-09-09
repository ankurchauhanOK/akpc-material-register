import type { Database } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/client";

type Row = Database["public"]["Tables"]["transactions"]["Row"];

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
};

/**
 * Updates an EXISTING transaction row — it never inserts a new one.
 * The transaction `type` is intentionally NOT part of the input: it is
 * immutable once created (enforced in the DB and here in the UI).
 * Preserves entered source values (unit_price / total_amount) and
 * refreshes the party snapshot on edit.
 */
export async function updateTransaction(
  id: string,
  input: UpdateTransactionInput
): Promise<Row> {
  const supabase = createClient();

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
    .eq("id", id)
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

/**
 * Permanent (physical) DELETE of a transaction — admin only (RLS enforces).
 * Used in the TRIAL version. Will be replaced by archiveTransaction()
 * when the software moves to production.
 */
export async function deleteTransactionPermanently(id: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from("transactions")
    .delete()
    .eq("id", id);
  if (error) throw error;
}
