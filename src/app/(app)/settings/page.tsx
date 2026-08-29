import { SettingsPage } from "@/components/settings/settings-page";

export const metadata = { title: "Settings — AKPC Material Register" };

export default function SettingsRoute() {
  return (
    <div className="mx-auto max-w-5xl">
      <SettingsPage />
    </div>
  );
}
