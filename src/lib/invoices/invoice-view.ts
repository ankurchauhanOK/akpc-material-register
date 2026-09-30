import { formatDate, formatINR } from "@/lib/format";
import { formatQty, UNIT_SHORT } from "@/lib/challan/challan-view";
import { amountInWords } from "@/lib/invoices/amount-in-words";
import type { InvoiceDetail } from "@/lib/invoices/types";

// ---------------------------------------------------------------------------
// Shared AKPC tax-invoice view model + geometry.
//
// The on-screen A4 (invoice-preview.tsx) and the downloaded A4 PDF
// (invoice-pdf.tsx) both render from this single builder, so the printed
// document can never drift between the two — the same guarantee
// challan-view.ts gives the delivery challan.
//
// Geometry values are the on-screen preview's CSS pixel measurements scaled by
// 0.75 (72/96) so the PDF is proportional to the approved preview. The preview
// is the visual reference.
//
// Money is NOT recomputed here. Subtotal / CGST / SGST / Total come from the
// server-authoritative columns written by invoice_recalc_totals(); this module
// only formats them and derives the presentation-only extras (the per-HSN tax
// summary, the words line, and the Rounding row).
// ---------------------------------------------------------------------------

export const INVOICE_GEOMETRY = {
  // A4 in points
  pageWidth: 595.28,
  pageHeight: 841.89,
  padding: 28,

  // 1 CSS px border at 96dpi = 0.75 pt
  border: 0.75,

  // Tailwind zinc palette (preview colors)
  colorRule: "#d4d4d8", // zinc-300
  colorTable: "#a1a1aa", // zinc-400
  bgHeader: "#f4f4f5", // zinc-100
  textTitle: "#18181b", // zinc-900
  textAddress: "#3f3f46", // zinc-700
  textBody: "#52525b", // zinc-600
  textHeader: "#52525b", // zinc-600 (table header text)
  textMuted: "#71717a", // zinc-500

  // Main item table (pt) — sums to 539.28 = 595.28 - 2*28
  // Sl. No. | Description of Goods or Service | HSN | Unit | Qty | Rate | Amount
  colSno: 30,
  colDesc: 186.28,
  colHsn: 62,
  colUnit: 48,
  colQty: 68,
  colRate: 68,
  colAmount: 77,
  rowHeader: 26,
  rowData: 24,
  rowEmpty: 20,

  // HSN tax summary (pt) — sums to 539.28
  // HSN/SAC | Taxable Value | CGST Rate | CGST Amount | SGST Rate | SGST Amount | Total Tax
  colSumHsn: 70,
  colSumTaxable: 100,
  colSumRate: 60,
  colSumTax: 85,
  colSumTotal: 79.28,
  rowSum: 22,

  // Type scale (preview px -> pt)
  fontBrand: 15, // text-xl  (20px)
  fontTitle: 13.5, // text-lg  (18px)
  fontName: 11.5, // base     (16px)
  fontBody: 10, // text-sm  (14px)
  fontSmall: 8.5, // text-xs  (12px)
  fontTiny: 7.5, // text-[11px]
} as const;

/** One line of the main item table. */
export type InvoiceItemRow = {
  sno: number;
  description: string;
  hsn: string;
  unit: string;
  qty: string;
  rate: string;
  amount: string;
};

/** One taxable-value + tax band of the HSN tax summary. */
export type HsnSummaryRow = {
  key: string;
  hsn: string;
  taxableValue: string;
  cgstRate: string;
  cgstAmount: string;
  sgstRate: string;
  sgstAmount: string;
  totalTax: string;
};

export type InvoicePartyBlock = {
  heading: string;
  name: string;
  lines: string[];
  gstin: string | null;
  contact: string | null;
  email: string | null;
};

