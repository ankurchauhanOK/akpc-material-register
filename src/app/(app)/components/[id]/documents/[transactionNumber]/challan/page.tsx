import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ChallanPreview } from "@/components/challan/challan-preview";
import type { Tables } from "@/lib/supabase/database.types";

export const metadata = { title: "Challan Preview — AKPC Material Register" };

export default async function ChallanPreviewPage({
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
  // or a v2 receiving_documents header with lines. For the Send preview we
  // always target the v2 document (GIV-xxxxx); the legacy send is a no-go
  // for the document viewer.
  const { data: doc } = await supabase
    .from("receiving_documents")
    .select("*, receiving_document_items(*)")
    .eq("document_number", transactionNumber)
    .single();

  if (!doc) notFound();

  const docRow = doc as Record<string, unknown>;
  const itemsRaw = docRow.receiving_document_items;

  const previewDoc = {
    ...(docRow as unknown as Tables<"receiving_documents">),
    items: Array.isArray(itemsRaw) ? (itemsRaw as Tables<"receiving_document_items">[]) : [],
  };

  // Part code context for Manufactured Material lines comes from the
  // component master resolved above.
  const partCode = component.part_code ?? null;

  return (
    <div className="bg-zinc-100 min-h-screen">
      <ChallanPreview doc={previewDoc} component={component} partCode={partCode} />
    </div>
  );
}