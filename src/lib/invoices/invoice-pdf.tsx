"use client";

import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  pdf,
} from "@react-pdf/renderer";
import {
  buildInvoiceView,
  INVOICE_GEOMETRY as G,
  type InvoiceView,
  type HsnSummaryRow,
} from "@/lib/invoices/invoice-view";
import type { InvoiceDetail } from "@/lib/invoices/types";

// ---------------------------------------------------------------------------
// A4 Tax Invoice renderer.
//
// The on-screen Invoice Preview (invoice-preview.tsx) is the approved visual
// reference. This PDF reproduces it: three-column header (GSTIN / Bill No /
// Bill Date | Tax Invoice | E-mail), the company bar, the side-by-side BILLED TO
// + DELIVERY ADDRESS blocks, the 7-column item table, the CGST / SGST /
// Rounding / Total block with the amount in words, the HSN tax summary, Terms &
// Conditions, Declaration, bank details and the Authorized Signatory area.
//
// All values and geometry come from the shared invoice view model — the same
// builder the preview uses — so the printed PDF and the on-screen A4 can never
// disagree.
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  page: {
    paddingHorizontal: G.padding,
    paddingVertical: G.padding,
    backgroundColor: "#ffffff",
  },

  // ---- header: three columns -------------------------------------------
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    width: "100%",
  },
  // 1 px border at 96dpi = 0.75 pt
  hair: {
    borderWidth: G.border,
    borderColor: G.colorTable,
    borderStyle: "solid" as const,
  },
  headLeft: {
    width: 150,
    flexShrink: 0,
  },
  headCenter: {
    width: 219.28,
    flexShrink: 0,
    alignItems: "center" as const,
  },
  headRight: {
    width: 150,
    flexShrink: 0,
    alignItems: "flex-end" as const,
  },
  // A width-less child Text is sized at its intrinsic width by Yoga and
  // overflows instead of wrapping, so every wrapping block carries its own
  // width (see the same note in challan-pdf.tsx).
  labelSm: {
    fontSize: G.fontTiny,
    color: G.textMuted,
  },
  valueSm: {
    fontSize: G.fontSmall,
    color: G.textTitle,
    marginTop: 1,
  },
  metaLabel: {
    fontSize: G.fontTiny,
    color: G.textMuted,
  },
  metaValue: {
    fontSize: G.fontSmall,
    fontWeight: "bold" as const,
    color: G.textTitle,
    marginTop: 1,
  },
  docTitle: {
    fontSize: G.fontTitle,
    fontWeight: "bold" as const,
    color: G.textTitle,
    textTransform: "uppercase" as const,
    letterSpacing: 0.4,
  },

  // ---- company bar ------------------------------------------------------
  brandBar: {
    marginTop: 10,
    paddingVertical: 6,
    borderTopWidth: G.border,
    borderTopColor: G.colorRule,
    borderTopStyle: "solid" as const,
    borderBottomWidth: G.border,
    borderBottomColor: G.colorRule,
    borderBottomStyle: "solid" as const,
    alignItems: "center" as const,
  },
  brand: {
    fontSize: G.fontBrand,
    fontWeight: "bold" as const,
    color: G.textTitle,
    textTransform: "uppercase" as const,
  },
  brandLine: {
    fontSize: G.fontSmall,
    color: G.textBody,
    marginTop: 2,
  },

  // ---- BILLED TO / DELIVERY ADDRESS -------------------------------------
  partyRow: {
    flexDirection: "row",
    marginTop: 10,
  },
  partyBlock: {
    width: 264.64,
    flexShrink: 0,
    padding: 7,
    borderWidth: G.border,
    borderColor: G.colorRule,
    borderStyle: "solid" as const,
  },
  partyName: {
    fontSize: G.fontSmall,
    fontWeight: "bold" as const,
    color: G.textTitle,
    marginTop: 3,
    width: 250,
  },
  partyLine: {
    fontSize: G.fontTiny,
    color: G.textAddress,
    marginTop: 1,
    width: 250,
  },

  // ---- item table -------------------------------------------------------
  table: {
    marginTop: 12,
  },
  headRow: {
    flexDirection: "row",
    backgroundColor: G.bgHeader,
  },
  headCell: {
    paddingVertical: 5,
    paddingHorizontal: 4,
    borderTopWidth: G.border,
    borderTopColor: G.colorTable,
    borderTopStyle: "solid" as const,
  },
  headText: {
    fontSize: G.fontTiny,
    fontWeight: "bold" as const,
    color: G.textHeader,
  },
  dataRow: {
    flexDirection: "row",
  },
  cell: {
    paddingVertical: 5,
    paddingHorizontal: 4,
    borderTopWidth: G.border,
    borderTopColor: G.colorTable,
    borderTopStyle: "solid" as const,
  },
  cellText: {
    fontSize: G.fontSmall,
    color: G.textTitle,
  },
  cellMuted: {
    fontSize: G.fontSmall,
    color: G.textBody,
  },
  cellRight: {
    fontSize: G.fontSmall,
    color: G.textTitle,
    textAlign: "right" as const,
  },
  cellRightMuted: {
    fontSize: G.fontSmall,
    color: G.textBody,
    textAlign: "right" as const,
  },
  cellRightBold: {
    fontSize: G.fontSmall,
    fontWeight: "bold" as const,
    color: G.textTitle,
    textAlign: "right" as const,
  },
  // Column widths (border-box: includes padding + border, so they live on the
  // cell View and are never repeated on the inner Text).
  cSno: { width: G.colSno },
  cDesc: { width: G.colDesc },
  cHsn: { width: G.colHsn },
  cUnit: { width: G.colUnit },
  cQty: { width: G.colQty, textAlign: "right" as const },
  cRate: { width: G.colRate, textAlign: "right" as const },
  cAmount: { width: G.colAmount, textAlign: "right" as const },
  emptyCell: {
    height: G.rowEmpty,
    borderTopWidth: G.border,
    borderTopColor: G.colorTable,
    borderTopStyle: "solid" as const,
  },

  // ---- totals -----------------------------------------------------------
  totalsWrap: {
    flexDirection: "row",
    justifyContent: "flex-end",
    marginTop: 9,
  },
  totalsBox: {
    width: 230,
  },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 2,
  },
  totalLabel: {
    fontSize: G.fontSmall,
    color: G.textBody,
  },
  totalValue: {
    fontSize: G.fontSmall,
    color: G.textTitle,
  },
  totalGrandRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingTop: 4,
    marginTop: 2,
    borderTopWidth: G.border,
    borderTopColor: G.colorTable,
    borderTopStyle: "solid" as const,
  },
  totalGrandLabel: {
    fontSize: G.fontName,
    fontWeight: "bold" as const,
    color: G.textTitle,
  },
  totalGrandValue: {
    fontSize: G.fontName,
    fontWeight: "bold" as const,
    color: G.textTitle,
  },
  roundingNote: {
    fontSize: G.fontTiny,
    fontStyle: "italic" as const,
    color: G.textMuted,
    marginTop: 2,
  },
  wordsLabel: {
    fontSize: G.fontTiny,
    fontWeight: "bold" as const,
    color: G.textMuted,
    textTransform: "uppercase" as const,
    letterSpacing: 0.4,
    marginTop: 4,
  },
  wordsValue: {
    fontSize: G.fontSmall,
    fontWeight: "bold" as const,
    color: G.textTitle,
    marginTop: 1,
  },

  // ---- HSN tax summary --------------------------------------------------
  sumTitle: {
    fontSize: G.fontTiny,
    fontWeight: "bold" as const,
    color: G.textMuted,
    textTransform: "uppercase" as const,
    letterSpacing: 0.4,
    marginTop: 14,
    marginBottom: 3,
  },
  sumHeadRow: {
    flexDirection: "row",
    backgroundColor: G.bgHeader,
  },
  sumHeadRow2: {
    flexDirection: "row",
    backgroundColor: "#fafafa",
  },
  sumHeadCell: {
    paddingVertical: 3,
    paddingHorizontal: 4,
    borderWidth: G.border,
    borderColor: G.colorTable,
    borderStyle: "solid" as const,
  },
  sumHeadText: {
    fontSize: 6.5,
    fontWeight: "bold" as const,
    color: G.textHeader,
  },
  sumCell: {
    paddingVertical: 3,
    paddingHorizontal: 4,
    borderWidth: G.border,
    borderColor: G.colorTable,
    borderStyle: "solid" as const,
  },
  sumText: {
    fontSize: G.fontTiny,
    color: G.textTitle,
  },
  sumTextRight: {
    fontSize: G.fontTiny,
    color: G.textTitle,
    textAlign: "right" as const,
  },
  sumTextRightBold: {
    fontSize: G.fontTiny,
    fontWeight: "bold" as const,
    color: G.textTitle,
    textAlign: "right" as const,
  },
  sumTextBold: {
    fontSize: G.fontTiny,
    fontWeight: "bold" as const,
    color: G.textTitle,
  },
  sHsn: { width: G.colSumHsn },
  sTaxable: { width: G.colSumTaxable, textAlign: "right" as const },
  sRate: { width: G.colSumRate, textAlign: "right" as const },
  sTax: { width: G.colSumTax, textAlign: "right" as const },
  sTotal: { width: G.colSumTotal, textAlign: "right" as const },

  // ---- footer -----------------------------------------------------------
  footerRow: {
    flexDirection: "row",
    marginTop: 16,
  },
  footerLeft: {
    width: 290,
    flexShrink: 0,
  },
  footerRight: {
    width: 249.28,
    flexShrink: 0,
    alignItems: "flex-end" as const,
  },
  footTitle: {
    fontSize: G.fontTiny,
    fontWeight: "bold" as const,
    color: G.textMuted,
    textTransform: "uppercase" as const,
    letterSpacing: 0.4,
  },
  footLine: {
    fontSize: G.fontTiny,
    color: G.textAddress,
    marginTop: 1.5,
  },
  footTerm: {
    fontSize: G.fontTiny,
    color: G.textAddress,
    marginTop: 1.5,
    paddingLeft: 9,
  },
  bankRow: {
    flexDirection: "row",
    marginTop: 1.5,
  },
  bankLabel: {
    fontSize: G.fontTiny,
    color: G.textMuted,
    width: 48,
  },
  bankValue: {
    fontSize: G.fontTiny,
    fontWeight: "bold" as const,
    color: G.textTitle,
  },
  sigFor: {
    fontSize: G.fontSmall,
    fontWeight: "bold" as const,
    color: G.textTitle,
    marginTop: 18,
  },
  sigLine: {
    width: 140,
    marginTop: 30,
    borderBottomWidth: G.border,
    borderBottomColor: G.colorRule,
    borderBottomStyle: "solid" as const,
  },
  sigLabel: {
    fontSize: G.fontTiny,
    color: G.textBody,
    marginTop: 3,
  },
  sigSub: {
    fontSize: G.fontTiny,
    color: G.textMuted,
    marginTop: 1,
  },
});

