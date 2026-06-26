import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { dateBR } from "@/lib/format";
import { ScrollText } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/logs")({ component: AdminLogs });

function AdminLogs() {
  const logs = useQuery({
    queryKey: ["admin-logs"],
    queryFn: async () => {
      const { data, error } = await supabase.from("admin_logs").select("*").order("created_at", { ascending: false }).limit(200);
      if (error) throw error;
      const ids = Array.from(new Set((data ?? []).map((l) => l.admin_id).filter(Boolean))) as string[];
      const profiles: Record<string, any> = {};
      if (ids.length) {
        const { data: ps } = await supabase.from("profiles").select("id, nick, full_name").in("id", ids);
        for (const p of ps ?? []) profiles[p.id] = p;
      }
      return (data ?? []).map((l) => ({ ...l, admin: l.admin_id ? profiles[l.admin_id] : null }));
    },
    refetchInterval: 15000,
  });

  return (
    <Card className="bg-card glow-border">
      <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><ScrollText className="size-4 text-neon" />Logs dos admins</CardTitle></CardHeader>
      <CardContent className="space-y-2">
        {logs.isLoading && <p className="text-xs text-muted-foreground">Carregando logs...</p>}
        {logs.data?.length === 0 && <p className="text-xs text-muted-foreground py-4">Nenhum log ainda.</p>}
        {logs.data?.map((log) => (
          <div key={log.id} className="rounded-md border border-border bg-surface p-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 flex-wrap"><Badge className="bg-primary/15 text-primary border border-primary/30">{labelAction(log.action)}</Badge><span className="text-xs text-muted-foreground">Admin: {log.admin ? `@${log.admin.nick}` : "sistema"}</span></div>
              <span className="text-[10px] text-muted-foreground whitespace-nowrap">{dateBR(log.created_at)}</span>
            </div>
            <pre className="mt-2 max-h-40 overflow-auto rounded bg-background/50 p-2 text-[10px] text-muted-foreground whitespace-pre-wrap">{JSON.stringify(log.details ?? {}, null, 2)}</pre>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function labelAction(action: string) {
  return ({ grant_role: "Cargo concedido", revoke_role: "Cargo removido", adjust_balance: "Saldo ajustado", set_user_stats: "Ranking editado", delete_room: "Sala excluída", finalize_room: "Partida finalizada", save_and_release_room_link: "Link liberado", manual_password_reset: "Senha redefinida" } as Record<string, string>)[action] ?? action;
}