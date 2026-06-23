import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { MobileShell } from "@/components/MobileShell";
import { useSession, useRoles, useWallet, isAdmin } from "@/hooks/use-auth";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { brl } from "@/lib/format";
import { Users, Lock } from "lucide-react";

export const Route = createFileRoute("/_authenticated/")({
  component: HomePage,
});

function HomePage() {
  const { user } = useSession();
  const roles = useRoles(user);
  const wallet = useWallet(user);
  const qc = useQueryClient();

  const rooms = useQuery({
    queryKey: ["rooms-list"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("rooms")
        .select("id, name, entry_fee, max_participants, status, description, created_at, finished_at")
        .is("finished_at", null)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const counts = useQuery({
    queryKey: ["room-counts"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_room_counts");
      if (error) throw error;
      const map: Record<string, number> = {};
      for (const r of data ?? []) map[(r as any).room_id] = Number((r as any).count);
      return map;
    },
  });

  useEffect(() => {
    const ch = supabase
      .channel("rooms-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "rooms" }, () => {
        qc.invalidateQueries({ queryKey: ["rooms-list"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "room_participants" }, () => {
        qc.invalidateQueries({ queryKey: ["room-counts"] });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [qc]);

  return (
    <MobileShell title="Salas" isAdmin={isAdmin(roles.data)} balance={wallet.data ?? 0}>
      {rooms.isLoading && <p className="text-sm text-muted-foreground">Carregando salas...</p>}
      {rooms.data && rooms.data.length === 0 && (
        <Card className="bg-surface">
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            Nenhuma sala criada ainda.
          </CardContent>
        </Card>
      )}
      <ul className="space-y-3">
        {rooms.data?.map((r) => {
          const count = counts.data?.[r.id] ?? 0;
          return (
            <li key={r.id}>
              <Link to="/sala/$id" params={{ id: r.id }}>
                <Card className="bg-card glow-border hover:bg-surface transition-colors">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className="font-semibold">{r.name}</h3>
                        {r.description && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{r.description}</p>}
                        <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1"><Users className="size-3.5" /> {count}/{r.max_participants}</span>
                          <span className="text-neon font-semibold">{brl(r.entry_fee)}</span>
                        </div>
                      </div>
                      {r.status === "fechada" ? (
                        <Badge variant="secondary" className="text-[10px]"><Lock className="size-3 mr-1" />Fechada</Badge>
                      ) : (
                        <Badge className="bg-primary text-primary-foreground text-[10px]">Aberta</Badge>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </Link>
            </li>
          );
        })}
      </ul>
    </MobileShell>
  );
}
