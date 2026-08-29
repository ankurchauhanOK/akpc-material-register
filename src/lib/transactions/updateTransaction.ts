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
};

/**
 * Updates an EXISTING transaction row — it never inserts a new one.
 * The transaction `type` is intentionally NOT part of the input: it is
 * immutable once created (enforced in the DB and here in the UI).
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
      total_amount: input.totalAmount,
      transaction_date: input.transactionDate,
      challan_path: input.challanPath,
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
 * No physical row removal.
 */
export async function archiveTransaction(id: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from("transactions")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}
