import type { Database } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/client";
import type { Enums } from "@/lib/supabase/database.types";

type Row = Database["public"]["Tables"]["transactions"]["Row"];

export type CreateTransactionInput = {
  type: Enums<"transaction_type">; // 'received' | 'given'
  materialId: string;
  companyId: string;
  pieces: number;
  totalAmount: number;
  transactionDate: string; // YYYY-MM-DD
  challanPath: string; // storage path from a successful upload (legacy / external)
  createdBy: string; // auth user id
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
 * Creates a transaction row. The DB trigger ALWAYS generates the
 * transaction_number (REC-xxxxxx / GIV-xxxxxx) server-side — the client
 * supplies an empty string and the returned row carries the real number.
 * The frontend NEVER constructs the REC number.
 *
 * Preserves entered source values: unit_price and total_amount are stored
 * exactly as provided (never calculated/overwritten). Party details are
 * captured as a snapshot at write time for historical accuracy.
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
      created_by: input.createdBy,
      transaction_number: "", // DB trigger overwrites this
    })
    .select("*")
    .single();

  if (error) throw error;
  return data as Row;
}
