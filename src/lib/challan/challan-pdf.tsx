"use client";

import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  pdf,
} from "@react-pdf/renderer";
import type { Tables } from "@/lib/supabase/database.types";
import { formatDate } from "@/lib/format";

const styles = StyleSheet.create({
  page: {
    paddingHorizontal: 40,
    paddingVertical: 32,
    fontSize: 10,
    fontFamily: "Helvetica",
    color: "#1a1a1a",
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  brand: {
    fontSize: 16,
    fontWeight: "bold",
    textTransform: "uppercase",
    marginTop: 1,
  },
  brandLine: {
    fontSize: 9,
    color: "#444",
    marginTop: 1,
  },
  docTitleBlock: {
    alignItems: "flex-end",
  },
  docTitle: {
    fontSize: 14,
    fontWeight: "bold",
    textAlign: "right",
  },
  metaRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    width: 260,
    marginTop: 2,
  },
  metaLabel: {
    fontSize: 9,
    color: "#666",
    width: 110,
  },
  metaValue: {
    fontSize: 9,
    width: 150,
    textAlign: "right",
  },
  rule: {
    borderBottomWidth: 1,
    borderBottomColor: "#999",
    marginVertical: 12,
  },
  toBlock: {
    borderWidth: 1,
    borderColor: "#aaa",
    padding: 8,
  },
  toLabel: {
    fontSize: 9,
    color: "#777",
    textTransform: "uppercase",
  },
  toName: {
    fontSize: 12,
    fontWeight: "bold",
    marginTop: 2,
  },
  toLine: {
    fontSize: 10,
    color: "#444",
    marginTop: 1,
  },
  table: {
    width: "100%",
    marginTop: 12,
  },
  head: {
    flexDirection: "row",
    borderWidth: 1,
    borderColor: "#999",
    backgroundColor: "#f0f0f0",
    paddingVertical: 5,
  },
  row: {
    flexDirection: "row",
    borderWidth: 1,
    borderTopWidth: 0,
    borderColor: "#aaa",
    paddingVertical: 6,
  },
  headText: { fontWeight: "bold", fontSize: 9 },
  cellSno: { width: "8%", fontSize: 9, textAlign: "center" },
  cellHsn: { width: "13%", fontSize: 9 },
  cellDesc: { width: "42%", fontSize: 10 },
  cellQty: { width: "10%", fontSize: 9, textAlign: "right" },
  cellUnit: { width: "9%", fontSize: 9 },
  cellRem: { width: "18%", fontSize: 9 },
  headCenter: { textAlign: "center" },
  footer: {
    position: "absolute",
    bottom: 32,
    left: 40,
    right: 40,
    flexDirection: "row",
    justifyContent: "space-between",
    fontSize: 9,
    color: "#666",
    borderTopWidth: 1,
    borderTopColor: "#ccc",
    paddingTop: 8,
  },
  sigRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 80,
  },
  sigBlock: {
    flexDirection: "column",
    alignItems: "center",
    width: "45%",
  },
  sigLine: {
    width: "100%",
    borderBottomWidth: 1,
    borderBottomStyle: "dashed",
    borderBottomColor: "#999",
    height: 30,
  },
  sigLabel: {
    fontSize: 9,
    color: "#666",
    textTransform: "uppercase",
    marginTop: 2,
  },
});

type Tx = Tables<"transactions"> & { party_name: string | null };
type DocItem = Tables<"receiving_document_items">;
type FullDoc = Tables<"receiving_documents">;

const UNIT_SHORT: Record<string, string> = {
  pieces: "Nos",
  kg: "Kg",
  meter: "Mtr",
  litre: "Ltr",
  set: "Set",
};

