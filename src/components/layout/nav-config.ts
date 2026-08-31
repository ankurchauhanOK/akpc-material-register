import type { ComponentType } from "react";
import {
  LayoutDashboardIcon,
  BoxIcon,
  ScrollTextIcon,
  BarChart3Icon,
  ClipboardCheckIcon,
  SettingsIcon,
} from "lucide-react";
import type { Enums } from "@/lib/supabase/database.types";

export type Role = Enums<"app_role">;

export type NavItem = {
  key: string;
  label: string;
  href: string;
  icon: ComponentType<{ className?: string }>;
  show: (role: Role) => boolean;
  soon?: boolean;
};

type NavGroup = {
  label?: string;
  items: NavItem[];
};

/** Single source of truth for the app's navigation (shared by rail + drawer). */
export const NAV_GROUPS: NavGroup[] = [
  {
    items: [
      { key: "dashboard", label: "Dashboard", href: "/dashboard", icon: LayoutDashboardIcon, show: () => true },
      { key: "components", label: "Components", href: "/components", icon: BoxIcon, show: () => true },
      { key: "records", label: "Records", href: "/records", icon: ScrollTextIcon, show: () => true },
    ],
  },
  {
    label: "Secondary",
    items: [
      { key: "reports", label: "Reports", href: "/dashboard", icon: BarChart3Icon, show: () => true, soon: true },
      { key: "review", label: "Review", href: "/dashboard", icon: ClipboardCheckIcon, show: () => true, soon: true },
    ],
  },
  {
    label: "Management",
    items: [
      { key: "settings", label: "Settings", href: "/settings", icon: SettingsIcon, show: (role) => role !== "viewer" },
    ],
  },
];

export function visibleNavItems(role: Role): NavItem[] {
  return NAV_GROUPS.flatMap((g) => g.items).filter((i) => i.show(role));
}
