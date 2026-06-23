// One-time bootstrap edge function to create the main administrator.
// Idempotent: if an admin already exists, returns already=true.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const ADMIN_EMAIL = "brawladminpro@diariobrawl.app";
const ADMIN_PASSWORD = "Br4wl#P2Kx";
const ADMIN_FULL_NAME = "Administrador Principal";
const ADMIN_PHONE = "0000000000";
const ADMIN_NICK = "AdminPro";

Deno.serve(async () => {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  const { data: existing } = await supabase
    .from("user_roles").select("user_id").eq("role", "admin_principal").limit(1);

  if (existing && existing.length > 0) {
    return new Response(JSON.stringify({ ok: true, already: true, email: ADMIN_EMAIL }), {
      headers: { "content-type": "application/json" },
    });
  }

  const { data, error } = await supabase.auth.admin.createUser({
    email: ADMIN_EMAIL,
    password: ADMIN_PASSWORD,
    email_confirm: true,
    user_metadata: {
      full_name: ADMIN_FULL_NAME,
      phone: ADMIN_PHONE,
      nick: ADMIN_NICK,
      is_main_admin: true,
    },
  });
  if (error) {
    return new Response(JSON.stringify({ ok: false, error: error.message }), {
      status: 500, headers: { "content-type": "application/json" },
    });
  }
  const userId = data.user!.id;
  await supabase.from("user_roles").upsert({ user_id: userId, role: "admin_principal" }, { onConflict: "user_id,role" });
  await supabase.from("wallets").upsert({ user_id: userId, balance: 0 }, { onConflict: "user_id" });
  return new Response(JSON.stringify({ ok: true, created: true, email: ADMIN_EMAIL }), {
    headers: { "content-type": "application/json" },
  });
});
