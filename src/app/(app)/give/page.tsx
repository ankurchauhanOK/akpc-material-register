import { SendMaterialForm } from "@/components/transactions/send-material-form";

export const metadata = { title: "Send Material — AKPC Material Register" };

export default function GivePage() {
  return (
    <div className="mx-auto max-w-6xl">
      <SendMaterialForm />
    </div>
  );
}