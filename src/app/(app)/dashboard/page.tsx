import { DashboardPage } from "@/components/dashboard/dashboard-page";

export const metadata = { title: "Dashboard — AKPC Material Register" };

export default function DashboardRoute() {
  return (
    <div className="mx-auto max-w-6xl">
      <DashboardPage />
    </div>
  );
}
