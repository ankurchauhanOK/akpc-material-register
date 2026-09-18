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
  buildChallanView,
  CHALLAN_GEOMETRY as G,
  type ChallanView,
  type ChallanRow,
} from "@/lib/challan/challan-view";
import type { Tables } from "@/lib/supabase/database.types";

// ---------------------------------------------------------------------------
// A4 Delivery/Receiving Challan renderer.
//
// The on-screen Challan Preview (challan-preview.tsx) is the approved visual
// reference. This PDF reproduces that layout as faithfully as @react-pdf
// allows: same FROM/TO blocks, header metadata grid, item table with explicit
// per-cell borders (every column separated by a visible vertical rule), empty
// filler rows, and the Prepared By / Receiver's Signature area. All values and
// geometry come from the shared challan view model, never hard-coded.
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  page: {
    paddingHorizontal: G.padding,
    paddingVertical: G.padding,
    backgroundColor: "#ffffff",
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  fromBlock: {
    flexGrow: 1,
    paddingRight: 18,
  },
  fromLabel: {
    fontSize: G.fontSmall,
    fontWeight: "bold",
    color: G.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  brand: {
    fontSize: G.fontBrand,
    fontWeight: "bold",
    color: G.textTitle,
    textTransform: "uppercase",
    marginTop: 4,
  },
  fromLine: {
    fontSize: G.fontBody,
    color: G.textBody,
    marginTop: 1,
  },
  docTitleBlock: {
    alignItems: "flex-end",
  },
  docTitle: {
    fontSize: G.fontTitle,
    fontWeight: "bold",
    color: G.textTitle,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  metaRow: {
    flexDirection: "row",
    marginTop: 3,
  },
  metaLabel: {
    fontSize: G.fontBody,
    color: G.textMuted,
    width: 96,
  },
  metaValue: {
    fontSize: G.fontBody,
    color: G.textTitle,
    width: 168,
    textAlign: "right",
  },
  metaStrong: {
    fontWeight: "bold",
  },
  rule: {
    borderBottomWidth: G.border,
    borderBottomColor: G.colorRule,
    borderBottomStyle: "solid",
    marginVertical: 12,
  },
  toBlock: {
    borderWidth: G.border,
    borderColor: G.colorBox,
    padding: 9,
  },
  toLabel: {
    fontSize: G.fontSmall,
    fontWeight: "bold",
    color: G.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  toName: {
    fontSize: G.fontName,
    fontWeight: "bold",
    color: G.textTitle,
    marginTop: 3,
  },
  toLine: {
    fontSize: G.fontBody,
    color: G.textAddress,
    marginTop: 1,
  },
  table: {
    marginTop: 15,
    borderLeftWidth: G.border,
    borderLeftColor: G.colorTable,
    borderRightWidth: G.border,
    borderRightColor: G.colorTable,
    borderBottomWidth: G.border,
    borderBottomColor: G.colorTable,
  },
  headRow: {
    flexDirection: "row",
    backgroundColor: G.bgHeader,
  },
  headCell: {
    paddingVertical: 6,
    paddingHorizontal: 5,
    borderTopWidth: G.border,
    borderTopColor: G.colorTable,
  },
  headText: {
    fontSize: G.fontSmall,
    fontWeight: "bold",
    color: G.textHeader,
  },
  dataRow: {
    flexDirection: "row",
  },
  cell: {
    paddingVertical: 6,
    paddingHorizontal: 5,
    borderTopWidth: G.border,
    borderTopColor: G.colorTable,
  },
  // per-column cell styles (borderRight added where needed below)
  cSno: { width: G.colSno, fontSize: G.fontBody, color: G.textBody, textAlign: "center" as const },
  cHsn: { width: G.colHsn, fontSize: G.fontBody, color: G.textBody },
  cDesc: { width: G.colDesc, fontSize: G.fontBody },
  cMoq: { width: G.colMoq, fontSize: G.fontBody, color: G.textBody, textAlign: "right" as const },
  cUnit: { width: G.colUnit, fontSize: G.fontBody, color: G.textBody },
  cRem: { width: G.colRem, fontSize: G.fontBody, color: G.textAddress },
  cDescName: { fontSize: G.fontBody, fontWeight: "bold" as const, color: G.textTitle },
  cDescPart: { fontSize: G.fontSmall, color: G.textMuted, marginTop: 1 },
  emptyCell: {
    minHeight: G.rowEmpty,
    paddingVertical: 4,
    paddingHorizontal: 5,
    borderTopWidth: G.border,
    borderTopColor: G.colorTable,
  },
  sigRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 36,
  },
  sigBlockPrepared: {
    width: "50%",
  },
  sigBlockReceiver: {
    width: "33.33%",
  },
  sigLine: {
    height: 42,
    borderBottomWidth: G.border,
    borderBottomStyle: "dashed",
    borderBottomColor: G.colorRule,
  },
  sigLabel: {
    fontSize: G.fontSmall,
    color: G.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginTop: 3,
    textAlign: "center" as const,
  },
});

type Tx = Tables<"transactions"> & { party_name: string | null };

const cellBorder = {
  borderRightWidth: G.border,
  borderRightColor: G.colorTable,
  borderRightStyle: "solid" as const,
};

const colRightBorder = (include: boolean) => (include ? cellBorder : {});

function HeadCell({
  children,
  width,
  right,
  align,
  last,
}: {
  children: string;
  width: number;
  right: boolean;
  align?: "left" | "center" | "right";
  last?: boolean;
}) {
  return (
    <View
      style={[
        styles.headCell,
        { width },
        right ? styles.cMoq : {},
        colRightBorder(!last),
      ]}
    >
      <Text
        style={[
          styles.headText,
          ...(align === "center" ? [{ textAlign: "center" as const }] : []),
          ...(right ? [{ textAlign: "right" as const }] : []),
        ]}
      >
        {children}
      </Text>
    </View>
  );
}

function DataRow({ row }: { row: ChallanRow }) {
  const descChild = row.showPartCode && row.partCode ? (
    <>
      <Text style={styles.cDescName}>{row.description}</Text>
      <Text style={styles.cDescPart}>{row.partCode}</Text>
    </>
  ) : (
    <Text style={styles.cDescName}>{row.description}</Text>
  );
  return (
    <View style={styles.dataRow}>
      <View style={[styles.cell, styles.cSno, colRightBorder(true)]}>
        <Text>{row.sno}</Text>
      </View>
      <View style={[styles.cell, styles.cHsn, colRightBorder(true)]}>
        <Text>{row.hsn}</Text>
      </View>
      <View style={[styles.cell, styles.cDesc, colRightBorder(true)]}>
        {descChild}
      </View>
      <View style={[styles.cell, styles.cMoq, colRightBorder(true)]}>
        <Text style={[styles.cMoq]}>{row.qty}</Text>
      </View>
      <View style={[styles.cell, styles.cUnit, colRightBorder(true)]}>
        <Text>{row.unit}</Text>
      </View>
      <View style={[styles.cell, styles.cRem, colRightBorder(false)]}>
        <Text>{row.remarks}</Text>
      </View>
    </View>
  );
}

function EmptyRow() {
  return (
    <View style={styles.dataRow}>
      <View style={[styles.emptyCell, styles.cSno, colRightBorder(true)]} />
      <View style={[styles.emptyCell, styles.cHsn, colRightBorder(true)]} />
      <View style={[styles.emptyCell, styles.cDesc, colRightBorder(true)]} />
      <View style={[styles.emptyCell, styles.cMoq, colRightBorder(true)]} />
      <View style={[styles.emptyCell, styles.cUnit, colRightBorder(true)]} />
      <View style={[styles.emptyCell, styles.cRem, colRightBorder(false)]} />
    </View>
  );
}

function ChallanBody({ view }: { view: ChallanView }) {
  return (
    <>
      {/* Header: FROM (left) + DELIVERY CHALLAN metadata (right) */}
      <View style={styles.headerRow}>
        <View style={styles.fromBlock}>
          <Text style={styles.fromLabel}>{view.fromLabel}</Text>
          <Text style={styles.brand}>{view.fromName}</Text>
          {view.fromLines.map((l, i) => (
            <Text key={i} style={styles.fromLine}>
              {l}
            </Text>
          ))}
        </View>
        <View style={styles.docTitleBlock}>
          <Text style={styles.docTitle}>{view.documentTitle}</Text>
          {view.meta.map((m) => (
            <View key={m.label} style={styles.metaRow}>
              <Text style={styles.metaLabel}>{m.label}</Text>
              <Text style={[styles.metaValue, ...(m.strong ? [styles.metaStrong] : [])]}>
                {m.value}
              </Text>
            </View>
          ))}
        </View>
      </View>

      <View style={styles.rule} />

      {/* TO block */}
      <View style={styles.toBlock}>
        <Text style={styles.toLabel}>{view.toLabel}</Text>
        <Text style={styles.toName}>{view.toName}</Text>
        {view.toLines.map((l, i) => (
          <Text key={i} style={styles.toLine}>
            {l}
          </Text>
        ))}
        {view.toContact ? <Text style={styles.toLine}>{view.toContact}</Text> : null}
        {view.toGstin ? (
          <Text style={styles.toLine}>GST No: {view.toGstin}</Text>
        ) : null}
      </View>

      {/* Item table */}
      <View style={styles.table}>
        <View style={styles.headRow}>
          <HeadCell last={false} right={false} align="center" width={G.colSno}>
            S. No.
          </HeadCell>
          <HeadCell last={false} right={false} width={G.colHsn}>
            HSN/SAC
          </HeadCell>
          <HeadCell last={false} right={false} width={G.colDesc}>
            Description of Goods
          </HeadCell>
          <HeadCell last={false} right width={G.colMoq}>
            MOQ
          </HeadCell>
          <HeadCell last={false} right={false} width={G.colUnit}>
            Unit
          </HeadCell>
          <HeadCell last right={false} width={G.colRem}>
            Remarks
          </HeadCell>
        </View>

        {view.rows.map((row, i) => (
          <DataRow key={i} row={row} />
        ))}
        {Array.from({ length: view.emptyRows }).map((_, i) => (
          <EmptyRow key={i} />
        ))}
      </View>

      {/* Signature footer */}
      <View style={styles.sigRow}>
        <View style={styles.sigBlockPrepared}>
          <View style={styles.sigLine} />
          <Text style={styles.sigLabel}>{view.preparedBy}</Text>
        </View>
        <View style={styles.sigBlockReceiver}>
          <View style={styles.sigLine} />
          <Text style={styles.sigLabel}>{view.receiver}</Text>
        </View>
      </View>
    </>
  );
}

export function ChallanDocument({
  tx,
  componentName,
  componentUnit,
  items,
  doc,
  partCode,
}: {
  tx: Tx;
  componentName: string;
  componentUnit: string;
  items?: Tables<"receiving_document_items">[] | null;
  doc?: Tables<"receiving_documents"> | null;
  partCode?: string | null;
}) {
  const data = doc ?? (tx as unknown as Tables<"receiving_documents"> & {
    items?: Tables<"receiving_document_items">[];
  });
  const hasItems = (items?.length ?? 0) > 0;

  const view = buildChallanView(
    data,
    partCode ?? null,
    !hasItems
      ? { name: componentName, qty: Number(tx.pieces ?? 0), unitShort: componentUnit }
      : null
  );

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <ChallanBody view={view} />
      </Page>
    </Document>
  );
}

/** Generate a Blob of the challan PDF for a transaction/document. */
export async function renderChallanPdf(
  tx: Tx,
  componentName: string,
  componentUnit: string,
  items?: Tables<"receiving_document_items">[] | null,
  doc?: Tables<"receiving_documents"> | null,
  partCode?: string | null
): Promise<Blob> {
  const docEl = (
    <ChallanDocument
      tx={tx}
      componentName={componentName}
      componentUnit={componentUnit}
      items={items}
      doc={doc}
      partCode={partCode}
    />
  );
  return pdf(docEl).toBlob();
}