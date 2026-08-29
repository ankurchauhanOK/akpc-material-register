import { GiveForm } from "@/components/transactions/give-form";

export const metadata = { title: "Give Material — AKPC Material Register" };

export default function GivePage() {
  return (
    <div className="mx-auto max-w-6xl">
      <GiveForm />
    </div>
  );
}
