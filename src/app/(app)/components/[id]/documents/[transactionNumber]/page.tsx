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

  const { data: tx } = await supabase
    .from("transactions")
    .select("*")
    .eq("transaction_number", transactionNumber)
    .eq("material_id", id)
    .single();

  if (!component || !tx) notFound();

  return (
    <div className="mx-auto max-w-3xl">
      <DocumentDetail transaction={tx} component={component} />
    </div>
  );
}
