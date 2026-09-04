"use client";

import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { SearchIcon, BellIcon, ChevronLeftIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import type { Role } from "@/components/layout/nav-config";
import { HeaderMenu } from "@/components/layout/header-menu";
import { useMobileHeaderTitle } from "@/components/layout/mobile-header-context";

/** Root pages show the brand title and no back button. */
const ROOT_PATHS = ["/dashboard", "/components", "/records", "/settings"];

/** Static sub-page titles for routes that don't set their own via context. */
function staticTitleFor(pathname: string): string | null {
  if (pathname.endsWith("/receive")) return "Receive Material";
  if (pathname.endsWith("/send")) return "Send Material";
  if (pathname.includes("/challan")) return "Challan Preview";
  return null;
}

export function AppHeader({
  role,
  userEmail,
}: {
  role: Role;
  userEmail?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { title } = useMobileHeaderTitle();

  const isRootPath = ROOT_PATHS.some((p) => pathname === p);
  const isSubPath = !isRootPath && pathname !== "/";

  const staticTitle = isSubPath ? staticTitleFor(pathname) : null;
  const mobileTitle = isRootPath
    ? "AKPC Material Register"
    : title ?? staticTitle ?? "Details";

  return (
    <header className="mx-auto w-full max-w-[1400px] px-3 pt-3 sm:px-4">
      {/* ── MOBILE HEADER (below lg) ─────────────────────────── */}
      <div className="flex h-14 items-center justify-between gap-3 rounded-2xl border border-border bg-white px-3 lg:hidden">
        {/* Left: back button or brand */}
        {isSubPath ? (
          <button
            onClick={() => router.back()}
            aria-label="Go back"
            className="flex size-9 shrink-0 items-center justify-center rounded-lg text-foreground transition-colors active:bg-muted"
          >
            <ChevronLeftIcon className="size-6" />
          </button>
        ) : (
          <Link
            href="/components"
            className="truncate text-[15px] font-bold tracking-tight text-foreground"
          >
            AKPC <span className="font-semibold text-muted-foreground">Material Register</span>
          </Link>
        )}

        {/* Title (truncated) — only on sub pages between back and actions */}
        {isSubPath && (
          <span className="min-w-0 flex-1 truncate text-[15px] font-semibold tracking-tight text-foreground">
            {mobileTitle}
          </span>
        )}

        {/* Right: icons + avatar */}
        <div className="flex shrink-0 items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="text-muted-foreground"
            aria-label="Search"
          >
            <SearchIcon className="size-5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="hidden text-muted-foreground sm:inline-flex"
            aria-label="Notifications"
          >
            <BellIcon className="size-5" />
          </Button>
          <Avatar size="sm">
            <AvatarFallback className="bg-emerald-700 text-xs text-white">
              {userEmail ? userEmail[0].toUpperCase() : role.slice(0, 1).toUpperCase()}
            </AvatarFallback>
          </Avatar>
        </div>
      </div>

      {/* ── DESKTOP HEADER (lg and above) — unchanged ────────── */}
      <div className="hidden h-14 items-center justify-between gap-3 rounded-2xl border border-border bg-white px-4 sm:px-5 lg:flex">
        {/* Left: brand */}
        <div className="flex items-center gap-3">
          <HeaderMenu role={role} userEmail={userEmail} />
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