export function ChallanDocument({
  tx,
  componentName,
  componentUnit,
  items,
  doc,
}: {
  tx: Tx;
  componentName: string;
  componentUnit: string;
  items?: DocItem[] | null;
  doc?: FullDoc | null;
}) {
  const isReceive = tx.type === "received";
  const hasItems = (items?.length ?? 0) > 0;

  const fromName = doc?.our_company_name || "AK Precision Components";
  const addressLine = [doc?.our_address, doc?.our_city].filter(Boolean).join(", ");
  const fromLines = [
    addressLine,
    doc?.our_state,
    doc?.our_pincode ? `Pin code: ${doc.our_pincode}` : null,
  ].filter(Boolean);

  const partyLine = doc?.party_name || doc?.party_company || tx.party_name || tx.party_company || "—";
  const toLines = [
    doc?.party_location ?? tx.party_location,
    doc?.party_post ?? tx.party_post,
    (doc?.party_pincode ?? tx.party_pincode)
      ? [doc?.party_state, doc?.party_pincode ?? tx.party_pincode]
          .filter(Boolean)
          .join(" ")
      : doc?.party_state,
  ].filter(Boolean);

  const meta: { label: string; value: string }[] = [
    { label: "DC No", value: doc?.document_number ?? tx.transaction_number },
    { label: "DC Date", value: formatDate(doc?.transaction_date ?? tx.transaction_date) },
    { label: "Customer Ref. No.", value: doc?.customer_ref_no ?? "—" },
    {
      label: "Customer Ref. Date",
      value: doc?.customer_ref_date ? formatDate(doc.customer_ref_date) : "—",
    },
    { label: "GST No", value: doc?.our_gstin ?? "—" },
    { label: "PAN No", value: doc?.our_pan ?? "—" },
  ];

  const renderRows = () => {
    if (hasItems) {
      return items!.map((item, i) => (
        <View style={styles.row} key={item.id} wrap={false}>
          <Text style={styles.cellSno}>{i + 1}</Text>
          <Text style={styles.cellHsn}>{item.hsn_code || ""}</Text>
          <View style={{ width: "42%" }}>
            <Text style={{ fontSize: 10 }}>{item.item_name}</Text>
          </View>
          <Text style={styles.cellQty}>
            {new Intl.NumberFormat("en-IN").format(Number(item.quantity))}
          </Text>
          <Text style={styles.cellUnit}>{UNIT_SHORT[item.unit] ?? item.unit}</Text>
          <Text style={styles.cellRem}>{item.item_remarks || ""}</Text>
        </View>
      ));
    }
    return (
      <View style={styles.row}>
        <Text style={styles.cellSno}>1</Text>
        <Text style={styles.cellHsn}>{""}</Text>
        <Text style={styles.cellDesc}>{componentName}</Text>
        <Text style={styles.cellQty}>{tx.pieces}</Text>
        <Text style={styles.cellUnit}>{componentUnit}</Text>
        <Text style={styles.cellRem}>{""}</Text>
      </View>
    );
  };

  const rowCount = hasItems ? items!.length : 1;
  const fillerRows = Math.max(0, 8 - rowCount);

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.toLabel}>From</Text>
            <Text style={styles.brand}>{fromName}</Text>
            {fromLines.map((l, i) => (
              <Text key={i} style={styles.brandLine}>
                {l}
              </Text>
            ))}
          </View>
          <View style={styles.docTitleBlock}>
            <Text style={styles.docTitle}>
              {isReceive ? "RECEIVING CHALLAN" : "DELIVERY CHALLAN"}
            </Text>
            {meta.map((m) => (
              <View key={m.label} style={styles.metaRow}>
                <Text style={styles.metaLabel}>{m.label}</Text>
                <Text style={styles.metaValue}>{m.value}</Text>
              </View>
            ))}
          </View>
        </View>

        <View style={styles.rule} />

        {/* TO block */}
        <View style={styles.toBlock}>
          <Text style={styles.toLabel}>{isReceive ? "Received From" : "To"}</Text>
          <Text style={styles.toName}>{partyLine}</Text>
          {toLines.map((l, i) => (
            <Text key={i} style={styles.toLine}>
              {l}
            </Text>
          ))}
          {doc?.party_contact ? (
            <Text style={styles.toLine}>{doc.party_contact}</Text>
          ) : null}
          {doc?.party_gstin ? (
            <Text style={styles.toLine}>GST No: {doc.party_gstin}</Text>
          ) : null}
        </View>

        {/* Item table */}
        <View style={styles.table}>
          <View style={styles.head}>
            <Text style={[styles.cellSno, styles.headText]}>S. No.</Text>
            <Text style={[styles.cellHsn, styles.headText]}>HSN/SAC</Text>
            <Text style={[styles.cellDesc, styles.headText]}>
              Description of Goods
            </Text>
            <Text style={[styles.cellQty, styles.headText, styles.headCenter]}>MOQ</Text>
            <Text style={[styles.cellUnit, styles.headText]}>Unit</Text>
            <Text style={[styles.cellRem, styles.headText]}>Remarks</Text>
          </View>

          {renderRows()}
          {Array.from({ length: fillerRows }).map((_, i) => (
            <View style={styles.row} key={`empty-${i}`}>
              <Text style={styles.cellSno}>{" "}</Text>
              <Text style={styles.cellHsn}>{" "}</Text>
              <Text style={styles.cellDesc}>{" "}</Text>
              <Text style={styles.cellQty}>{" "}</Text>
              <Text style={styles.cellUnit}>{" "}</Text>
              <Text style={styles.cellRem}>{" "}</Text>
            </View>
          ))}
        </View>

        {/* Signature footer */}
        <View style={styles.sigRow}>
          <View style={styles.sigBlock}>
            <View style={styles.sigLine} />
            <Text style={styles.sigLabel}>
              {isReceive ? "Authorised Signatory" : "Prepared By"}
            </Text>
          </View>
          <View style={styles.sigBlock}>
            <View style={styles.sigLine} />
            <Text style={styles.sigLabel}>Receiver&apos;s Signature</Text>
          </View>
        </View>

        <View style={styles.footer}>
          <Text>{doc?.our_company_name || "AK Precision Components"}</Text>
          <Text>This challan is computer generated.</Text>
        </View>
      </Page>
    </Document>
  );
}

/** Generate a Blob of the challan PDF for a transaction/document. */
export async function renderChallanPdf(
  tx: Tx,
  componentName: string,
  componentUnit: string,
  items?: DocItem[] | null,
  doc?: FullDoc | null
): Promise<Blob> {
  const docEl = (
    <ChallanDocument
      tx={tx}
      componentName={componentName}
      componentUnit={componentUnit}
      items={items}
      doc={doc}
    />
  );
  return pdf(docEl).toBlob();
}