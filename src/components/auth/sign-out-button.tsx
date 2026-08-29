"use client";

import { Button } from "@/components/ui/button";
import { useSignOut } from "@/lib/supabase/signout";

export function SignOutButton() {
  const { signOut, loading } = useSignOut();

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={signOut}
      disabled={loading}
    >
      {loading ? "Signing out…" : "Sign out"}
    </Button>
  );
}
