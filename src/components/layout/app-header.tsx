import Link from "next/link";
import type { Enums } from "@/lib/supabase/database.types";
import { HeaderMenu } from "@/components/layout/header-menu";

export function AppHeader({
  role,
  userEmail,
}: {
  role: Enums<"app_role">;
  userEmail?: string;
}) {
  return (
    <header className="sticky top-0 z-10 border-b bg-white">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <Link
          href="/components"
          className="text-sm font-semibold tracking-tight hover:underline"
        >
          AKPC Material Register
        </Link>

        <HeaderMenu role={role} userEmail={userEmail} />
      </div>
    </header>
  );
}
