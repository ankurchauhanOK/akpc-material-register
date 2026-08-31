import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ComponentTransactionForm } from "@/components/transactions/component-transaction-form";

export const metadata = { title: "Receive Material — AKPC Material Register" };

export default async function ComponentReceivePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: component } = await supabase
    .from("materials")
    .select("*")
    .eq("id", id)
    .single();

  if (!component) notFound();

  return (
    <div className="mx-auto max-w-6xl">
      <ComponentTransactionForm component={component} direction="received" />
    </div>
  );
}
