import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { InvoiceDetailPage } from "@/components/invoices/invoice-detail-page";
import { InvoicePreview } from "@/components/invoices/invoice-preview";
import { parseInvoiceSlug } from "@/lib/invoices/invoice-slug";
import type { InvoiceDetail } from "@/lib/invoices/types";
import type { Tables } from "@/lib/supabase/database.types";

// Invoice numbers contain slashes (INV/2026-27/001), so the route is a
// catch-all that reassembles the number by joining the slug segments with "/".
// A trailing "preview" segment switches to the on-screen A4 Tax Invoice;
// otherwise the detail screen is rendered. The catch-all must stay the last
// segment (Next.js 16 rule).

export async function generateMetadata({
  params,
}: {
  params: Promise<{ invoiceNumber: string[] }>;
}) {
  const { invoiceNumber: slug } = await params;
  const { isPreview } = parseInvoiceSlug(slug);
  return {
    title: isPreview
      ? "Tax Invoice Preview — AKPC Material Register"
      : "Invoice — AKPC Material Register",
  };
}

export default async function InvoiceDetailRoute({
  params,
}: {
  params: Promise<{ invoiceNumber: string[] }>;
}) {
  const { invoiceNumber: slug } = await params;
  const { invoiceNumber, isPreview } = parseInvoiceSlug(slug);
  const supabase = await createClient();

  // Authoritative existence gate (RLS-scoped; the client screens re-render the
  // rich view from their own query).
  const { data, error } = await supabase
    .from("invoices")
    .select(
      "*, invoice_challans(receiving_documents(id, document_number, transaction_date, challan_number)), invoice_items(*)"
    )
    .eq("invoice_number", invoiceNumber)
    .maybeSingle();

  if (error || !data) notFound();

  if (!isPreview) {
    return (
      <div className="mx-auto max-w-6xl">
        <InvoiceDetailPage invoiceNumber={invoiceNumber} />
      </div>
    );
  }

  // A4 preview: map the nested payload into the same InvoiceDetail shape the
  // client hook produces, so InvoicePreview and the PDF renderer read one
  // type. Done server-side so the sheet paints without a loading flash (same
  // approach as the challan preview route).
  const row = data as unknown as Tables<"invoices"> & {
    invoice_challans: Array<{
      receiving_documents: {
        id: string;
        document_number: string;
        transaction_date: string;
        challan_number: string | null;
      } | null;
    }> | null;
    invoice_items: Tables<"invoice_items">[] | null;
  };

  const detail: InvoiceDetail = {
    ...row,
    challans: (row.invoice_challans ?? [])
      .map((c) => c.receiving_documents)
      .filter((c): c is NonNullable<typeof c> => c != null)
      .map((c) => ({
        challanId: c.id,
        document_number: c.document_number,
        transaction_date: c.transaction_date,
        challan_number: c.challan_number,
      })),
    items: (row.invoice_items ?? []).slice().sort((a, b) => a.line_no - b.line_no),
  };

  return (
    <div className="min-h-screen bg-zinc-100">
      <InvoicePreview invoice={detail} />
    </div>
  );
}
