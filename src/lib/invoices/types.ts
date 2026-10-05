import type {
  Enums,
  Tables,
} from "@/lib/supabase/database.types";

export type InvoiceRow = Tables<"invoices">;
export type InvoiceItemRow = Tables<"invoice_items">;

/** Money math helpers — mirror the server-side invoice_line_calc so the
 *  Review screen always matches what the RPC persists. */
export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function computeLineMoney(
  quantity: number,
  unitPrice: number,
  gstPercent: number
): { subtotal: number; gstAmount: number; lineTotal: number } {
  const subtotal = round2(quantity * unitPrice);
  const gstAmount = round2((subtotal * gstPercent) / 100);
  return { subtotal, gstAmount, lineTotal: round2(subtotal + gstAmount) };
}

/** Which kind of invoice this is. Stored on `invoices.invoice_type` (a `text`
 *  column with a CHECK constraint, not a PG enum -- see migration
 *  20261004000000_direct_invoices.sql).
 *
 *  - "challan" — billed against linked Delivery Challans; items are derived
 *    from the challan and only the rate/GST is editable.
 *  - "direct"  — items typed in by hand, zero `invoice_challans` rows; every
 *    item field is editable.
 *
 *  The two are EXCLUSIVE: a direct invoice can never gain a challan and a
 *  challan invoice can never gain a manual line (enforced in update_invoice). */
export type InvoiceType = "challan" | "direct";

/** Raw wire shape one item must provide to create_invoice / update_invoice
 *  (exact jsonb contract of the RPCs).
 *
 *  `source_document_id` / `source_item_id` are nullable because a Direct
 *  Invoice's items have NO source. Both are non-null on a challan-backed line
 *  and both MUST be null on a manual line — create_invoice rejects a manual
 *  line that carries a source, so a fake link cannot be smuggled in. */
export type InvoiceLinePayload = {
  line_no: number;
  source_document_id: string | null;
  source_item_id: string | null;
  line_type: Enums<"document_line_type">;
  component_id: string | null;
  item_name: string;
  quantity: number;
  unit: Enums<"unit_type">;
  hsn_code: string | null;
  item_remarks: string | null;
  unit_price: number;
  gst_percent: number;
};

/** A candidate invoice line pulled from a source Delivery Challan line. */
export type CandidateLine = {
  sourceItemId: string;
  sourceDocumentId: string;
  lineNo: number;
  lineType: Enums<"document_line_type">;
  componentId: string | null;
  componentName: string | null;
  itemName: string;
  quantity: number;
  unit: Enums<"unit_type">;
  hsnCode: string | null;
  itemRemarks: string | null;
  unitPrice: number;
  gstPercent: number;
};

/** A Delivery Challan eligible for invoicing (all lines = billable). */
export type EligibleChallan = {
  id: string;
  document_number: string;
  transaction_date: string;
  challan_number: string | null;
  company_id: string;
  party_name: string | null;
  party_company: string | null;
  party_location: string | null;
  items: CandidateLine[];
  itemCount: number;
  qtySummary: string;
};

/** Company (AKPC) + party snapshot passed to create_invoice.
 *
 * These keys are the EXACT jsonb contract of the create_invoice /
 * update_invoice RPCs (see 20260927000001 §7) — the DB reads them with
 * `->>`, so a renamed or missing key silently snapshots as NULL. Keep the
 * names in sync with the migration. */
export type PartySnapshot = {
  our: {
    company_name: string | null;
    address: string | null;
    city: string | null;
    state: string | null;
    pincode: string | null;
    gstin: string | null;
    pan: string | null;
    // Printed in the tax invoice header (E-mail) and the bank block.
    email: string | null;
    bank_account_name: string | null;
    bank_account_number: string | null;
    bank_ifsc: string | null;
    bank_branch: string | null;
    // Printed in the tax invoice footer. Snapshotted per invoice so a later
    // edit to Settings never rewrites an already-issued document.
    terms_and_conditions: string | null;
    declaration: string | null;
  };
  party: {
    name: string | null;
    company: string | null;
    location: string | null;
    post: string | null;
    contact: string | null;
    pincode: string | null;
    gstin: string | null;
    state: string | null;
    email: string | null;
  };
};

/** An invoice grouped for the invoices list. `invoice_type` drives the
 *  "Direct" badge — `challanCount` is 0 for a direct invoice, but the badge
 *  reads the stored column so the mode is never inferred from a join. */
export type InvoiceListItem = {
  id: string;
  invoice_number: string;
  invoice_date: string;
  created_at: string;
  invoice_type: InvoiceType;
  subtotal: number;
  gst_total: number;
  total_amount: number;
  party_name: string | null;
  party_company: string | null;
  challanCount: number;
  itemCount: number;
};

/** Full invoice for the detail page (header + challans + items). */
export type InvoiceDetail = InvoiceRow & {
  challans: {
    challanId: string;
    document_number: string;
    transaction_date: string;
    challan_number: string | null;
  }[];
  items: InvoiceItemRow[];
};

export type { Enums };