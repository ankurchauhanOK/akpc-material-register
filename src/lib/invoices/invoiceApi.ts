import { createClient } from "@/lib/supabase/client";
import type { Tables } from "@/lib/supabase/database.types";
import { formatQty, UNIT_SHORT } from "@/lib/challan/challan-view";
import type {
  CandidateLine,
  EligibleChallan,
  Enums,
  InvoiceDetail,
  InvoiceLinePayload,
  InvoiceListItem,
  PartySnapshot,
} from "@/lib/invoices/types";

type ReceivingDocRow = Tables<"receiving_documents">;
type ReceivingItemRow = Tables<"receiving_document_items">;
type CompanySettingsRow = Tables<"company_settings">;
type CompanyRow = Tables<"companies">;

export type CreateInvoiceInput = {
  companyId: string;
  invoiceDate: string; // YYYY-MM-DD
  notes?: string | null;
  customerRefNo?: string | null;
  customerRefDate?: string | null;
  /** Delivery Challan ids this invoice bills.
   *  - challan-backed: 1+ ids, every line carries a matching source.
   *  - Direct Invoice:  EMPTY (or null) and every line has a null source.
   *
   *  The RPC reads "empty" as `coalesce(array_length(p_challans,1),0) = 0`, so
   *  an absent array and an empty one are the same request. We always send an
   *  array (possibly empty) so the PostgREST arg is never a missing key. */
  challans: string[];
  lines: InvoiceLinePayload[];
};

/**
 * Persists ONE invoice atomically through the security-definer RPC.
 * The RPC validates roles, challenges both challan-eligibility and the
 * one-invoice-per-challan rule, snapshots OUR/PARTY identity, assigns the
 * INV/YYYY-YY/NNN number, and computes server-authoritative totals.
 * Returns the assigned invoice number (used for the redirect).
 *
 * Direct Invoices go through the SAME call with `challans: []` — one RPC, one
 * atomic write, so there is no second persistence path to keep in sync.
 */
export async function createInvoiceApi(
  input: CreateInvoiceInput
): Promise<string> {
  const supabase = createClient();

  const partyData = await fetchPartySnapshot(input.companyId);

  const { data, error } = await supabase.rpc("create_invoice", {
    p_company_id: input.companyId,
    p_invoice_date: input.invoiceDate,
    p_our: partyData.our,
    p_party: partyData.party,
    p_lines: input.lines,
    p_challans: input.challans,
    ...(input.notes ? { p_notes: input.notes } : {}),
    ...(input.customerRefNo ? { p_customer_ref_no: input.customerRefNo } : {}),
    ...(input.customerRefDate
      ? { p_customer_ref_date: input.customerRefDate }
      : {}),
  });

  if (error) throw error;
  return (data ?? "").toString();
}

export type UpdateInvoiceInput = {
  invoiceId: string;
  removeChallans: string[];
  addChallans: string[];
  addLines: InvoiceLinePayload[];
  /** Existing invoice lines whose rate/GST the user edited in this session. */
  keptLines: KeptLineEdit[];
  /** invoice_items.id values to delete. DIRECT INVOICES ONLY — a manual line
   *  has no challan, so this is the only way to remove one. The RPC rejects it
   *  on a challan-backed invoice (those lines go with their challan). */
  removeLineIds: string[];
};

export type KeptLineEdit = {
  id: string; // invoice_items.id
  /** null on a Direct Invoice's manual lines. */
  source_document_id: string | null;
  quantity: number;
  unit_price: number;
  gst_percent: number;
  /** Direct Invoice only — the RPC ignores these on a challan-backed invoice,
   *  where qty / description / HSN stay the challan's snapshot. */
  item_name?: string;
  hsn_code?: string | null;
  item_remarks?: string | null;
  unit?: Enums<"unit_type">;
};

/** Atomic edit — add/remove challans, edit rates. Returns the invoice id.
 *
 *  Direct Invoices use the same RPC with removeChallans / addChallans empty
 *  and removeLineIds populated. The RPC branches on the stored
 *  `invoices.invoice_type`, so the modes cannot be mixed in one call. */
export async function updateInvoiceApi(
  input: UpdateInvoiceInput
): Promise<string> {
  const supabase = createClient();

  // Empty edit groups are OMITTED, not sent as null / empty: the RPC treats an
  // absent key and NULL identically (it null-checks each array itself).
  const { data, error } = await supabase.rpc("update_invoice", {
    p_invoice_id: input.invoiceId,
    ...(input.removeChallans.length
      ? { p_remove_challans: input.removeChallans }
      : {}),
    ...(input.addChallans.length
      ? { p_add_challans: input.addChallans }
      : {}),
    ...(input.addLines.length ? { p_add_lines: input.addLines } : {}),
    ...(input.keptLines.length ? { p_kept_lines: input.keptLines } : {}),
    ...(input.removeLineIds.length
      ? { p_remove_line_ids: input.removeLineIds }
      : {}),
  });

  if (error) throw error;
  return (data ?? "").toString();
}

