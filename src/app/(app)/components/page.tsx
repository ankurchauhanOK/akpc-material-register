import { ComponentsListPage } from "@/components/components/components-list-page";

export const metadata = { title: "Components — AKPC Material Register" };

export default async function ComponentsRoute({
  searchParams,
}: {
  searchParams: Promise<{ action?: string }>;
}) {
  const { action } = await searchParams;
  const validAction =
    action === "send" || action === "receive" ? action : undefined;

  return (
    <div className="mx-auto max-w-6xl">
      <ComponentsListPage action={validAction} />
    </div>
  );
}