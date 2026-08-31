"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { LogOutIcon, BoxIcon, MenuIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Drawer,
  DrawerTrigger,
  DrawerContent,
  DrawerTitle,
  DrawerCloseButton,
} from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { NAV_GROUPS, type Role } from "@/components/layout/nav-config";
import { useSignOut } from "@/lib/supabase/signout";

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

  function isActive(href: string) {
    return pathname === href || pathname.startsWith(href + "/");
  }

  return (
    <Drawer side="right" open={open} onOpenChange={setOpen}>
      <DrawerTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            className="size-10 text-foreground"
            aria-label="Open menu"
          >
            <MenuIcon className="size-6" />
          </Button>
        }
      />

      <DrawerContent side="right" className="w-[18rem]">
        <div className="flex items-start justify-between border-b p-5">
          <div className="flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-xl bg-emerald-700 text-white">
              <BoxIcon className="size-5" />
            </span>
            <div>
              <p className="text-sm font-bold tracking-tight uppercase">AKPC</p>
              <p className="text-xs text-muted-foreground">Material Register</p>
            </div>
          </div>
          <DrawerCloseButton />
        </div>

        <nav className="flex-1 overflow-y-auto px-2 py-2">
          {NAV_GROUPS.map((group) => {
            const items = group.items.filter((i) => i.show(role));
            if (items.length === 0) return null;
            return (
              <div key={group.label ?? "main"}>
                {group.label && (
                  <div className="px-2 py-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                    {group.label}
                  </div>
                )}
                {items.map((item) => {
                  const Icon = item.icon;
                  const active = isActive(item.href);
                  const content = (
                    <>
                      <Icon
                        className={cn(
                          "size-5 shrink-0",
                          active ? "text-emerald-700" : "text-muted-foreground"
                        )}
                      />
                      <span className="flex-1">{item.label}</span>
                      {item.soon && (
                        <span className="rounded-full bg-muted px-2 py-0.5 text-[0.65rem] font-medium text-muted-foreground">
                          Soon
                        </span>
                      )}
                      {active && <span className="h-2 w-2 rounded-full bg-emerald-600" />}
                    </>
                  );
                  return item.soon ? (
                    <div
                      key={item.key}
                      className="flex cursor-not-allowed items-center gap-3 px-3 py-2.5 text-sm font-medium text-muted-foreground/70"
                      aria-disabled="true"
                    >
                      {content}
                    </div>
                  ) : (
                    <Link
                      key={item.key}
                      href={item.href}
                      onClick={() => setOpen(false)}
                      className={cn(
                        "my-0.5 flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                        active
                          ? "bg-emerald-50 text-emerald-700"
                          : "text-foreground/80 hover:bg-muted"
                      )}
                    >
                      {content}
                    </Link>
                  );
                })}
                <div className="my-2 h-px bg-border" />
              </div>
            );
          })}
        </nav>

        <div className="border-t px-4 py-3">
          <div className="flex items-center justify-between px-1 pb-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{userEmail}</p>
              <p className="text-xs capitalize text-muted-foreground">{role}</p>
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

        <DrawerTitle className="sr-only">Navigation menu</DrawerTitle>
      </DrawerContent>
    </Drawer>
  );
}
