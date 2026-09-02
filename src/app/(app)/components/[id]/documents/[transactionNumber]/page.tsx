import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { DocumentDetail } from "@/components/components/document-detail";

export const metadata = { title: "Document — AKPC Material Register" };

export default async function ComponentDocumentPage({
  params,
}: {
  params: Promise<{ id: string; transactionNumber: string }>;
}) {
  const { id, transactionNumber } = await params;
  const supabase = await createClient();

  const { data: component } = await supabase
    .from("materials")
    .select("*")
    .eq("id", id)
    .single();

  if (!component) notFound();

  // A document number may map to either a legacy single-item transaction
  // (Send / pre-v2 receive) or a v2 receiving_documents header with lines.
  const { data: legacy } = await supabase
    .from("transactions")
    .select("*")
    .eq("transaction_number", transactionNumber)
    .eq("material_id", id)
    .single();

  if (legacy) {
    return (
      <div className="mx-auto max-w-3xl">
        <DocumentDetail
          component={component}
          transaction={{ ...legacy, items: null }}
        />
      </div>
    );
  }

  // v2 document: look up the header plus its line items.
  const { data: doc } = await supabase
    .from("receiving_documents")
    .select("*, receiving_document_items(*)")
    .eq("document_number", transactionNumber)
    .single();

  if (!doc) notFound();

  const docRow = doc as Record<string, unknown>;
  const itemsRaw = docRow.receiving_document_items;

  return (
    <div className="mx-auto max-w-3xl">
      <DocumentDetail
        component={component}
        transaction={
          {
            ...docRow,
            transaction_number: doc.document_number,
            items: Array.isArray(itemsRaw) ? itemsRaw : [],
          } as Parameters<typeof DocumentDetail>[0]["transaction"]
        }
      />
    </div>
  );
}