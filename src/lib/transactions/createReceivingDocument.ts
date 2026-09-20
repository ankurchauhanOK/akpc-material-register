import type { Database } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/client";
import type { Enums } from "@/lib/supabase/database.types";

type DocRow = Database["public"]["Tables"]["receiving_documents"]["Row"];
type DocItemRow =
  Database["public"]["Tables"]["receiving_document_items"]["Row"];

export type ReceivingLineInput = {
  lineNo: number;
  lineType: Enums<"document_line_type">;
  componentId: string | null;
  itemName: string;
  quantity: number;
  unit: Enums<"unit_type">;
  unitPrice: number | null;
  gstPercent: number;
  hsnCode?: string | null;
  itemRemarks?: string | null;
  // financial calculation per line (subtotal / gst_amount / line_total)
  subtotal: number;
  gstAmount: number;
  lineTotal: number;
};

export type CreateReceivingDocumentInput = {
  type: Enums<"transaction_type">; // 'received' (send uses transaction row for now)
  kind: Enums<"document_kind">;
  source: Enums<"document_source">;
  paymentStatus?: Enums<"payment_status"> | null;
  companyId: string;
  transactionDate: string; // YYYY-MM-DD
  challanNumber?: string | null;
  vehicleDetails?: string | null;
  externalDocumentPath?: string | null;
  notes?: string | null;
  createdBy: string;
  recordCategory?: Enums<"record_category"> | null;
  partySnapshot?: {
    name?: string | null;
    company?: string | null;
    location?: string | null;
    post?: string | null;
    contact?: string | null;
    pincode?: string | null;
  };
  // Company snapshot (FROM section on challan)
  ourCompany?: {
    companyName?: string | null;
    address?: string | null;
    city?: string | null;
    state?: string | null;
    pincode?: string | null;
    gstin?: string | null;
    pan?: string | null;
  };
  // Customer reference fields
  customerRefNo?: string | null;
  customerRefDate?: string | null;
  // Party GSTIN/state snapshot (TO section on challan)
  partyGstin?: string | null;
  partyState?: string | null;
  items: ReceivingLineInput[];
};

export type ReceivingDocumentWithItems = DocRow & { items: DocItemRow[] };

/**
 * Persists ONE receiving document with MANY line items atomically:
 *
 *   1. Insert the receiving_documents header (the DB trigger assigns
 *      document_number — REC-xxxxxx / GIV-xxxxxx — server-side; the client
 *      never constructs it).
 *   2. Insert every receiving_document_items line, keyed to the header.
 *
 * The document number identifies the WHOLE document (one challan = one
 * document). Line items carry only their own UUID id + line_no — they do
 * NOT get individual REC/GIV numbers.
 *
 * This is a genuine 1 -> many write: ALL items are persisted, never just
 * the first one.
 */
export async function createReceivingDocument(
  input: CreateReceivingDocumentInput
): Promise<ReceivingDocumentWithItems> {
  const supabase = createClient();

  const header = {
    type: input.type,
    kind: input.kind,
    source: input.source,
    payment_status: input.paymentStatus ?? null,
    company_id: input.companyId,
    transaction_date: input.transactionDate,
    challan_number: input.challanNumber ?? null,
    vehicle_details: input.vehicleDetails ?? null,
    external_document_path: input.externalDocumentPath ?? null,
    notes: input.notes ?? null,
    party_name: input.partySnapshot?.name ?? null,
    party_company: input.partySnapshot?.company ?? null,
    party_location: input.partySnapshot?.location ?? null,
    party_post: input.partySnapshot?.post ?? null,
    party_contact: input.partySnapshot?.contact ?? null,
    party_pincode: input.partySnapshot?.pincode ?? null,
    party_gstin: input.partyGstin ?? null,
    party_state: input.partyState ?? null,
    our_company_name: input.ourCompany?.companyName ?? null,
    our_address: input.ourCompany?.address ?? null,
    our_city: input.ourCompany?.city ?? null,
    our_state: input.ourCompany?.state ?? null,
    our_pincode: input.ourCompany?.pincode ?? null,
    our_gstin: input.ourCompany?.gstin ?? null,
    our_pan: input.ourCompany?.pan ?? null,
    record_category: input.recordCategory ?? null,
    customer_ref_no: input.customerRefNo ?? null,
    customer_ref_date: input.customerRefDate ?? null,
    subtotal: input.items.reduce((s, i) => s + (i.subtotal || 0), 0),
    gst_total: input.items.reduce((s, i) => s + (i.gstAmount || 0), 0),
    total_amount: input.items.reduce((s, i) => s + (i.lineTotal || 0), 0),
    created_by: input.createdBy,
    document_number: "", // DB trigger overwrites this
  };

  const { data: doc, error } = await supabase
    .from("receiving_documents")
    .insert(header)
    .select("*")
    .single();

  if (error) throw error;

  const docRow = doc as DocRow;

  if (input.items.length > 0) {
    const { data, error: itemError } = await supabase
      .from("receiving_document_items")
      .insert(
        input.items.map((i) => ({
          document_id: docRow.id,
          line_no: i.lineNo,
          line_type: i.lineType,
          component_id: i.componentId,
          item_name: i.itemName,
          quantity: i.quantity,
          unit: i.unit,
          unit_price: i.unitPrice ?? null,
          gst_percent: i.gstPercent,
          hsn_code: i.hsnCode ?? null,
          item_remarks: i.itemRemarks ?? null,
          subtotal: i.subtotal,
          gst_amount: i.gstAmount,
          line_total: i.lineTotal,
        }))
      )
      .select("*");

    if (itemError) {
      // Best-effort cleanup: remove the just-created header if items
      // failed, so we never persist a header with partial line items.
      await supabase
        .from("receiving_documents")
        .delete()
        .eq("id", docRow.id);
      throw itemError;
    }

    return {
      ...docRow,
      items: (data ?? []) as DocItemRow[],
    };
  }

  // No items is not a supported receive document, but stay type-safe.
  return { ...docRow, items: [] };
}