import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SendMaterialForm } from "@/components/transactions/send-material-form";

export const metadata = { title: "Send Material — AKPC Material Register" };

export default async function ComponentSendPage({
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
      <SendMaterialForm component={component} />
    </div>
  );
}
