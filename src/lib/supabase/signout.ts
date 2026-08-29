"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/**
 * Sign the current user out and return to the login page.
 * Shared by the header menu and any standalone sign-out button.
 */
export function useSignOut() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const signOut = useCallback(async () => {
    setLoading(true);
    try {
      const supabase = createClient();
      await supabase.auth.signOut();
      router.push("/login");
      router.refresh();
    } finally {
      setLoading(false);
    }
  }, [router]);

  return { signOut, loading };
}