const cellRightBorder = (include: boolean) =>
  include
    ? {
        borderRightWidth: G.border,
        borderRightColor: G.colorTable,
        borderRightStyle: "solid" as const,
      }
    : {};

function PartyBlock({ block }: { block: InvoiceView["billedTo"] }) {
  return (
    <View style={styles.partyBlock}>
      <Text style={styles.labelSm}>{block.heading}</Text>
      <Text style={styles.partyName}>{block.name}</Text>
      {block.lines.map((l, i) => (
        <Text key={i} style={styles.partyLine}>
          {l}
        </Text>
      ))}
      {block.gstin ? (
        <Text style={styles.partyLine}>GSTIN: {block.gstin}</Text>
      ) : null}
      {block.contact ? <Text style={styles.partyLine}>{block.contact}</Text> : null}
      {block.email ? <Text style={styles.partyLine}>{block.email}</Text> : null}
    </View>
  );
}

function ItemTable({ view }: { view: InvoiceView }) {
  return (
    <View style={styles.table}>
      {/* header row */}
      <View style={styles.headRow}>
        <View style={[styles.headCell, styles.cSno, cellRightBorder(true)]}>
          <Text style={[styles.headText, { textAlign: "center" }]}>Sl. No.</Text>
        </View>
        <View style={[styles.headCell, styles.cDesc, cellRightBorder(true)]}>
          <Text style={styles.headText}>Description of Goods or Service</Text>
        </View>
        <View style={[styles.headCell, styles.cHsn, cellRightBorder(true)]}>
          <Text style={styles.headText}>HSN</Text>
        </View>
        <View style={[styles.headCell, styles.cUnit, cellRightBorder(true)]}>
          <Text style={styles.headText}>Unit</Text>
        </View>
        <View style={[styles.headCell, styles.cQty, cellRightBorder(true)]}>
          <Text style={[styles.headText, { textAlign: "right" }]}>Qty</Text>
        </View>
        <View style={[styles.headCell, styles.cRate, cellRightBorder(true)]}>
          <Text style={[styles.headText, { textAlign: "right" }]}>Rate</Text>
        </View>
        <View style={[styles.headCell, styles.cAmount, {}]}>
          <Text style={[styles.headText, { textAlign: "right" }]}>Amount</Text>
        </View>
      </View>

      {/* data rows */}
      {view.rows.map((row) => (
        <View key={row.sno} style={styles.dataRow}>
          <View style={[styles.cell, styles.cSno, cellRightBorder(true)]}>
            <Text style={[styles.cellMuted, { textAlign: "center" }]}>
              {row.sno}
            </Text>
          </View>
          <View style={[styles.cell, styles.cDesc, cellRightBorder(true)]}>
            <Text style={styles.cellText}>{row.description}</Text>
          </View>
          <View style={[styles.cell, styles.cHsn, cellRightBorder(true)]}>
            <Text style={styles.cellMuted}>{row.hsn}</Text>
          </View>
          <View style={[styles.cell, styles.cUnit, cellRightBorder(true)]}>
            <Text style={styles.cellMuted}>{row.unit}</Text>
          </View>
          <View style={[styles.cell, styles.cQty, cellRightBorder(true)]}>
            <Text style={styles.cellRight}>{row.qty}</Text>
          </View>
          <View style={[styles.cell, styles.cRate, cellRightBorder(true)]}>
            <Text style={styles.cellRight}>{row.rate}</Text>
          </View>
          <View style={[styles.cell, styles.cAmount, {}]}>
            <Text style={styles.cellRightBold}>{row.amount}</Text>
          </View>
        </View>
      ))}

      {/* empty filler rows */}
      {Array.from({ length: view.emptyRows }).map((_, i) => (
        <View key={`empty-${i}`} style={styles.dataRow}>
          <View style={[styles.emptyCell, styles.cSno, cellRightBorder(true)]} />
          <View style={[styles.emptyCell, styles.cDesc, cellRightBorder(true)]} />
          <View style={[styles.emptyCell, styles.cHsn, cellRightBorder(true)]} />
          <View style={[styles.emptyCell, styles.cUnit, cellRightBorder(true)]} />
          <View style={[styles.emptyCell, styles.cQty, cellRightBorder(true)]} />
          <View style={[styles.emptyCell, styles.cRate, cellRightBorder(true)]} />
          <View style={[styles.emptyCell, styles.cAmount, {}]} />
        </View>
      ))}
    </View>
  );
}

