import { ReceiveForm } from "@/components/transactions/receive-form";

export const metadata = { title: "Receive Material — AKPC Material Register" };

export default function ReceivePage() {
  return (
    <div className="mx-auto max-w-6xl">
      <ReceiveForm />
    </div>
  );
}
