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
import { formatDate, formatINR } from "@/lib/format";

const styles = StyleSheet.create({
  page: {
    padding: 40,
    fontSize: 11,
    fontFamily: "Helvetica",
    color: "#1a1a1a",
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 20,
  },
  brand: {
    fontSize: 16,
    fontWeight: "bold",
  },
  sub: {
    fontSize: 10,
    color: "#555",
    marginTop: 2,
  },
  docTitle: {
    fontSize: 13,
    fontWeight: "bold",
    textAlign: "right",
  },
  meta: {
    fontSize: 10,
    textAlign: "right",
    color: "#555",
    marginTop: 2,
  },
  rule: {
    borderBottomWidth: 1,
    borderBottomColor: "#ccc",
    marginBottom: 16,
  },
  table: {
    width: "100%",
    marginVertical: 12,
  },
  row: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#e5e5e5",
    paddingVertical: 6,
  },
  head: {
    flexDirection: "row",
    borderBottomWidth: 1.5,
    borderBottomColor: "#999",
    paddingVertical: 6,
    backgroundColor: "#f5f5f5",
  },
  cellA: { width: "8%", fontSize: 10 },
  cellB: { width: "34%", fontSize: 10 },
  cellC: { width: "18%", fontSize: 10 },
  cellD: { width: "20%", fontSize: 10 },
  cellE: { width: "20%", fontSize: 10, textAlign: "right" },
  headText: { fontWeight: "bold", fontSize: 10 },
  partyBlock: {
    marginTop: 6,
    marginBottom: 6,
  },
  partyLabel: {
    fontSize: 9,
    color: "#777",
    textTransform: "uppercase",
  },
  partyName: {
    fontSize: 13,
    fontWeight: "bold",
    marginTop: 2,
  },
  partyLine: {
    fontSize: 10,
    color: "#444",
    marginTop: 1,
  },
  label: {
    fontSize: 9,
    color: "#777",
    textTransform: "uppercase",
  },
  value: {
    fontSize: 11,
    marginTop: 1,
  },
  footer: {
    position: "absolute",
    bottom: 40,
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
});

type Tx = Tables<"transactions"> & { party_name: string | null };

export function ChallanDocument({
  tx,
  componentName,
  componentUnit,
}: {
  tx: Tx;
  componentName: string;
  componentUnit: string;
}) {
  const isReceive = tx.type === "received";
  const partyLine = tx.party_name || tx.party_company || "—";
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.brand}>AK Precise Components</Text>
            <Text style={styles.sub}>AKPC · Material Register</Text>
          </View>
          <View>
            <Text style={styles.docTitle}>
              {isReceive ? "RECEIVING CHALLAN" : "DELIVERY CHALLAN"}
            </Text>
            <Text style={styles.meta}>{tx.transaction_number}</Text>
            <Text style={styles.meta}>{formatDate(tx.transaction_date)}</Text>
          </View>
        </View>
        <View style={styles.rule} />

        <View style={styles.partyBlock}>
          <Text style={styles.partyLabel}>{isReceive ? "Received From" : "Sent To"}</Text>
          <Text style={styles.partyName}>{partyLine}</Text>
          {tx.party_location ? (
            <Text style={styles.partyLine}>{tx.party_location}</Text>
          ) : null}
          {tx.party_contact ? (
            <Text style={styles.partyLine}>{tx.party_contact}</Text>
          ) : null}
        </View>

        <View style={styles.table}>
          <View style={styles.head}>
            <Text style={styles.cellA}>
              <Text style={styles.headText}>#</Text>
            </Text>
            <Text style={styles.cellB}>
              <Text style={styles.headText}>Component</Text>
            </Text>
            <Text style={styles.cellC}>
              <Text style={styles.headText}>Quantity</Text>
            </Text>
            <Text style={styles.cellD}>
              <Text style={styles.headText}>Unit Price</Text>
            </Text>
            <Text style={styles.cellE}>
              <Text style={styles.headText}>Amount</Text>
            </Text>
          </View>

          <View style={styles.row}>
            <Text style={styles.cellA}>1</Text>
            <Text style={styles.cellB}>{componentName}</Text>
            <Text style={styles.cellC}>
              {tx.pieces} {componentUnit}
            </Text>
            <Text style={styles.cellD}>
              {tx.unit_price != null ? formatINR(tx.unit_price) : "—"}
            </Text>
            <Text style={styles.cellE}>{formatINR(tx.total_amount)}</Text>
          </View>
        </View>

        <View
          style={{
            marginTop: 8,
            borderTopWidth: 1,
            borderTopColor: "#999",
            paddingTop: 6,
            flexDirection: "row",
            justifyContent: "space-between",
          }}
        >
          <Text style={styles.value}>Total Amount</Text>
          <Text style={{ fontSize: 13, fontWeight: "bold" }}>
            {formatINR(tx.total_amount)}
          </Text>
        </View>

        <View
          style={{
            marginTop: 24,
            flexDirection: "row",
            justifyContent: "space-between",
          }}
        >
          <View>
            <Text style={styles.label}>Prepared By</Text>
            <Text style={{ ...styles.value, marginTop: 26 }}>________</Text>
          </View>
          <View>
            <Text style={{ ...styles.label, textAlign: "right" }}>
              {isReceive ? "Authorised Signatory" : "Receiver's Signature"}
            </Text>
            <Text style={{ ...styles.value, marginTop: 26, textAlign: "right" }}>
              ________
            </Text>
          </View>
        </View>

        <View style={styles.footer}>
          <Text>AK Precision Components</Text>
          <Text>This challan is computer generated.</Text>
        </View>
      </Page>
    </Document>
  );
}

/** Generate a Blob of the challan PDF for a transaction. */
export async function renderChallanPdf(
  tx: Tx,
  componentName: string,
  componentUnit: string
): Promise<Blob> {
  const doc = (
    <ChallanDocument
      tx={tx}
      componentName={componentName}
      componentUnit={componentUnit}
    />
  );
  return pdf(doc).toBlob();
}
