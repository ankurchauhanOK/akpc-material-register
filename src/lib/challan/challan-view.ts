import { formatDate } from "@/lib/format";

// ---------------------------------------------------------------------------
// Shared challan view model + geometry.
//
// Both the on-screen preview (challan-preview.tsx) and the downloaded A4 PDF
// (challan-pdf.tsx) derive everything from this single builder, so the data
// and layout tokens can never drift apart again. The preview is the approved
// visual reference; geometry values below are that preview's CSS pixel
// measurements scaled by 0.75 (72/96) to PDF points so the A4 output mirrors
// the on-screen challan proportionally.
// ---------------------------------------------------------------------------

export const UNIT_SHORT: Record<string, string> = {
  pieces: "Nos",
  kg: "Kg",
  meter: "Mtr",
  litre: "Ltr",
  set: "Set",
};

export function formatQty(value: number | string): string {
  return new Intl.NumberFormat("en-IN").format(Number(value));
}

export const CHALLAN_GEOMETRY = {
  // A4 in points
  pageWidth: 595.28,
  pageHeight: 841.89,
  padding: 30,

  // 1 CSS px border at 96dpi = 0.75 pt
  border: 0.75,

  // Tailwind zinc palette (preview colors)
  colorRule: "#d4d4d8", // zinc-300
  colorBox: "#d4d4d8", // zinc-300
  colorTable: "#a1a1aa", // zinc-400
  bgHeader: "#f4f4f5", // zinc-100
  textTitle: "#18181b", // zinc-900
  textAddress: "#3f3f46", // zinc-700
  textBody: "#52525b", // zinc-600
  textHeader: "#52525b", // zinc-600 (table header text)
  textMuted: "#71717a", // zinc-500

  // Table geometry (pt) — sums to 535 = 595.28 - 2*30
  colSno: 30,
  colHsn: 60,
  colMoq: 60,
  colUnit: 48,
  colDesc: 202,
  colRem: 135,
  rowHeader: 24,
  rowData: 27,
  rowEmpty: 21,

  // Type scale (preview px -> pt)
  fontBrand: 15, // text-xl  (20px)
  fontTitle: 13.5, // text-lg  (18px)
  fontName: 12, // base     (16px)
  fontBody: 10.5, // text-sm  (14px)
  fontSmall: 9, // text-xs  (12px)
} as const;

export type ChallanRow = {
  sno: number;
  hsn: string;
  description: string;
  showPartCode: boolean;
  partCode: string | null;
  qty: string;
  unit: string;
  remarks: string;
};

export type ChallanView = {
  documentTitle: string;
  fromLabel: string;
  fromName: string;
  fromLines: string[];
  meta: { label: string; value: string; strong: boolean }[];
  toLabel: string;
  toName: string;
  toLines: string[];
  toContact: string | null;
  toGstin: string | null;
  rows: ChallanRow[];
  emptyRows: number;
  preparedBy: string;
  receiver: string;
};

type DocLike = {
  type?: string | null;
  document_number?: string | null;
  transaction_number?: string | null;
  transaction_date?: string | null;
  our_company_name?: string | null;
  our_address?: string | null;
  our_city?: string | null;
  our_state?: string | null;
  our_pincode?: string | null;
  our_gstin?: string | null;
  our_pan?: string | null;
  customer_ref_no?: string | null;
  customer_ref_date?: string | null;
  party_name?: string | null;
  party_company?: string | null;
  party_location?: string | null;
  party_post?: string | null;
  party_pincode?: string | null;
  party_state?: string | null;
  party_contact?: string | null;
  party_gstin?: string | null;
  items?: {
    line_type?: string | null;
    item_name?: string | null;
    quantity?: number | null;
    unit?: string | null;
    hsn_code?: string | null;
    item_remarks?: string | null;
  }[];
};

export function buildChallanView(
  doc: DocLike,
  partCode: string | null,
  single?: { name: string; qty: number; unitShort: string } | null
): ChallanView {
  const isReceive = doc.type === "received";

  const docNumber =
    doc.document_number || doc.transaction_number || "—";

  const fromName = doc.our_company_name || "AK Precision Components";
  const addressLine = [doc.our_address, doc.our_city].filter(Boolean).join(", ");
  const fromLines = [
    addressLine,
    doc.our_state,
    doc.our_pincode ? `Pin code: ${doc.our_pincode}` : null,
  ].filter((x): x is string => Boolean(x));

  const meta = [
    { label: "DC No", value: docNumber, strong: true },
    {
      label: "DC Date",
      value: doc.transaction_date ? formatDate(doc.transaction_date) : "—",
      strong: false,
    },
    { label: "Customer Ref. No.", value: doc.customer_ref_no ?? "—", strong: false },
    {
      label: "Customer Ref. Date",
      value: doc.customer_ref_date ? formatDate(doc.customer_ref_date) : "—",
      strong: false,
    },
    { label: "GST No", value: doc.our_gstin ?? "—", strong: false },
    { label: "PAN No", value: doc.our_pan ?? "—", strong: false },
  ];

  const toName = doc.party_name || doc.party_company || "—";
  const toLines = [
    doc.party_location,
    doc.party_post,
    doc.party_pincode
      ? [doc.party_state, doc.party_pincode].filter(Boolean).join(" ")
      : doc.party_state,
  ].filter((x): x is string => Boolean(x));

  const items = doc.items?.length ? doc.items : single ? [single] : [];

  const rows: ChallanRow[] = items.map((item, i) => {
    const isSingleRow = item === single;
    const rowItem = item as {
      line_type?: string | null;
      item_name?: string | null;
      quantity?: number | null;
      unit?: string | null;
      hsn_code?: string | null;
      item_remarks?: string | null;
    };
    const description = (rowItem.item_name ?? (isSingleRow ? single.name : "")) || "—";
    const quantity = rowItem.quantity ?? (isSingleRow ? Number(single.qty) : 0);
    const unitCode = rowItem.unit ?? (isSingleRow ? "" : "");
    const unitShort = isSingleRow ? single.unitShort : UNIT_SHORT[unitCode] ?? unitCode;
    const isComponent = !isSingleRow && rowItem.line_type === "component";
    return {
      sno: i + 1,
      hsn: rowItem.hsn_code || "—",
      description: description || "—",
      showPartCode: isComponent,
      partCode: isComponent ? partCode : null,
      qty: formatQty(quantity),
      unit: unitShort,
      remarks: rowItem.item_remarks || (isSingleRow ? "" : null) || "—",
    };
  });

  return {
    documentTitle: isReceive ? "Receiving Challan" : "Delivery Challan",
    fromLabel: "From",
    fromName,
    fromLines,
    meta,
    toLabel: "To",
    toName,
    toLines,
    toContact: doc.party_contact ?? null,
    toGstin: doc.party_gstin ?? null,
    rows,
    emptyRows: Math.max(0, 8 - rows.length),
    preparedBy: "Prepared By",
    receiver: "Receiver's Signature",
  };
}