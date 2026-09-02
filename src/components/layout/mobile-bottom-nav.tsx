"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { HouseIcon, BoxIcon, ScrollTextIcon, MoreHorizontalIcon } from "lucide-react";
import { cn } from "@/lib/utils";

const BOTTOM_NAV_ITEMS = [
  { key: "home", label: "Home", href: "/dashboard", icon: HouseIcon },
  { key: "components", label: "Components", href: "/components", icon: BoxIcon },
  { key: "records", label: "Records", href: "/records", icon: ScrollTextIcon },
  { key: "more", label: "More", href: "/settings", icon: MoreHorizontalIcon },
] as const;

export function MobileBottomNav() {
  const pathname = usePathname();

  function isActive(href: string): boolean {
    if (href === "/dashboard") return pathname === "/dashboard";
    if (href === "/components")
      return pathname === "/components" || pathname.startsWith("/components/");
    if (href === "/records") return pathname === "/records";
    if (href === "/settings")
      return (
        pathname === "/settings" ||
        pathname.startsWith("/settings/")
      );
    return pathname === href;
  }

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-white/95 backdrop-blur-md supports-[backdrop-filter]:bg-white/80 lg:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
    >
      <ul className="mx-auto flex max-w-lg items-stretch justify-around px-2">
        {BOTTOM_NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.href);
          return (
            <li key={item.key} className="flex-1">
              <Link
                href={item.href}
                aria-label={item.label}
                className={cn(
                  "flex flex-col items-center justify-center gap-0.5 py-2.5 transition-colors",
                  active
                    ? "text-emerald-700"
                    : "text-muted-foreground active:text-foreground"
                )}
              >
                <Icon
                  className={cn(
                    "size-6 transition-colors",
                    active ? "text-emerald-700" : ""
                  )}
                  strokeWidth={active ? 2.2 : 1.8}
                />
                <span
                  className={cn(
                    "text-[11px] leading-tight",
                    active ? "font-semibold" : "font-medium"
                  )}
                >
                  {item.label}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
