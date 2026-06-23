import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { useSession, useRoles, isMainAdmin } from "@/hooks/use-auth";
import { brl } from "@/lib/format";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { Plus, Lock, Unlock, Pencil, Trash2, Users, Link as LinkIcon, Flag } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/salas")({
  component: RoomsAdmin,
});

function RoomsAdmin() {
  const qc = useQueryClient();
  const { user } = useSession();
  const roles = useRoles(user);
  const main = isMainAdmin(roles.data);

  const rooms = useQuery({
    queryKey: ["admin-rooms"],
    queryFn: async () => {
      const { data, error } = await supabase.from("rooms").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const counts = useQuery({
    queryKey: ["admin-room-counts"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_room_counts");
      if (error) throw error;
      const map: Record<string, number> = {};
      for (const r of data ?? []) map[(r as any).room_id] = Number((r as any).count);
      return map;
    },
    refetchInterval: 10000,
  });

  async function toggleStatus(id: string, status: "aberta" | "fechada") {
    const next = status === "aberta" ? "fechada" : "aberta";
    const { error } = await supabase.from("rooms").update({ status: next }).eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success(`Inscrições ${next === "aberta" ? "abertas" : "fechadas"}`);
    qc.invalidateQueries({ queryKey: ["admin-rooms"] });
  }

  async function remove(id: string) {
    if (!confirm("Excluir esta sala?")) return;
    const { error } = await supabase.from("rooms").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Sala excluída"); qc.invalidateQueries({ queryKey: ["admin-rooms"] });
  }

  return (
    <Card className="bg-card">
      <CardHeader className="pb-2 flex flex-row items-center justify-between">
        <CardTitle className="text-sm">Salas</CardTitle>
        <RoomFormDialog onSaved={() => qc.invalidateQueries({ queryKey: ["admin-rooms"] })} trigger={<Button size="sm"><Plus className="size-3.5 mr-1" />Nova sala</Button>} />
      </CardHeader>
      <CardContent className="space-y-2">
        {rooms.data?.length === 0 && <p className="text-xs text-muted-foreground py-4">Nenhuma sala.</p>}
        {rooms.data?.map((r) => (
          <div key={r.id} className="rounded-md border border-border bg-surface p-3 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold">{r.name}</span>
                  {r.finished_at
                    ? <Badge variant="secondary"><Flag className="size-3 mr-1" />Finalizada</Badge>
                    : r.status === "fechada"
                      ? <Badge variant="secondary"><Lock className="size-3 mr-1" />Fechada</Badge>
                      : <Badge className="bg-primary text-primary-foreground"><Unlock className="size-3 mr-1" />Aberta</Badge>}
                </div>
                <div className="text-xs text-muted-foreground mt-1 flex items-center gap-2">
                  <span className="text-neon font-semibold">{brl(r.entry_fee)}</span>
                  <span className="flex items-center gap-1"><Users className="size-3" />{counts.data?.[r.id] ?? 0}/{r.max_participants}</span>
                </div>
              </div>
              <div className="flex gap-1 flex-wrap justify-end">
                {!r.finished_at && (
                  <Button size="icon" variant="outline" className="size-7" title={r.status === "aberta" ? "Fechar inscrições" : "Abrir inscrições"} onClick={() => toggleStatus(r.id, r.status as any)}>
                    {r.status === "aberta" ? <Lock className="size-3.5" /> : <Unlock className="size-3.5" />}
                  </Button>
                )}
                <RoomFormDialog room={r} onSaved={() => qc.invalidateQueries({ queryKey: ["admin-rooms"] })}
                  trigger={<Button size="icon" variant="outline" className="size-7" title="Editar"><Pencil className="size-3.5" /></Button>} />
                <ParticipantsDialog roomId={r.id} roomName={r.name} canRemove={main} />
                {!r.finished_at && (
                  <Button size="icon" variant="outline" className="size-7" title="Finalizar partida" onClick={() => finalize(r.id)}>
                    <Flag className="size-3.5 text-neon" />
                  </Button>
                )}
                {main && <Button size="icon" variant="outline" className="size-7" title="Excluir" onClick={() => remove(r.id)}><Trash2 className="size-3.5" /></Button>}
              </div>
            </div>
            <InlineParticipants roomId={r.id} />
            <RoomLinkPanel roomId={r.id} />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function RoomFormDialog({ room, onSaved, trigger }: { room?: any; onSaved: () => void; trigger: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(room?.name ?? "");
  const [fee, setFee] = useState(room?.entry_fee?.toString() ?? "");
  const [max, setMax] = useState(room?.max_participants?.toString() ?? "");
  const [desc, setDesc] = useState(room?.description ?? "");

  async function save() {
    const feeN = parseFloat(fee.replace(",", "."));
    const maxN = parseInt(max);
    if (!name.trim() || !isFinite(feeN) || feeN < 0 || !isFinite(maxN) || maxN < 1) { toast.error("Dados inválidos"); return; }
    const payload = { name: name.trim(), entry_fee: feeN, max_participants: maxN, description: desc.trim() || null };
    const op = room
      ? supabase.from("rooms").update(payload).eq("id", room.id)
      : supabase.from("rooms").insert({ ...payload, status: "aberta" });
    const { error } = await op;
    if (error) { toast.error(error.message); return; }
    toast.success(room ? "Sala atualizada" : "Sala criada");
    setOpen(false); onSaved();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>{room ? "Editar sala" : "Nova sala"}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>Nome</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Valor inscrição (R$)</Label><Input inputMode="decimal" value={fee} onChange={(e) => setFee(e.target.value)} /></div>
            <div><Label>Máx. participantes</Label><Input inputMode="numeric" value={max} onChange={(e) => setMax(e.target.value)} /></div>
          </div>
          <div><Label>Descrição</Label><Textarea value={desc} onChange={(e) => setDesc(e.target.value)} rows={3} /></div>
          <Button onClick={save} className="w-full">Salvar</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ParticipantsDialog({ roomId, roomName, canRemove }: { roomId: string; roomName: string; canRemove: boolean }) {
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();
  const list = useQuery({
    queryKey: ["room-parts-admin", roomId],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase.from("room_participants").select("user_id, joined_at").eq("room_id", roomId);
      if (error) throw error;
      const ids = (data ?? []).map((d) => d.user_id);
      let profiles: Record<string, any> = {};
      if (ids.length) {
        const { data: ps, error: pe } = await supabase
          .from("profiles").select("id, full_name, nick, phone").in("id", ids);
        if (pe) throw pe;
        for (const p of ps ?? []) profiles[p.id] = p;
      }
      return (data ?? []).map((d) => ({ ...d, profiles: profiles[d.user_id] })) as any[];
    },
  });

  async function remove(userId: string, refund: boolean) {
    const { error } = await supabase.rpc("admin_remove_participant", { p_room_id: roomId, p_user_id: userId, p_refund: refund });
    if (error) { toast.error(error.message); return; }
    toast.success("Removido"); qc.invalidateQueries({ queryKey: ["room-parts-admin", roomId] });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button size="icon" variant="outline" className="size-7"><Users className="size-3.5" /></Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Inscritos — {roomName}</DialogTitle></DialogHeader>
        <div className="max-h-96 overflow-y-auto divide-y divide-border">
          {(list.data ?? []).length === 0 && <p className="text-xs text-muted-foreground py-4">Nenhum inscrito.</p>}
          {list.data?.map((p) => (
            <div key={p.user_id} className="py-2 flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="text-sm font-medium truncate">{p.profiles?.full_name} <span className="text-xs text-muted-foreground">@{p.profiles?.nick}</span></div>
                <div className="text-[11px] text-muted-foreground">{p.profiles?.phone}</div>
              </div>
              {canRemove && (
                <div className="flex gap-1">
                  <Button size="sm" variant="outline" className="h-7 text-[10px]" onClick={() => remove(p.user_id, true)}>Remover + reembolso</Button>
                  <Button size="sm" variant="destructive" className="h-7 text-[10px]" onClick={() => remove(p.user_id, false)}>Remover</Button>
                </div>
              )}
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function InlineParticipants({ roomId }: { roomId: string }) {
  const list = useQuery({
    queryKey: ["admin-room-nicks", roomId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_room_nicks", { p_room_id: roomId });
      if (error) throw error;
      return (data ?? []) as { user_id: string; nick: string; is_me: boolean }[];
    },
    refetchInterval: 15000,
  });
  const items = list.data ?? [];
  return (
    <div className="rounded-md bg-card/60 border border-border/60 p-2">
      <div className="flex items-center gap-2 text-xs font-semibold text-neon mb-1">
        <Users className="size-3.5" /> Inscritos ({items.length})
      </div>
      {items.length === 0 ? (
        <p className="text-[11px] text-muted-foreground">Nenhum inscrito ainda.</p>
      ) : (
        <div className="flex flex-wrap gap-1">
          {items.map((p) => (
            <Badge key={p.user_id} variant="outline" className="text-[10px] font-mono">@{p.nick}</Badge>
          ))}
        </div>
      )}
    </div>
  );
}

function RoomLinkPanel({ roomId }: { roomId: string }) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["admin-room-link", roomId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_room_link_admin", { p_room_id: roomId });
      if (error) throw error;
      const row = (data ?? [])[0] as { link: string | null; released: boolean } | undefined;
      return row ?? { link: "", released: false };
    },
  });
  const [link, setLink] = useState<string>("");
  const [edited, setEdited] = useState(false);

  const current = q.data?.link ?? "";
  const released = q.data?.released ?? false;
  const value = edited ? link : current;

  async function save() {
    const { error } = await supabase.rpc("set_room_link", { p_room_id: roomId, p_link: value });
    if (error) { toast.error(error.message); return; }
    toast.success("Link salvo"); setEdited(false);
    qc.invalidateQueries({ queryKey: ["admin-room-link", roomId] });
  }
  async function toggle(v: boolean) {
    const { error } = await supabase.rpc("release_room_link", { p_room_id: roomId, p_released: v });
    if (error) { toast.error(error.message); return; }
    toast.success(v ? "Link liberado para participantes" : "Link ocultado");
    qc.invalidateQueries({ queryKey: ["admin-room-link", roomId] });
  }

  return (
    <div className="rounded-md bg-card/60 border border-border/60 p-2 space-y-2">
      <div className="flex items-center gap-2 text-xs font-semibold text-neon">
        <LinkIcon className="size-3.5" /> Link da sala (Brawl Stars)
      </div>
      <div className="flex gap-1">
        <Input
          value={value}
          onChange={(e) => { setLink(e.target.value); setEdited(true); }}
          placeholder="Cole aqui o link da sala"
          className="h-8 text-xs"
        />
        <Button size="sm" className="h-8" onClick={save} disabled={!edited}>Salvar</Button>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-[11px] text-muted-foreground">
          {released ? "Liberado para participantes" : "Oculto (apenas admins)"}
        </span>
        <div className="flex items-center gap-2">
          <span className="text-[11px]">Liberar</span>
          <Switch checked={released} onCheckedChange={toggle} disabled={!current && !edited} />
        </div>
      </div>
    </div>
  );
}
