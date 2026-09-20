import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { DocumentDetail } from "@/components/components/document-detail";
import { ChallanPreview } from "@/components/challan/challan-preview";
import { normalizeSlug } from "@/lib/documents/normalize-slug";
import type { Tables } from "@/lib/supabase/database.types";

// Top-level document catch-all (no /components/<id> scope). Used by Send
// documents recorded against Tools/Other, which have no Component Master
// (receiving_document_items.component_id is NULL). Reassembles the number
// from the slug segments and honors a trailing "challan" segment (same
// rules as the component-scoped route).

export async function generateMetadata({
  params,
}: {
  params: Promise<{ transactionNumber: string[] }>;
}) {
  const { transactionNumber: slug } = await params;
  const { isChallan } = normalizeSlug(slug);
  return {
    title: isChallan
      ? "Challan Preview — AKPC Material Register"
      : "Document — AKPC Material Register",
  };
}

export default async function DocumentPage({
  params,
}: {
  params: Promise<{ transactionNumber: string[] }>;
}) {
  const { transactionNumber: slug } = await params;
  const { transactionNumber, isChallan } = normalizeSlug(slug);
  const supabase = await createClient();

  // v2 document: header plus its line items.
  const { data: doc, error } = await supabase
    .from("receiving_documents")
    .select("*, receiving_document_items(*)")
    .eq("document_number", transactionNumber)
    .maybeSingle();

  if (error || !doc) notFound();

  const docRow = doc as Record<string, unknown>;
  const itemsRaw = docRow.receiving_document_items;
  const items: Tables<"receiving_document_items">[] = Array.isArray(itemsRaw)
    ? (itemsRaw as Tables<"receiving_document_items">[])
    : [];

  // Components only come with manufacturing documents; resolve the master
  // for the first component line so part codes still render when present.
  const firstComponentId =
    items.find((i) => i.component_id != null)?.component_id ?? null;

  let component: Tables<"materials"> | null = null;
  if (firstComponentId) {
    const { data: material } = await supabase
      .from("materials")
      .select("*")
      .eq("id", firstComponentId)
      .single();
    component = material ?? null;
  }

  const previewDoc = {
    ...(docRow as unknown as Tables<"receiving_documents">),
    items,
  };

  if (isChallan || !component) {
    return (
      <div className="bg-zinc-100 min-h-screen">
        <ChallanPreview
          doc={previewDoc}
          component={component}
          partCode={component?.part_code ?? null}
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl">
      <DocumentDetail
        component={component}
        transaction={
          {
            ...docRow,
            transaction_number: doc.document_number,
            items,
          } as Parameters<typeof DocumentDetail>[0]["transaction"]
        }
      />
    </div>
  );
}