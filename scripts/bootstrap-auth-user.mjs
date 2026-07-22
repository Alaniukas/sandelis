/**
 * Vienkartinis WMS vartotojo sukūrimas Supabase Auth.
 * Slaptažodis NIEKADA neįrašomas į git — tik per env.
 *
 * PowerShell (vieną kartą, lokaliai):
 *   $env:NEXT_PUBLIC_SUPABASE_URL="https://xxx.supabase.co"
 *   $env:SUPABASE_SERVICE_ROLE_KEY="eyJ..."
 *   $env:WMS_AUTH_EMAIL="sandelis@wms.internal"
 *   $env:WMS_AUTH_USERNAME="tavo-vartotojas"
 *   $env:WMS_BOOTSTRAP_PASSWORD="tavo-slaptazodis"
 *   node scripts/bootstrap-auth-user.mjs
 */
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const email = process.env.WMS_AUTH_EMAIL?.trim();
const username = process.env.WMS_AUTH_USERNAME?.trim();
const password = process.env.WMS_BOOTSTRAP_PASSWORD;

if (!url || !serviceKey || !email || !username || !password) {
  console.error(
    "Trūksta env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,",
    "WMS_AUTH_EMAIL, WMS_AUTH_USERNAME, WMS_BOOTSTRAP_PASSWORD",
  );
  process.exit(1);
}

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const { data: existing } = await admin.auth.admin.listUsers();
const found = existing?.users?.find(
  (u) => u.email === email || u.user_metadata?.username === username,
);

if (found) {
  const { error } = await admin.auth.admin.updateUserById(found.id, {
    password,
    email_confirm: true,
    user_metadata: { username, app: "sandelio-wms" },
  });
  if (error) {
    console.error("Atnaujinti nepavyko:", error.message);
    process.exit(1);
  }
  console.log("Vartotojas atnaujintas (slaptažodis pakeistas).");
  process.exit(0);
}

const { error } = await admin.auth.admin.createUser({
  email,
  password,
  email_confirm: true,
  user_metadata: { username, app: "sandelio-wms" },
});

if (error) {
  console.error("Sukurti nepavyko:", error.message);
  process.exit(1);
}

console.log("Vartotojas sukurtas. Prisijunk per /login su vartotojo vardu.");
console.log("Vidinis Auth email (nematomas UI):", email);
