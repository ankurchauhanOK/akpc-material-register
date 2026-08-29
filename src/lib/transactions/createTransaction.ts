import type { Database } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/client";
import type { Enums } from "@/lib/supabase/database.types";

type Row = Database["public"]["Tables"]["transactions"]["Row"];

export type CreateTransactionInput = {
  type: Enums<"transaction_type">; // 'received' for this phase
  materialId: string;
  companyId: string;
  pieces: number;
  totalAmount: number;
  transactionDate: string; // YYYY-MM-DD
  challanPath: string; // storage path from a successful upload
  createdBy: string; // auth user id
};

/**
 * Creates a transaction row. The DB trigger ALWAYS generates the
 * transaction_number (REC-xxxxxx / GIV-xxxxxx) server-side — the client
 * supplies an empty string and the returned row carries the real number.
 * The frontend NEVER constructs the REC number.
 */
export async function createTransaction(
  input: CreateTransactionInput
): Promise<Row> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from("transactions")
    .insert({
      type: input.type,
      material_id: input.materialId,
      company_id: input.companyId,
      pieces: input.pieces,
      total_amount: input.totalAmount,
      transaction_date: input.transactionDate,
      challan_path: input.challanPath,
      created_by: input.createdBy,
      transaction_number: "", // DB trigger overwrites this
    })
    .select("*")
    .single();

  if (error) throw error;
  return data as Row;
}
