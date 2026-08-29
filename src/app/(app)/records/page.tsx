import { RecordsPage } from "@/components/records/records-page";

export const metadata = { title: "Records — AKPC Material Register" };

export default function RecordsPageRoute() {
  return (
    <div className="mx-auto max-w-6xl">
      <RecordsPage />
    </div>
  );
}
