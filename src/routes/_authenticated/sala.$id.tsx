import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { MobileShell } from "@/components/MobileShell";
import { useSession, useRoles, useWallet, isAdmin } from "@/hooks/use-auth";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { brl } from "@/lib/format";
import { toast } from "sonner";
import { Users, Trophy, Lock } from "lucide-react";

export const Route = createFileRoute("/_authenticated/sala/$id")({
  component: RoomPage,
});

function RoomPage() {
  const { id } = Route.useParams();
  const { user } = useSession();
  const roles = useRoles(user);
  const wallet = useWallet(user);
  const qc = useQueryClient();
  const nav = useNavigate();

  const room = useQuery({
    queryKey: ["room", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("rooms").select("*").eq("id", id).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const parts = useQuery({
    queryKey: ["room-parts", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("room_participants").select("user_id, joined_at").eq("room_id", id);
      if (error) throw error;
      return data;
    },
  });

  const myJoin = parts.data?.some((p) => p.user_id === user?.id);

  useEffect(() => {
    const ch = supabase
      .channel("room-" + id)
      .on("postgres_changes", { event: "*", schema: "public", table: "rooms", filter: `id=eq.${id}` }, () => {
        qc.invalidateQueries({ queryKey: ["room", id] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "room_participants", filter: `room_id=eq.${id}` }, () => {
        qc.invalidateQueries({ queryKey: ["room-parts", id] });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [id, qc]);

  async function join() {
    const { error } = await supabase.rpc("join_room", { p_room_id: id });
    if (error) { toast.error(error.message); return; }
    toast.success("Inscrição confirmada!");
    qc.invalidateQueries({ queryKey: ["wallet"] });
    qc.invalidateQueries({ queryKey: ["room-parts", id] });
    qc.invalidateQueries({ queryKey: ["room", id] });
  }

  if (room.isLoading) {
    return <MobileShell isAdmin={isAdmin(roles.data)} balance={wallet.data ?? 0}><p className="text-sm text-muted-foreground">Carregando...</p></MobileShell>;
  }
  if (!room.data) {
    return <MobileShell isAdmin={isAdmin(roles.data)} balance={wallet.data ?? 0}><p className="text-sm">Sala não encontrada.</p></MobileShell>;
  }

  const r = room.data;
  const count = parts.data?.length ?? 0;
  const canJoin = r.status === "aberta" && !myJoin && count < r.max_participants;

  return (
    <MobileShell isAdmin={isAdmin(roles.data)} balance={wallet.data ?? 0}>
      <Button variant="ghost" size="sm" className="mb-2 -ml-2" onClick={() => nav({ to: "/" })}>← Voltar</Button>
      <Card className="bg-card glow-border">
        <CardContent className="p-4 space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h1 className="text-xl font-bold">{r.name}</h1>
              {r.description && <p className="text-sm text-muted-foreground mt-1">{r.description}</p>}
            </div>
            {r.status === "fechada"
              ? <Badge variant="secondary"><Lock className="size-3 mr-1" />Fechada</Badge>
              : <Badge className="bg-primary text-primary-foreground">Aberta</Badge>}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Stat icon={<Trophy className="size-4" />} label="Inscrição" value={brl(r.entry_fee)} />
            <Stat icon={<Users className="size-4" />} label="Participantes" value={`${count}/${r.max_participants}`} />
          </div>
          {myJoin ? (
            <div className="rounded-md bg-primary/15 border border-primary/30 p-3 text-sm text-primary font-medium text-center">
              Você está inscrito nesta sala
            </div>
          ) : (
            <Button onClick={join} disabled={!canJoin} className="w-full glow-strong">
              {canJoin ? `Entrar — ${brl(r.entry_fee)}` : r.status === "fechada" ? "Inscrições fechadas" : "Sala lotada"}
            </Button>
          )}
        </CardContent>
      </Card>
    </MobileShell>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-md bg-surface p-3">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">{icon}{label}</div>
      <div className="text-base font-bold text-neon mt-1">{value}</div>
    </div>
  );
}
