"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  LayoutDashboardIcon,
  ScrollTextIcon,
  ArrowDownLeftIcon,
  ArrowUpRightIcon,
  BarChart3Icon,
  SettingsIcon,
  LogOutIcon,
  MenuIcon,
  BoxIcon,
} from "lucide-react";
import {
  Drawer,
  DrawerTrigger,
  DrawerContent,
  DrawerTitle,
  DrawerCloseButton,
} from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Enums } from "@/lib/supabase/database.types";
import { useSignOut } from "@/lib/supabase/signout";

type Role = Enums<"app_role">;

const NAV_ITEMS = (role: Role) => [
  {
    label: "Dashboard",
    href: "/dashboard",
    icon: LayoutDashboardIcon,
    show: true,
  },
  {
    label: "Records",
    href: "/records",
    icon: ScrollTextIcon,
    show: true,
  },
  {
    label: "Receive Material",
    href: "/receive",
    icon: ArrowDownLeftIcon,
    show: role !== "viewer",
  },
  {
    label: "Give Material",
    href: "/give",
    icon: ArrowUpRightIcon,
    show: role !== "viewer",
  },
];

const MANAGEMENT_ITEMS = (role: Role) => [
  { label: "Reports", icon: BarChart3Icon, href: null, show: true, soon: true },
  {
    label: "Settings",
    icon: SettingsIcon,
    href: "/settings",
    show: role !== "viewer",
    soon: false,
  },
];

export function HeaderMenu({
  role,
  userEmail,
}: {
  role: Role;
  userEmail?: string;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const { signOut, loading } = useSignOut();

  const items = NAV_ITEMS(role).filter((i) => i.show);

  function isActive(href: string) {
    return pathname === href;
  }

  return (
    <Drawer side="right" open={open} onOpenChange={setOpen}>
      <DrawerTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            className="size-11"
            aria-label="Open menu"
          >
            <MenuIcon className="size-6" />
          </Button>
        }
      />

      <DrawerContent side="right" className="w-[20rem]">
        <div className="flex items-start justify-between border-b p-5">
          <div className="flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <BoxIcon className="size-5" />
            </span>
            <div>
              <p className="text-sm font-bold tracking-tight uppercase">
                AKPC
              </p>
              <p className="text-xs text-muted-foreground">
                Material Register
              </p>
            </div>
          </div>
          <DrawerCloseButton />
        </div>

        <nav className="flex-1 overflow-y-auto px-2 py-2">
          {/* Main */}
          <div className="px-2 py-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Main
          </div>
          {items.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className={cn(
                  "my-0.5 flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                  active
                    ? "bg-primary/10 text-primary"
                    : "text-foreground/80 hover:bg-muted hover:text-foreground"
                )}
              >
                <Icon
                  className={cn("size-5 shrink-0", active ? "text-primary" : "text-muted-foreground")}
                />
                <span className="flex-1">{item.label}</span>
                {active && (
                  <span className="h-2 w-2 rounded-full bg-primary" />
                )}
              </Link>
            );
          })}

          <div className="my-3 h-px bg-border" />

          {/* Management */}
          <div className="px-2 py-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Management
          </div>
          {MANAGEMENT_ITEMS(role).filter((i) => i.show).map((item) => {
            const Icon = item.icon;
            const active = item.href === pathname;
            if (item.href) {
              return (
                <Link
                  key={item.label}
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className={cn(
                    "my-0.5 flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                    active
                      ? "bg-primary/10 text-primary"
                      : "text-foreground/80 hover:bg-muted hover:text-foreground"
                  )}
                >
                  <Icon
                    className={cn("size-5 shrink-0", active ? "text-primary" : "text-muted-foreground")}
                  />
                  <span className="flex-1">{item.label}</span>
                  {active && <span className="h-2 w-2 rounded-full bg-primary" />}
                </Link>
              );
            }
            return (
              <div
                key={item.label}
                className="flex cursor-not-allowed items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground/70"
                aria-disabled="true"
              >
                <Icon className="size-5 shrink-0" />
                <span className="flex-1">{item.label}</span>
                <span className="rounded-full bg-muted px-2 py-0.5 text-[0.65rem] font-medium text-muted-foreground">
                  Soon
                </span>
              </div>
            );
          })}
        </nav>

        {/* Account */}
        <div className="border-t px-4 py-3">
          <div className="flex items-center justify-between px-1 pb-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{userEmail}</p>
              <p className="text-xs capitalize text-muted-foreground">
                {role}
              </p>
            </div>
          </div>
          <Button
            variant="ghost"
            className="w-full justify-start text-destructive hover:bg-destructive/10 hover:text-destructive"
            onClick={signOut}
            disabled={loading}
          >
            <LogOutIcon className="size-4" />
            {loading ? "Signing out…" : "Sign out"}
          </Button>
        </div>

        {/* a11y title */}
        <DrawerTitle className="sr-only">Navigation menu</DrawerTitle>
      </DrawerContent>
    </Drawer>
  );
}
