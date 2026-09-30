import { InvoicesListPage } from "@/components/invoices/invoices-list-page";

export const metadata = { title: "Invoices — AKPC Material Register" };

export default function InvoicesRoute() {
  return (
    <div className="mx-auto max-w-6xl">
      <InvoicesListPage />
    </div>
  );
}