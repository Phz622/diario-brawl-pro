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
import { Users, Trophy, Lock, Link as LinkIcon, Copy } from "lucide-react";

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

  const nicks = useQuery({
    queryKey: ["room-nicks", id],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_room_nicks", { p_room_id: id });
      if (error) throw error;
      return (data ?? []) as { user_id: string; nick: string; is_me: boolean }[];
    },
  });

  const linkQ = useQuery({
    queryKey: ["room-link", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("room_links").select("link, released").eq("room_id", id).maybeSingle();
      if (error) throw error;
      return data;
    },
    refetchInterval: 5000,
  });

  const myJoin = nicks.data?.some((p) => p.is_me) ?? false;

  useEffect(() => {
    const ch = supabase
      .channel("room-" + id)
      .on("postgres_changes", { event: "*", schema: "public", table: "rooms", filter: `id=eq.${id}` }, () => {
        qc.invalidateQueries({ queryKey: ["room", id] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "room_participants", filter: `room_id=eq.${id}` }, () => {
        qc.invalidateQueries({ queryKey: ["room-nicks", id] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "room_links", filter: `room_id=eq.${id}` }, () => {
        qc.invalidateQueries({ queryKey: ["room-link", id] });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [id, qc]);

  async function join() {
    const { error } = await supabase.rpc("join_room", { p_room_id: id });
    if (error) { toast.error(error.message); return; }
    toast.success("Inscrição confirmada!");
    qc.invalidateQueries({ queryKey: ["wallet"] });
    qc.invalidateQueries({ queryKey: ["room-nicks", id] });
    qc.invalidateQueries({ queryKey: ["room", id] });
    qc.invalidateQueries({ queryKey: ["room-counts"] });
  }

  useEffect(() => {
    if (room.data?.finished_at) {
      const t = setTimeout(() => {
        toast.success("Partida finalizada!");
        nav({ to: "/", replace: true });
      }, 1500);
      return () => clearTimeout(t);
    }
  }, [room.data?.finished_at, nav]);

  if (room.isLoading) {
    return <MobileShell isAdmin={isAdmin(roles.data)} balance={wallet.data ?? 0}><p className="text-sm text-muted-foreground">Carregando...</p></MobileShell>;
  }
  if (!room.data) {
    return <MobileShell isAdmin={isAdmin(roles.data)} balance={wallet.data ?? 0}><p className="text-sm">Sala não encontrada.</p></MobileShell>;
  }

  const r = room.data;
  const count = nicks.data?.length ?? 0;
  const canJoin = r.status === "aberta" && !myJoin && count < r.max_participants && !r.finished_at;
  const linkVisible = linkQ.data?.released && linkQ.data?.link;

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
            {r.finished_at
              ? <Badge variant="secondary"><Trophy className="size-3 mr-1" />Finalizada</Badge>
              : r.status === "fechada"
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
              {canJoin ? `Entrar — ${brl(r.entry_fee)}` : r.finished_at ? "Partida finalizada" : r.status === "fechada" ? "Inscrições fechadas" : "Sala lotada"}
            </Button>
          )}
        </CardContent>
      </Card>

      {myJoin && (
        <Card className="bg-card mt-3">
          <CardContent className="p-4 space-y-2">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <LinkIcon className="size-4 text-neon" /> Link da sala do Brawl Stars
            </div>
            {linkVisible ? (
              <div className="flex items-center justify-between gap-2 bg-surface rounded-md px-3 py-2">
                <div className="text-sm font-mono break-all min-w-0">{linkQ.data!.link}</div>
                <Button size="icon" variant="ghost" onClick={() => { navigator.clipboard.writeText(linkQ.data!.link!); toast.success("Link copiado"); }}>
                  <Copy className="size-4" />
                </Button>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">Aguardando o admin liberar o link da sala...</p>
            )}
          </CardContent>
        </Card>
      )}

      <Card className="bg-card mt-3">
        <CardContent className="p-4 space-y-2">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Users className="size-4 text-neon" /> Inscritos ({count})
          </div>
          {nicks.isLoading && <p className="text-xs text-muted-foreground">Carregando...</p>}
          {!nicks.isLoading && count === 0 && <p className="text-xs text-muted-foreground">Ninguém inscrito ainda.</p>}
          <ul className="grid grid-cols-2 gap-2">
            {nicks.data?.map((p) => (
              <li key={p.user_id} className={`text-xs px-2 py-1.5 rounded-md border ${p.is_me ? "border-primary/40 bg-primary/10 text-primary font-semibold" : "border-border bg-surface"}`}>
                @{p.nick}{p.is_me ? " (você)" : ""}
              </li>
            ))}
          </ul>
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