/** Permanent admin-only delete (releases the challans, number not reused). */
export async function deleteInvoiceApi(invoiceId: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.rpc("delete_invoice", {
    p_invoice_id: invoiceId,
  });
  if (error) throw error;
}

/**
 * Fetch the AKPC identity (company_settings) and the party (companies)
 * so the invoice gets the same kind of historical snapshot as a challan.
 */
export async function fetchPartySnapshot(
  companyId: string
): Promise<PartySnapshot> {
  const supabase = createClient();

  const { data: settings, error: settingsError } = await supabase
    .from("company_settings")
    .select("*")
    .limit(1)
    .maybeSingle();
  if (settingsError) throw settingsError;

  const { data: company, error: companyError } = await supabase
    .from("companies")
    .select("*")
    .eq("id", companyId)
    .single();
  if (companyError) throw companyError;

  const cs = (settings ?? null) as CompanySettingsRow | null;
  const c = company as CompanyRow;

  const address = [cs?.address_line1, cs?.address_line2]
    .filter(Boolean)
    .join(", ");

  return {
    our: {
      company_name: cs?.company_name ?? null,
      address: address || null,
      city: cs?.city ?? null,
      state: cs?.state ?? null,
      pincode: cs?.pincode ?? null,
      gstin: cs?.gstin ?? null,
      pan: cs?.pan ?? null,
      // Printed on the tax invoice header (E-mail) and in the bank block.
      email: cs?.email ?? null,
      bank_account_name: cs?.bank_account_name ?? null,
      bank_account_number: cs?.bank_account_number ?? null,
      bank_ifsc: cs?.bank_ifsc ?? null,
      bank_branch: cs?.bank_branch ?? null,
      // Snapshotted so editing Settings later never rewrites an issued
      // invoice's printed terms / declaration.
      terms_and_conditions: cs?.terms_and_conditions ?? null,
      declaration: cs?.declaration ?? null,
    },
    party: {
      name: c.name ?? null,
      company: c.name ?? null,
      location: c.location ?? null,
      post: c.post ?? null,
      contact: c.contact ?? null,
      pincode: c.pincode ?? null,
      gstin: c.gstin ?? null,
      state: c.state ?? null,
      email: c.email ?? null,
    },
  };
}

/**
 * All Send (given) challans eligible for a NEW invoice on this component:
 *   type='given' AND status='completed' AND not deleted
 *   AND contains the selected Component Master
 *   AND not already tied to any invoice (one-active-invoice-per-challan).
 *
 * A challan is billed as a WHOLE — its full item set (including any other
 * components on the same challan) comes along as candidate lines.
 */
