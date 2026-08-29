import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AuthProvider } from "@/hooks/useAuth";
import { AppHeader } from "@/components/layout/app-header";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // No session (or expired) -> login. This is the real server-side gate;
  // the proxy handles the same redirect for convenience, but this layout
  // is authoritative and always re-checks.
  if (!user) {
    redirect("/login");
  }

  // Load the operator/admin profile for this user.
  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  // A signed-in user without a profile, or an inactive profile, is blocked
  // from the app until an admin fixes their account.
  if (!profile || !profile.is_active) {
    redirect("/login");
  }

  return (
    <AuthProvider>
      <div className="flex min-h-full flex-1 flex-col">
        <AppHeader
          role={profile.role}
          userEmail={user.email}
        />
        <div className="flex-1 px-4 py-6 sm:px-6 lg:px-8">{children}</div>
      </div>
    </AuthProvider>
  );
}
