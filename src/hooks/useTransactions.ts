import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import type {
  Tables,
} from "@/lib/supabase/database.types";
import type { TransactionType, UnitType } from "@/lib/supabase/types";

type Transaction = Tables<"transactions">;
type Material = Tables<"materials">;
type Company = Tables<"companies">;
type DocTxn = Tables<"transactions">;
type ReceivingDocument = Tables<"receiving_documents">;
type ReceivingDocumentItem = Tables<"receiving_document_items">;

/** Transaction enriched with resolved master names + unit for display. */
export type TransactionWithNames = Transaction & {
  material_name: string;
  company_name: string;
  material_unit: UnitType | null;
};

async function fetchLegacy(supabase: ReturnType<typeof createClient>): Promise<TransactionWithNames[]> {
  const { data, error } = await supabase
    .from("transactions")
    .select("*")
    .order("transaction_date", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) throw error;

  return (data ?? []).map((row) => {
    const r = row as DocTxn & {
      materials: { name: string; unit: UnitType | null } | null;
      companies: { name: string } | null;
    };
    return {
      id: r.id,
      transaction_number: r.transaction_number,
      type: r.type,
      material_id: r.material_id,
      company_id: r.company_id,
      pieces: r.pieces,
      unit_price: r.unit_price,
      total_amount: r.total_amount,
      transaction_date: r.transaction_date,
      challan_path: r.challan_path,
      challan_number: r.challan_number,
      external_document_path: r.external_document_path,
      party_name: r.party_name,
      party_company: r.party_company,
      party_location: r.party_location,
      party_post: r.party_post,
      party_contact: r.party_contact,
      party_pincode: r.party_pincode,
      created_by: r.created_by,
      created_at: r.created_at,
      updated_at: r.updated_at,
      deleted_at: r.deleted_at,
      material_name: r.materials?.name ?? "—",
      material_unit: r.materials?.unit ?? null,
      company_name: r.companies?.name ?? "—",
    };
  });
}

/**
 * Fetch the receiving documents (v2 model). If the receiving_document
 * tables are not yet present (migration not applied), this is a
 * migration-period no-op so the ledger readers keep working against the
 * legacy transactions table until the new model is deployed.
 */
async function fetchReceiving(
  supabase: ReturnType<typeof createClient>
): Promise<TransactionWithNames[]> {
  let docs: ReceivingDocument[] = [];
  try {
    const { data, error } = await supabase
      .from("receiving_documents")
      .select("*, receiving_document_items(*)")
      .order("transaction_date", { ascending: false })
      .order("created_at", { ascending: false });
    if (error) throw error;
    docs = (data ?? []) as ReceivingDocument[];
  } catch {
    // Migration-pending: new tables absent; fall back to legacy only.
    return [];
  }

  const rows: TransactionWithNames[] = [];
  for (const doc of docs) {
    // Cancelled / archived documents are not part of the active ledger.
    if (doc.deleted_at) continue;
    if (doc.status === "cancelled") continue;
    const items =
      (doc as ReceivingDocument & {
        receiving_document_items: ReceivingDocumentItem[] | null;
      }).receiving_document_items ?? [];
    for (const item of items) {
      rows.push({
        id: item.id,
        transaction_number: doc.document_number,
        type: doc.type,
        material_id: item.component_id ?? "", // component master when classified
        company_id: doc.company_id,
        pieces: Number(item.quantity),
        unit_price: item.unit_price,
        total_amount: Number(item.line_total),
        transaction_date: doc.transaction_date,
        challan_path: "",
        challan_number: doc.challan_number,
        external_document_path: doc.external_document_path,
        party_name: doc.party_name ?? doc.party_company,
        party_company: doc.party_company ?? doc.party_name,
        party_location: doc.party_location,
        party_post: doc.party_post,
        party_contact: doc.party_contact,
        party_pincode: doc.party_pincode,
        created_by: doc.created_by,
        created_at: doc.created_at,
        updated_at: doc.updated_at,
        deleted_at: doc.deleted_at,
        material_name: item.item_name ?? "—",
        material_unit: item.unit,
        company_name: doc.party_company ?? doc.party_name ?? "—",
      });
    }
  }
  return rows;
}

/**
 * Fetch the active movement ledger (soft-deleted rows excluded by RLS).
 *
 * The ledger is a union of:
 *   - legacy `transactions` rows (Send now + pre-v2 Receive) — single-item
 *   - v2 `receiving_documents` x `receiving_document_items` (new Receive)
 *
 * Every row is shaped as TransactionWithNames, so existing consumers
 * (dashboard KPIs/charts, component dashboard, records) keep working.
 * The `transactions` fetch is a temporary migration-period compatibility
 * source: once Send is migrated to documents, this branch is removed.
 *
 * Stock is NEVER stored — summaries are derived from these rows in the
 * app layer.
 */
export function useTransactions() {
  return useQuery({
    queryKey: ["transactions", "active"],
    queryFn: async (): Promise<TransactionWithNames[]> => {
      const supabase = createClient();
      const legacy = await fetchLegacy(supabase);
      const v2Docs = await fetchReceiving(supabase);
      return [...v2Docs, ...legacy].sort((a, b) => {
        const cmpDate = b.transaction_date.localeCompare(a.transaction_date);
        if (cmpDate !== 0) return cmpDate;
        return b.created_at.localeCompare(a.created_at);
      });
    },
  });
}

export type MovementSummary = {
  received: number;
  given: number;
  net: number;
};

/** Total received/given pieces and net across a set of transactions. */
export function summarizeMovement(
  transactions: TransactionWithNames[]
): MovementSummary {
  let received = 0;
  let given = 0;
  for (const t of transactions) {
    if (t.type === "received") received += t.pieces;
    else if (t.type === "given") given += t.pieces;
  }
  return { received, given, net: received - given };
}

export type MaterialMovement = {
  material_id: string;
  material_name: string;
  net: number;
};

/** Per-material net movement (received − given), derived, grouped by material. */
export function summarizeByMaterial(
  transactions: TransactionWithNames[]
): MaterialMovement[] {
  const map = new Map<string, MaterialMovement>();
  for (const t of transactions) {
    const current = map.get(t.material_id) ?? {
      material_id: t.material_id,
      material_name: t.material_name,
      net: 0,
    };
    if (t.type === "received") current.net += t.pieces;
    else if (t.type === "given") current.net -= t.pieces;
    map.set(t.material_id, current);
  }
  return [...map.values()].sort((a, b) => b.net - a.net);
}

/** All distinct active materials for the Material filter. */
export function useActiveMaterials(): {
  items: Material[];
  refetch: () => void;
} {
  const query = useQuery({
    queryKey: ["materials", "active"],
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("materials")
        .select("*")
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return (data ?? []) as Material[];
    },
  });
  return { items: query.data ?? [], refetch: query.refetch };
}

/** All distinct active companies for the Company filter. */
export function useActiveCompanies(): {
  items: Company[];
  refetch: () => void;
} {
  const query = useQuery({
    queryKey: ["companies", "active"],
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("companies")
        .select("*")
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return (data ?? []) as Company[];
    },
  });
  return { items: query.data ?? [], refetch: query.refetch };
}

export type { Transaction, TransactionType };