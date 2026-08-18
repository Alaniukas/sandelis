/**
 * Peržiūros (view-only) WMS vartotojas.
 *
 * PowerShell, vieną kartą, lokaliai (service_role NIEKADA neį git):
 *   $env:NEXT_PUBLIC_SUPABASE_URL="https://YOUR_PROJECT.supabase.co"
 *   $env:SUPABASE_SERVICE_ROLE_KEY="eyJ..."
 *   $env:WMS_VIEW_EMAIL="perziura@wms.internal"
 *   $env:WMS_VIEW_USERNAME="Perziura"
 *   $env:WMS_BOOTSTRAP_PASSWORD="Ziureti2026!"
 *   node scripts/bootstrap-viewer-user.mjs
 */
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const email = process.env.WMS_VIEW_EMAIL?.trim();
const username = process.env.WMS_VIEW_USERNAME?.trim();
const password = process.env.WMS_BOOTSTRAP_PASSWORD;

if (!url || !serviceKey || !email || !username || !password) {
  console.error(
    "Trūksta env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,",
    "WMS_VIEW_EMAIL, WMS_VIEW_USERNAME, WMS_BOOTSTRAP_PASSWORD",
  );
  process.exit(1);
}

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const { data: existing } = await admin.auth.admin.listUsers();
const found = existing?.users?.find((u) => u.email === email);

const payload = {
  password,
  email_confirm: true,
  user_metadata: { username, app: "sandelio-wms" },
  app_metadata: { wms_role: "viewer" },
};

if (found) {
  const { error } = await admin.auth.admin.updateUserById(found.id, payload);
  if (error) {
    console.error("Atnaujinti nepavyko:", error.message);
    process.exit(1);
  }
  console.log("Peržiūros vartotojas atnaujintas.");
  process.exit(0);
}

const { error } = await admin.auth.admin.createUser({
  email,
  ...payload,
});

if (error) {
  console.error("Sukurti nepavyko:", error.message);
  process.exit(1);
}

console.log("Peržiūros vartotojas sukurtas.");
console.log("Prisijungimas: vartotojo vardas =", username);
console.log("Vidinis Auth email:", email);
