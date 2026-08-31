import { ComponentsListPage } from "@/components/components/components-list-page";

export const metadata = { title: "Components — AKPC Material Register" };

export default function ComponentsRoute() {
  return (
    <div className="mx-auto max-w-6xl">
      <ComponentsListPage />
    </div>
  );
}
