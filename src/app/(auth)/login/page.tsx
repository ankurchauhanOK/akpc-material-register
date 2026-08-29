import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { LoginForm } from "@/components/auth/login-form";

export const metadata = { title: "Sign in — AKPC Material Register" };

export default async function LoginPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Already signed in -> straight to dashboard.
  if (user) {
    redirect("/dashboard");
  }

  return (
    <main className="flex min-h-full flex-1 items-center justify-center p-6">
      <div className="w-full max-w-sm rounded-xl border bg-white p-6 shadow-sm">
        <div className="mb-6">
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
            AK Precision Components
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">
            Material Register
          </h1>
          <p className="mt-1 text-sm text-zinc-500">
            Sign in with your AKPC account.
          </p>
        </div>

        <LoginForm />
      </div>
    </main>
  );
}