function TotalRow({
  label,
  value,
  strong,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <View style={styles.totalRow}>
      <Text style={strong ? styles.totalGrandLabel : styles.totalLabel}>
        {label}
      </Text>
      <Text style={strong ? styles.totalGrandValue : styles.totalValue}>
        {value}
      </Text>
    </View>
  );
}

function HsnSummary({ view }: { view: InvoiceView }) {
  return (
    <View>
      <Text style={styles.sumTitle}>Tax Summary</Text>
      <View style={styles.sumHeadRow}>
        <View style={[styles.sumHeadCell, styles.sHsn]}>
          <Text style={styles.sumHeadText}>HSN/SAC</Text>
        </View>
        <View style={[styles.sumHeadCell, styles.sTaxable]}>
          <Text style={[styles.sumHeadText, { textAlign: "right" }]}>
            Taxable Value
          </Text>
        </View>
        <View style={[styles.sumHeadCell, { width: 145 }, {}]}>
          <Text style={[styles.sumHeadText, { textAlign: "center" }]}>
            Central Tax
          </Text>
        </View>
        <View style={[styles.sumHeadCell, { width: 145 }, {}]}>
          <Text style={[styles.sumHeadText, { textAlign: "center" }]}>
            State Tax
          </Text>
        </View>
        <View style={[styles.sumHeadCell, styles.sTotal]}>
          <Text style={[styles.sumHeadText, { textAlign: "right" }]}>
            Total Tax
          </Text>
        </View>
      </View>
      <View style={styles.sumHeadRow2}>
        <View style={[styles.sumHeadCell, styles.sHsn]} />
        <View style={[styles.sumHeadCell, styles.sTaxable]} />
        <View style={[styles.sumHeadCell, styles.sRate]}>
          <Text style={[styles.sumHeadText, { textAlign: "right" }]}>Rate</Text>
        </View>
        <View style={[styles.sumHeadCell, styles.sTax]}>
          <Text style={[styles.sumHeadText, { textAlign: "right" }]}>
            Amount
          </Text>
        </View>
        <View style={[styles.sumHeadCell, styles.sRate]}>
          <Text style={[styles.sumHeadText, { textAlign: "right" }]}>Rate</Text>
        </View>
        <View style={[styles.sumHeadCell, styles.sTax]}>
          <Text style={[styles.sumHeadText, { textAlign: "right" }]}>
            Amount
          </Text>
        </View>
        <View style={[styles.sumHeadCell, styles.sTotal]} />
      </View>
      {view.hsnRows.map((r) => (
        <HsnRow key={r.key} row={r} />
      ))}
      {/* footer total row */}
      <View style={styles.dataRow}>
        <View style={[styles.sumCell, styles.sHsn]}>
          <Text style={[styles.sumTextBold, { textAlign: "right" }]}>
            Total
          </Text>
        </View>
        <View style={[styles.sumCell, styles.sTaxable]}>
          <Text style={styles.sumTextRightBold}>
            {view.hsnTotals.taxableValue}
          </Text>
        </View>
        <View style={[styles.sumCell, styles.sRate]} />
        <View style={[styles.sumCell, styles.sTax]}>
          <Text style={styles.sumTextRightBold}>
            {view.hsnTotals.cgstAmount}
          </Text>
        </View>
        <View style={[styles.sumCell, styles.sRate]} />
        <View style={[styles.sumCell, styles.sTax]}>
          <Text style={styles.sumTextRightBold}>
            {view.hsnTotals.sgstAmount}
          </Text>
        </View>
        <View style={[styles.sumCell, styles.sTotal]}>
          <Text style={styles.sumTextRightBold}>
            {view.hsnTotals.totalTax}
          </Text>
        </View>
      </View>
    </View>
  );
}

