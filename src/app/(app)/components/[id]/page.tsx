import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ComponentDashboard } from "@/components/components/component-dashboard";

export const metadata = { title: "Component Dashboard — AKPC Material Register" };

export default async function ComponentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const supabase = await createClient();
  const { data: component, error } = await supabase
    .from("materials")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !component) notFound();

  return <ComponentDashboard component={component} />;
}
