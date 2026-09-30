import { InvoiceCreateFlow } from "@/components/invoices/invoice-create-flow";

export const metadata = { title: "New Invoice — AKPC Material Register" };

export default async function NewInvoiceRoute({
  searchParams,
}: {
  // Read server-side and passed down: using useSearchParams() in the client
  // flow would force a Suspense boundary around it for static prerendering.
  searchParams: Promise<{ challan?: string | string[] }>;
}) {
  const { challan } = await searchParams;
  const preselectChallanId =
    typeof challan === "string" && challan.length > 0 ? challan : null;

  return (
    <div className="mx-auto max-w-6xl">
      <InvoiceCreateFlow preselectChallanId={preselectChallanId} />
    </div>
  );
}
