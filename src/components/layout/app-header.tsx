"use client";

import Link from "next/link";
import { SearchIcon, BellIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import type { Role } from "@/components/layout/nav-config";
import { HeaderMenu } from "@/components/layout/header-menu";

export function AppHeader({
  role,
  userEmail,
}: {
  role: Role;
  userEmail?: string;
}) {
  return (
    <header className="mx-auto w-full max-w-[1400px] px-3 pt-3 sm:px-4">
      <div className="flex h-14 items-center justify-between gap-3 rounded-2xl border border-border bg-white px-4 shadow-none sm:px-5">
        {/* Left: brand */}
        <div className="flex items-center gap-3">
          <span className="lg:hidden">
            <HeaderMenu role={role} userEmail={userEmail} />
          </span>
          <Link
            href="/components"
            className="text-[15px] font-bold tracking-tight text-foreground"
          >
            AKPC <span className="font-semibold text-muted-foreground">Material Register</span>
          </Link>
        </div>

        {/* Right: icons + avatar (visual-only search/notif) */}
        <div className="flex items-center gap-1.5">
          <Button
            variant="ghost"
            size="icon-lg"
            className="text-muted-foreground"
            aria-label="Search"
          >
            <SearchIcon className="size-5" />
          </Button>
          <Button
            variant="ghost"
            size="icon-lg"
            className="text-muted-foreground"
            aria-label="Notifications"
          >
            <BellIcon className="size-5" />
          </Button>
          <span className="mx-1 hidden h-6 w-px bg-border sm:block" />
          <Avatar size="sm">
            <AvatarFallback className="bg-emerald-700 text-xs text-white">
              {userEmail ? userEmail[0].toUpperCase() : role.slice(0, 1).toUpperCase()}
            </AvatarFallback>
          </Avatar>
        </div>
      </div>
    </header>
  );
}
