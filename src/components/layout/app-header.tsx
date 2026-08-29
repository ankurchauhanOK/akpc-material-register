import Link from "next/link";
import type { Enums } from "@/lib/supabase/database.types";
import { SignOutButton } from "@/components/auth/sign-out-button";

export function AppHeader({
  userName,
  role,
}: {
  userName: string;
  role: Enums<"app_role">;
}) {
  return (
    <header className="sticky top-0 z-10 border-b bg-white">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <div className="flex min-w-0 items-baseline gap-2">
          <Link
            href="/dashboard"
            className="text-sm font-semibold tracking-tight hover:underline"
          >
            AKPC Material Register
          </Link>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href="/receive"
            className="inline-flex h-9 items-center justify-center rounded-lg bg-emerald-600 px-3 text-sm font-medium text-white hover:bg-emerald-700"
          >
            + Receive
          </Link>
          <div className="hidden text-right sm:block">
            <p className="text-sm font-medium leading-tight">{userName}</p>
            <p className="text-xs capitalize leading-tight text-zinc-500">
              {role}
            </p>
          </div>
          <SignOutButton />
        </div>
      </div>
    </header>
  );
}
