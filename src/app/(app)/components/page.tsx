import { redirect } from "next/navigation";
import { ComponentsListPage } from "@/components/components/components-list-page";

export const metadata = { title: "Components — AKPC Material Register" };

export default async function ComponentsRoute({
  searchParams,
}: {
  searchParams: Promise<{ action?: string }>;
}) {
  const { action } = await searchParams;
  // Send now goes straight to the universal form — never a selection page.
  if (action === "send") redirect("/give");
  const validAction =
    action === "send" || action === "receive" ? action : undefined;

  return (
    <div className="mx-auto max-w-6xl">
      <ComponentsListPage action={validAction} />
    </div>
  );
}