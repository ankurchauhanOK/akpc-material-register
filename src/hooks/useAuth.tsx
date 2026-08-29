"use client";

import { type ReactNode, createContext, useContext } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { Permissions, type Profile, type Role } from "@/lib/supabase/types";

export type AuthState = {
  user: { id: string; email?: string } | null;
  profile: Profile | null;
  role: Role | null;
  loading: boolean;
  error: Error | null;
  isAdmin: boolean;
  isOperator: boolean;
  canCreate: boolean;
  canManageMasters: boolean;
};

const AuthContext = createContext<AuthState | undefined>(undefined);

async function fetchAuthState(): Promise<{
  user: { id: string; email?: string } | null;
  profile: Profile | null;
}> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { user: null, profile: null };

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  return { user, profile: (profile as Profile | null) ?? null };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const query = useQuery({
    queryKey: ["auth"],
    queryFn: fetchAuthState,
    staleTime: Infinity,
  });

  const { user, profile } = query.data ?? { user: null, profile: null };
  const role = (profile?.role as Role | undefined) ?? null;

  const value: AuthState = {
    user,
    profile,
    role,
    loading: query.isPending,
    error: query.error instanceof Error ? query.error : null,
    isAdmin: Permissions.isAdmin(role),
    isOperator: role === "operator",
    canCreate: Permissions.canCreate(role),
    canManageMasters: Permissions.canManageMasters(role),
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return ctx;
}

export function useRefreshAuth() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: ["auth"] });
}
