import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertMainAdmin(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin_principal")
    .maybeSingle();
  if (error || !data) throw new Error("Sem permissão");
  return supabaseAdmin;
}

export const getAdminUserEmails = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const supabaseAdmin = await assertMainAdmin(context.userId);
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    if (error) throw error;
    return data.users.map((u) => ({ id: u.id, email: u.email ?? "" }));
  });

export const setUserPasswordManually = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ userId: z.string().uuid(), password: z.string().min(8, "Senha mínima de 8 caracteres") }))
  .handler(async ({ data, context }) => {
    const supabaseAdmin = await assertMainAdmin(context.userId);
    const { error } = await supabaseAdmin.auth.admin.updateUserById(data.userId, { password: data.password });
    if (error) throw error;
    await supabaseAdmin.from("admin_logs").insert({
      admin_id: context.userId,
      action: "manual_password_reset",
      target_type: "user",
      target_id: data.userId,
      details: { changed: true },
    });
    return { ok: true };
  });