export type InvoiceView = {
  documentTitle: "Tax Invoice";

  // Header: three columns (GSTIN/Bill meta | title | e-mail)
  ourGstin: string;
  meta: { label: string; value: string }[];
  ourEmail: string | null;

  // Company bar under the header
  brandName: string;
  brandAddress: string;

  // Side-by-side consignee blocks (same customer, two visual blocks)
  billedTo: InvoicePartyBlock;
  deliveryTo: InvoicePartyBlock;

  // Item table
  rows: InvoiceItemRow[];
  emptyRows: number;

  // Totals block
  subtotal: string;
  cgst: string;
  sgst: string;
  rounding: string;
  roundingNote: string | null;
  total: string;
  amountInWords: string;

  // HSN tax summary
  hsnRows: HsnSummaryRow[];
  hsnTotals: {
    taxableValue: string;
    cgstAmount: string;
    sgstAmount: string;
    totalTax: string;
  };
  hsnEmptyRows: number;

  // Footer
  terms: string[];
  declaration: string | null;
  bank: { label: string; value: string }[];
  signatureFor: string;
  signatureLabel: string;
  signatureSub: string;
};

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * Split a tax total into CGST / SGST the same way the database does:
 * CGST is half, rounded; SGST is the RESIDUAL so the pair always sums back to
 * the original total. Used per HSN band so the printed summary adds up even
 * when a band's tax carries an odd paise.
 */
function splitTax(tax: number): { cgst: number; sgst: number } {
  const cgst = round2(tax / 2);
  return { cgst, sgst: round2(tax - cgst) };
}

/** GST is intra-state, so the headline rate splits evenly too. */
function splitRate(rate: number): { cgst: number; sgst: number } {
  const cgst = round2(rate / 2);
  return { cgst, sgst: round2(rate - cgst) };
}

function partyLines(inv: InvoiceDetail): string[] {
  return [
    [inv.party_location, inv.party_post].filter(Boolean).join(", "),
    inv.party_pincode
      ? [inv.party_state, inv.party_pincode].filter(Boolean).join(" ")
      : (inv.party_state ?? ""),
  ].filter((x) => Boolean(x));
}

/** Split the stored terms blob into numbered bullet lines.
 *
 * The seeded blob starts with a "Term & Condition" section heading followed by
 * numbered lines. Both the preview and the PDF render their own heading, so
 * that first line is dropped here — otherwise it would print as a bogus
 * numbered item. The heading is only stripped when the rest of the blob really
 * is a numbered list, so a free-text terms value still prints in full. */
function termsLines(terms: string | null): string[] {
  if (!terms) return [];
  const lines = terms
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  const isNumbered = (l: string) => /^\d+[.)]\s/.test(l);
  if (!lines.some(isNumbered)) return lines;
  const firstNumbered = lines.findIndex(isNumbered);
  return lines.slice(firstNumbered);
}

