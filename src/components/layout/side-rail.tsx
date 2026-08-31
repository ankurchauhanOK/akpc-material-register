"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOutIcon, BoxIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { NAV_GROUPS, type Role } from "@/components/layout/nav-config";
import { useSignOut } from "@/lib/supabase/signout";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

export function SideRail({ role }: { role: Role }) {
  const pathname = usePathname();
  const { signOut, loading } = useSignOut();

  return (
    <aside className="sticky top-0 hidden h-screen w-[4.5rem] shrink-0 flex-col items-center border-r border-border bg-background py-3 lg:flex">
      {/* Logo */}
      <Link
        href="/components"
        aria-label="AKPC home"
        className="flex size-11 items-center justify-center rounded-xl bg-emerald-700 text-white"
      >
        <BoxIcon className="size-5" />
      </Link>

      {/* Nav */}
      <nav className="mt-6 flex flex-1 flex-col items-center gap-2">
        {NAV_GROUPS.flatMap((g) =>
          g.items
            .filter((i) => i.show(role))
            .map((item) => {
              const Icon = item.icon;
              const active = pathname === item.href || pathname.startsWith(item.href + "/");
              const el = item.soon ? (
                <span
                  title={item.label}
                  className="flex h-11 w-11 items-center justify-center rounded-xl text-muted-foreground/35 hover:text-muted-foreground/60"
                  aria-disabled="true"
                >
                  <Icon className="size-[22px]" />
                </span>
              ) : (
                <Link
                  key={item.key}
                  href={item.href}
                  title={item.label}
                  aria-label={item.label}
                  className={cn(
                    "flex h-11 w-11 items-center justify-center rounded-xl transition-colors",
                    active
                      ? "bg-emerald-50 text-emerald-700"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  )}
                >
                  <Icon className="size-[22px]" />
                </Link>
              );
              return <div key={item.key}>{el}</div>;
            })
        )}
      </nav>

      {/* Bottom: avatar + sign out */}
      <div className="flex flex-col items-center gap-2">
        <Avatar size="default">
          <AvatarFallback className="bg-emerald-700 text-xs text-white">
            {role.slice(0, 2).toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <button
          onClick={signOut}
          title="Sign out"
          aria-label="Sign out"
          disabled={loading}
          className="flex h-10 w-10 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
        >
          <LogOutIcon className="size-5" />
        </button>
      </div>
    </aside>
  );
}
