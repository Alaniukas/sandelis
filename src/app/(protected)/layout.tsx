import { redirect } from "next/navigation";
import { WmsProvider } from "@/components/WmsProvider";
import { createClient } from "@/lib/supabase/server";
import { getSupabaseEnv } from "@/lib/supabase/env";

export default async function ProtectedLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const env = getSupabaseEnv();
  if (!env) {
    if (process.env.NODE_ENV === "development") {
      return <WmsProvider>{children}</WmsProvider>;
    }
    redirect("/login?error=config");
  }

  const supabase = await createClient();
  if (!supabase) {
    redirect("/login?error=config");
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return <WmsProvider>{children}</WmsProvider>;
}