export async function fetchEligibleChallans(
  componentId: string
): Promise<EligibleChallan[]> {
  const supabase = createClient();

  const [docsRes, invoicedRes, materialsRes] = await Promise.all([
    supabase
      .from("receiving_documents")
      .select(
        "id, document_number, transaction_date, company_id, party_name, party_company, party_location, challan_number, customer_ref_no, receiving_document_items(id, line_no, line_type, component_id, item_name, quantity, unit, hsn_code, item_remarks, unit_price, gst_percent)"
      )
      .eq("type", "given")
      .eq("status", "completed")
      .is("deleted_at", null)
      .order("transaction_date", { ascending: false }),
    supabase.from("invoice_challans").select("challan_id"),
    supabase
      .from("materials")
      .select("id, name, default_price")
      .eq("is_active", true),
  ]);

  if (docsRes.error) throw docsRes.error;
  if (invoicedRes.error) throw invoicedRes.error;
  if (materialsRes.error) throw materialsRes.error;

  const invoiced = new Set(
    ((invoicedRes.data ?? []) as { challan_id: string }[]).map(
      (r) => r.challan_id
    )
  );
  const priceMap = new Map<string, number | null>(
    ((materialsRes.data ?? []) as { id: string; default_price: number | null }[]).map(
      (m) => [m.id, m.default_price]
    )
  );
  const nameMap = new Map<string, string>(
    ((materialsRes.data ?? []) as { id: string; name: string }[]).map((m) => [
      m.id,
      m.name,
    ])
  );

  const docs = (docsRes.data ?? []) as Array<
    ReceivingDocRow & {
      receiving_document_items: ReceivingItemRow[] | null;
    }
  >;

  const result: EligibleChallan[] = [];
  for (const doc of docs) {
    if (invoiced.has(doc.id)) continue;
    const items = doc.receiving_document_items ?? [];
    if (!items.some((i) => i.component_id === componentId)) continue;

    const candidates: CandidateLine[] = items
      .slice()
      .sort((a, b) => a.line_no - b.line_no)
      .map((i) => {
        const basePrice =
          i.component_id != null ? priceMap.get(i.component_id) : undefined;
        const unitPrice =
          basePrice !== undefined && basePrice != null
            ? basePrice
            : (i.unit_price ?? 0);
        return {
          sourceItemId: i.id,
          sourceDocumentId: doc.id,
          lineNo: i.line_no,
          lineType: i.line_type,
          componentId: i.component_id,
          componentName: i.component_id ? (nameMap.get(i.component_id) ?? null) : null,
          itemName: i.item_name,
          quantity: Number(i.quantity),
          unit: i.unit,
          hsnCode: i.hsn_code,
          itemRemarks: i.item_remarks,
          unitPrice: Number(unitPrice),
          gstPercent: Number(i.gst_percent ?? 0),
        };
      });

    const unitSum = new Map<string, { label: string; qty: number }>();
    for (const it of candidates) {
      const cur = unitSum.get(it.unit) ?? {
        label: UNIT_SHORT[it.unit] ?? it.unit,
        qty: 0,
      };
      cur.qty += it.quantity;
      unitSum.set(it.unit, cur);
    }
    const qtySummary = [...unitSum.values()]
      .sort((a, b) => b.qty - a.qty)
      .map((u) => `${formatQty(u.qty)} ${u.label}`)
      .join(" · ");

    result.push({
      id: doc.id,
      document_number: doc.document_number,
      transaction_date: doc.transaction_date,
      challan_number: doc.challan_number,
      company_id: doc.company_id,
      party_name: doc.party_name,
      party_company: doc.party_company,
      party_location: doc.party_location,
      items: candidates,
      itemCount: candidates.length,
      qtySummary,
    });
  }

  return result;
}

/** Invoices for the list page (header + aggregated counts). */
export async function fetchInvoices(): Promise<InvoiceListItem[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("invoices")
    .select(
      "*, invoice_challans(challan_id), invoice_items(id)"
    )
    .order("invoice_date", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) throw error;

  return ((data ?? []) as Array<
    Tables<"invoices"> & {
      invoice_challans: { challan_id: string }[] | null;
      invoice_items: { id: string }[] | null;
    }
  >).map((inv) => ({
    id: inv.id,
    invoice_number: inv.invoice_number,
    invoice_date: inv.invoice_date,
    created_at: inv.created_at,
    // Stored column, NOT inferred from challanCount: the mode is a fact about
    // the invoice, and inferring it would let a challan invoice that lost all
    // its links silently masquerade as a Direct Invoice.
    invoice_type: (inv.invoice_type ?? "challan") as InvoiceListItem["invoice_type"],
    subtotal: inv.subtotal,
    gst_total: inv.gst_total,
    total_amount: inv.total_amount,
    party_name: inv.party_name,
    party_company: inv.party_company,
    challanCount: inv.invoice_challans?.length ?? 0,
    itemCount: inv.invoice_items?.length ?? 0,
  }));
}

/** Full detail of one invoice by number (header + challans + items). */
export async function fetchInvoiceByNumber(
  invoiceNumber: string
): Promise<InvoiceDetail | null> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("invoices")
    .select(
      "*, invoice_challans(receiving_documents(id, document_number, transaction_date, challan_number, customer_ref_no)), invoice_items(*)"
    )
    .eq("invoice_number", invoiceNumber)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  const row = data as unknown as Tables<"invoices"> & {
    invoice_challans: Array<{
      receiving_documents: {
        id: string;
        document_number: string;
        transaction_date: string;
        challan_number: string | null;
      } | null;
    }> | null;
    invoice_items: Tables<"invoice_items">[] | null;
  };

  return {
    ...row,
    challans: (row.invoice_challans ?? [])
      .map((c) => c.receiving_documents)
      .filter((c): c is NonNullable<typeof c> => c != null)
      .map((c) => ({
        challanId: c.id,
        document_number: c.document_number,
        transaction_date: c.transaction_date,
        challan_number: c.challan_number,
      })),
    items: (row.invoice_items ?? []).slice().sort((a, b) => a.line_no - b.line_no),
  };
}