export function buildInvoiceView(inv: InvoiceDetail): InvoiceView {
  const subtotal = Number(inv.subtotal);
  const cgst = Number(inv.cgst_total);
  const sgst = Number(inv.sgst_total);
  const total = Number(inv.total_amount);

  // The printed Total must equal the stored total EXACTLY, so whatever is left
  // over after subtotal + CGST + SGST is shown in the Rounding row instead of
  // being silently dropped. Normally 0.00 — the server rounds subtotal, tax and
  // line total independently, so this absorbs the occasional sub-paise drift.
  // This is NOT rupee rounding: paise are always kept and shown.
  const rounding = round2(total - (subtotal + cgst + sgst));
  const roundingNote =
    rounding === 0
      ? null
      : "Sub-paise rounding adjustment";

  // ---- item table ----
  const rows: InvoiceItemRow[] = inv.items.map((it, i) => ({
    sno: i + 1,
    description: it.item_name || "—",
    hsn: it.hsn_code || "—",
    unit: UNIT_SHORT[it.unit] ?? it.unit,
    qty: formatQty(it.quantity),
    rate: formatINR(it.unit_price),
    amount: formatINR(it.subtotal),
  }));

  // ---- HSN tax summary, grouped by (HSN code, GST rate) ----
  interface Band {
    key: string;
    hsn: string;
    rate: number;
    taxable: number;
    tax: number;
  }
  const bands = new Map<string, Band>();
  for (const it of inv.items) {
    const hsn = it.hsn_code || "—";
    const rate = Number(it.gst_percent);
    const key = `${hsn}|${rate}`;
    const band = bands.get(key) ?? { key, hsn, rate, taxable: 0, tax: 0 };
    band.taxable += Number(it.subtotal);
    band.tax += Number(it.gst_amount);
    bands.set(key, band);
  }

  const ordered = [...bands.values()].sort(
    (a, b) => a.hsn.localeCompare(b.hsn) || a.rate - b.rate
  );

  const hsnRows: HsnSummaryRow[] = ordered.map((b) => {
    const { cgst: bCgst, sgst: bSgst } = splitTax(b.tax);
    const { cgst: cRate, sgst: sRate } = splitRate(b.rate);
    return {
      key: b.key,
      hsn: b.hsn,
      taxableValue: formatINR(round2(b.taxable)),
      cgstRate: `${cRate}%`,
      cgstAmount: formatINR(bCgst),
      sgstRate: `${sRate}%`,
      sgstAmount: formatINR(bSgst),
      totalTax: formatINR(round2(b.tax)),
    };
  });

  // Summary footer reuses the stored header split, so the printed summary ties
  // to the printed totals rather than to a re-derived figure.
  const hsnTotals = {
    taxableValue: formatINR(round2(ordered.reduce((s, b) => s + b.taxable, 0))),
    cgstAmount: formatINR(cgst),
    sgstAmount: formatINR(sgst),
    totalTax: formatINR(round2(ordered.reduce((s, b) => s + b.tax, 0))),
  };

  const party = {
    name: inv.party_company || inv.party_name || "—",
    lines: partyLines(inv),
    gstin: inv.party_gstin,
    contact: inv.party_contact,
    email: inv.party_email,
  };

  return {
    documentTitle: "Tax Invoice",

    ourGstin: inv.our_gstin ?? "—",
    meta: [
      { label: "Bill No.", value: inv.invoice_number },
      { label: "Bill Date", value: formatDate(inv.invoice_date) },
      { label: "Customer Ref.", value: inv.customer_ref_no ?? "—" },
    ],
    ourEmail: inv.our_email,

    brandName: inv.our_company_name || "AK Precision Components",
    brandAddress: [
      [inv.our_address, inv.our_city].filter(Boolean).join(", "),
      [inv.our_state, inv.our_pincode].filter(Boolean).join(" "),
    ]
      .filter(Boolean)
      .join(", "),

    // Two visual blocks, one customer — AKPC does not ship to a separate
    // address, so DELIVERY ADDRESS mirrors the BILLED TO snapshot.
    billedTo: { heading: "Name & Address of Consignee Billed To", ...party },
    deliveryTo: { heading: "Delivery Address", ...party },

    rows,
    emptyRows: Math.max(0, 6 - rows.length),

    subtotal: formatINR(subtotal),
    cgst: formatINR(cgst),
    sgst: formatINR(sgst),
    rounding: formatINR(rounding),
    roundingNote,
    total: formatINR(total),
    amountInWords: amountInWords(total),

    hsnRows,
    hsnTotals,
    hsnEmptyRows: Math.max(0, 3 - hsnRows.length),

    terms: termsLines(inv.terms_and_conditions),
    declaration: inv.declaration,
    bank: [
      { label: "Account", value: inv.bank_account_name },
      { label: "A/C No.", value: inv.bank_account_number },
      { label: "IFSC", value: inv.bank_ifsc },
      { label: "Branch", value: inv.bank_branch },
    ].filter((b) => Boolean(b.value)) as { label: string; value: string }[],

    signatureFor: inv.our_company_name || "AK Precision Components",
    signatureLabel: "Authorized Signatory",
    signatureSub: "Proprietor",
  };
}
