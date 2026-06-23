import { createFileRoute } from "@tanstack/react-router";

const ADMIN_USERNAME = "BrawlAdminPro";
const ADMIN_EMAIL = "brawladminpro@diariobrawl.app";
const ADMIN_PASSWORD = "Br4wl#P2Kx"; // 10 chars
const ADMIN_FULL_NAME = "Administrador Principal";
const ADMIN_PHONE = "0000000000";
const ADMIN_NICK = "AdminPro";

// One-time bootstrap endpoint. Idempotent: if admin already exists, returns 200 with already=true.
// Public path bypasses auth at the edge; we still self-gate via a setup token query param.
const SETUP_TOKEN = "diario-brawl-setup-2026";

export const Route = createFileRoute("/api/public/setup/bootstrap-admin")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        if (url.searchParams.get("token") !== SETUP_TOKEN) {
          return new Response(JSON.stringify({ error: "forbidden" }), { status: 403, headers: { "content-type": "application/json" } });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        // Check if any main admin already exists
        const { data: existingRoles } = await supabaseAdmin
          .from("user_roles")
          .select("user_id")
          .eq("role", "admin_principal")
          .limit(1);

        if (existingRoles && existingRoles.length > 0) {
          return Response.json({
            ok: true,
            already: true,
            login: { username: ADMIN_USERNAME, email: ADMIN_EMAIL },
          });
        }

        // Create the admin auth user
        const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
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
        if (createErr) {
          return Response.json({ ok: false, error: createErr.message }, { status: 500 });
        }

        const userId = created.user!.id;

        // Ensure role + profile exist (trigger should have done it via metadata)
        await supabaseAdmin.from("user_roles").upsert({ user_id: userId, role: "admin_principal" }, { onConflict: "user_id,role" });
        await supabaseAdmin.from("wallets").upsert({ user_id: userId, balance: 0 }, { onConflict: "user_id" });

        return Response.json({
          ok: true,
          created: true,
          login: {
            username: ADMIN_USERNAME,
            email: ADMIN_EMAIL,
            password_hint: "definida no setup",
          },
        });
      },
    },
  },
});