function HsnRow({ row }: { row: HsnSummaryRow }) {
  return (
    <View style={styles.dataRow}>
      <View style={[styles.sumCell, styles.sHsn]}>
        <Text style={styles.sumText}>{row.hsn}</Text>
      </View>
      <View style={[styles.sumCell, styles.sTaxable]}>
        <Text style={styles.sumTextRight}>{row.taxableValue}</Text>
      </View>
      <View style={[styles.sumCell, styles.sRate]}>
        <Text style={styles.sumTextRight}>{row.cgstRate}</Text>
      </View>
      <View style={[styles.sumCell, styles.sTax]}>
        <Text style={styles.sumTextRight}>{row.cgstAmount}</Text>
      </View>
      <View style={[styles.sumCell, styles.sRate]}>
        <Text style={styles.sumTextRight}>{row.sgstRate}</Text>
      </View>
      <View style={[styles.sumCell, styles.sTax]}>
        <Text style={styles.sumTextRight}>{row.sgstAmount}</Text>
      </View>
      <View style={[styles.sumCell, styles.sTotal]}>
        <Text style={styles.sumTextRightBold}>{row.totalTax}</Text>
      </View>
    </View>
  );
}

function InvoiceBody({ view }: { view: InvoiceView }) {
  return (
    <>
      {/* header: GSTIN + bill meta (left) | title (center) | e-mail (right) */}
      <View style={styles.headerRow}>
        <View style={styles.headLeft}>
          <Text style={styles.labelSm}>GSTIN</Text>
          <Text style={styles.valueSm}>{view.ourGstin}</Text>
          {view.meta.map((m) => (
            <View key={m.label}>
              <Text style={styles.metaLabel}>{m.label}</Text>
              <Text style={styles.metaValue}>{m.value}</Text>
            </View>
          ))}
        </View>
        <View style={styles.headCenter}>
          <Text style={styles.docTitle}>{view.documentTitle}</Text>
        </View>
        <View style={styles.headRight}>
          <Text style={styles.labelSm}>E-mail</Text>
          <Text style={styles.valueSm}>{view.ourEmail ?? "—"}</Text>
        </View>
      </View>

      {/* company bar */}
      <View style={styles.brandBar}>
        <Text style={styles.brand}>{view.brandName}</Text>
        {view.brandAddress ? (
          <Text style={styles.brandLine}>{view.brandAddress}</Text>
        ) : null}
      </View>

      {/* BILLED TO + DELIVERY ADDRESS */}
      <View style={styles.partyRow}>
        <PartyBlock block={view.billedTo} />
        <PartyBlock block={view.deliveryTo} />
      </View>

      {/* item table */}
      <ItemTable view={view} />

      {/* totals */}
      <View style={styles.totalsWrap}>
        <View style={styles.totalsBox}>
          <TotalRow label="Subtotal" value={view.subtotal} />
          <TotalRow label="CGST" value={view.cgst} />
          <TotalRow label="SGST" value={view.sgst} />
          <TotalRow label="Rounding" value={view.rounding} />
          <View style={styles.totalGrandRow}>
            <Text style={styles.totalGrandLabel}>Total</Text>
            <Text style={styles.totalGrandValue}>{view.total}</Text>
          </View>
          {view.roundingNote ? (
            <Text style={styles.roundingNote}>{view.roundingNote}</Text>
          ) : null}
          <Text style={styles.wordsLabel}>Amount Chargeable (in words)</Text>
          <Text style={styles.wordsValue}>{view.amountInWords}</Text>
        </View>
      </View>

      {/* HSN tax summary */}
      <HsnSummary view={view} />

      {/* footer: terms + declaration | bank + signature */}
      <View style={styles.footerRow}>
        <View style={styles.footerLeft}>
          {view.terms.length > 0 ? (
            <>
              <Text style={styles.footTitle}>Term &amp; Condition</Text>
              {view.terms.map((t, i) => (
                <Text key={i} style={styles.footTerm}>
                  {`${i + 1}. ${t.replace(/^\d+\.\s*/, "")}`}
                </Text>
              ))}
            </>
          ) : null}
          {view.declaration ? (
            <>
              <Text style={[styles.footTitle, { marginTop: 8 }]}>
                Declaration
              </Text>
              <Text style={styles.footLine}>{view.declaration}</Text>
            </>
          ) : null}
        </View>
        <View style={styles.footerRight}>
          {view.bank.length > 0 ? (
            <>
              <Text style={styles.footTitle}>Bank Details</Text>
              {view.bank.map((b) => (
                <View key={b.label} style={styles.bankRow}>
                  <Text style={styles.bankLabel}>{b.label}</Text>
                  <Text style={styles.bankValue}>{b.value}</Text>
                </View>
              ))}
            </>
          ) : null}
          <Text style={styles.sigFor}>For {view.signatureFor}</Text>
          <View style={styles.sigLine} />
          <Text style={styles.sigLabel}>{view.signatureLabel}</Text>
          <Text style={styles.sigSub}>{view.signatureSub}</Text>
        </View>
      </View>
    </>
  );
}

export function InvoiceDocument({ invoice }: { invoice: InvoiceDetail }) {
  const view = buildInvoiceView(invoice);
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <InvoiceBody view={view} />
      </Page>
    </Document>
  );
}

/** Generate a Blob of the tax invoice PDF. */
export async function renderInvoicePdf(invoice: InvoiceDetail): Promise<Blob> {
  return pdf(<InvoiceDocument invoice={invoice} />).toBlob();
}
