"use client";

import { createClient } from "@/lib/supabase/client";

export async function signOut() {
  const supabase = createClient();
  if (supabase) {
    await supabase.auth.signOut();
  }
}
