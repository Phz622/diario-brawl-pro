import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { brl, dateBR } from "@/lib/format";
import { toast } from "sonner";
import type { AppRole } from "@/hooks/use-auth";

export const Route = createFileRoute("/_authenticated/admin/usuarios")({
  component: UsersAdmin,
});

function UsersAdmin() {
  const [q, setQ] = useState("");
  const qc = useQueryClient();

  const users = useQuery({
    queryKey: ["admin-users"],
    queryFn: async () => {
      const [{ data: profiles }, { data: wallets }, { data: roles }] = await Promise.all([
        supabase.from("profiles").select("*").order("created_at", { ascending: false }),
        supabase.from("wallets").select("user_id, balance"),
        supabase.from("user_roles").select("user_id, role"),
      ]);
      const walletMap = Object.fromEntries((wallets ?? []).map((w) => [w.user_id, Number(w.balance)]));
      const rolesMap: Record<string, AppRole[]> = {};
      for (const r of roles ?? []) {
        (rolesMap[r.user_id] = rolesMap[r.user_id] ?? []).push(r.role as AppRole);
      }
      return (profiles ?? []).map((p) => ({ ...p, balance: walletMap[p.id] ?? 0, roles: rolesMap[p.id] ?? [] }));
    },
  });

  const filtered = (users.data ?? []).filter((u) => {
    const s = q.trim().toLowerCase();
    if (!s) return true;
    return [u.full_name, u.phone, u.nick].some((v) => v?.toLowerCase().includes(s));
  });

  return (
    <Card className="bg-card">
      <CardHeader className="pb-2"><CardTitle className="text-sm">Usuários</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <Input placeholder="Buscar por nome, telefone ou nick..." value={q} onChange={(e) => setQ(e.target.value)} />
        {users.isLoading && <p className="text-xs text-muted-foreground">Carregando...</p>}
        <div className="divide-y divide-border">
          {filtered.map((u) => (
            <div key={u.id} className="py-3 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="font-medium truncate">{u.full_name} <span className="text-xs text-muted-foreground">@{u.nick}</span></div>
                <div className="text-[11px] text-muted-foreground truncate">{u.phone} · cadastro {dateBR(u.created_at)}</div>
                <div className="mt-1 flex flex-wrap gap-1">
                  {u.roles.map((r) => <Badge key={r} variant="secondary" className="text-[9px] capitalize">{r.replace("_", " ")}</Badge>)}
                </div>
              </div>
              <div className="text-right shrink-0">
                <div className="text-neon font-bold">{brl(u.balance)}</div>
                <UserActions userId={u.id} roles={u.roles} onChanged={() => qc.invalidateQueries({ queryKey: ["admin-users"] })} />
              </div>
            </div>
          ))}
          {filtered.length === 0 && !users.isLoading && <p className="text-xs text-muted-foreground py-4">Nenhum usuário.</p>}
        </div>
      </CardContent>
    </Card>
  );
}

function UserActions({ userId, roles, onChanged }: { userId: string; roles: AppRole[]; onChanged: () => void }) {
  return (
    <div className="mt-1 flex gap-1 justify-end">
      <AdjustBalanceDialog userId={userId} onDone={onChanged} />
      <ManageRolesDialog userId={userId} roles={roles} onDone={onChanged} />
    </div>
  );
}

function AdjustBalanceDialog({ userId, onDone }: { userId: string; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [delta, setDelta] = useState("");
  const [reason, setReason] = useState("");
  async function submit() {
    const d = parseFloat(delta.replace(",", "."));
    if (!isFinite(d) || d === 0) { toast.error("Valor inválido"); return; }
    const { error } = await supabase.rpc("admin_adjust_balance", { p_user_id: userId, p_delta: d, p_reason: reason || null });
    if (error) { toast.error(error.message); return; }
    toast.success("Saldo ajustado");
    setOpen(false); setDelta(""); setReason("");
    onDone();
  }
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button size="sm" variant="outline" className="h-7 text-[10px]">Ajustar saldo</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Ajustar saldo</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>Delta (use - para debitar)</Label><Input inputMode="decimal" value={delta} onChange={(e) => setDelta(e.target.value)} placeholder="ex: 50 ou -20" /></div>
          <div><Label>Motivo</Label><Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Opcional" /></div>
          <Button onClick={submit} className="w-full">Confirmar</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ManageRolesDialog({ userId, roles, onDone }: { userId: string; roles: AppRole[]; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [role, setRole] = useState<AppRole>("admin_salas");
  async function grant() {
    const { error } = await supabase.rpc("grant_role", { p_user_id: userId, p_role: role });
    if (error) { toast.error(error.message); return; }
    toast.success("Cargo concedido"); onDone();
  }
  async function revoke(r: AppRole) {
    const { error } = await supabase.rpc("revoke_role", { p_user_id: userId, p_role: r });
    if (error) { toast.error(error.message); return; }
    toast.success("Cargo removido"); onDone();
  }
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button size="sm" variant="outline" className="h-7 text-[10px]">Cargos</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Gerenciar cargos</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <p className="text-xs text-muted-foreground mb-1">Cargos atuais</p>
            <div className="flex flex-wrap gap-1">
              {roles.map((r) => (
                <Badge key={r} variant="secondary" className="capitalize cursor-pointer" onClick={() => revoke(r)}>
                  {r.replace("_", " ")} ×
                </Badge>
              ))}
              {roles.length === 0 && <span className="text-xs text-muted-foreground">—</span>}
            </div>
          </div>
          <div className="flex gap-2">
            <Select value={role} onValueChange={(v) => setRole(v as AppRole)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="admin_principal">Admin principal</SelectItem>
                <SelectItem value="admin_salas">Admin de salas</SelectItem>
                <SelectItem value="participante">Participante</SelectItem>
              </SelectContent>
            </Select>
            <Button onClick={grant}>Conceder</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
