"use client";

import type { ReactNode } from "react";
import { useAuth } from "@/hooks/useAuth";
import { roleAtLeast, type Role } from "@/lib/supabase/types";

/**
 * UX-level gate: only renders children for users whose role is at
 * least `minimumRole`. This hides/disables UI for clarity — it is NOT
 * a security boundary. The database RLS is the actual enforcement.
 */
export function RoleGate({
  minimumRole,
  children,
}: {
  minimumRole: Role;
  children: ReactNode;
}) {
  const { role } = useAuth();
  if (!roleAtLeast(role, minimumRole)) return null;
  return <>{children}</>;
}
