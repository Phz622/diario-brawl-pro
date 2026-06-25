import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { MobileShell } from "@/components/MobileShell";
import { useSession, useRoles, useWallet, isAdmin } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { brl, dateBR } from "@/lib/format";
import { Copy, X } from "lucide-react";

export const Route = createFileRoute("/_authenticated/carteira")({
  component: WalletPage,
});

function WalletPage() {
  const { user } = useSession();
  const roles = useRoles(user);
  const wallet = useWallet(user);
  const qc = useQueryClient();

  const settings = useQuery({
    queryKey: ["app-settings"],
    queryFn: async () => {
      const { data, error } = await supabase.from("app_settings").select("*").eq("id", 1).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const deposits = useQuery({
    queryKey: ["my-deposits", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("deposit_requests").select("*").eq("user_id", user!.id).order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const withdrawals = useQuery({
    queryKey: ["my-withdrawals", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("withdrawal_requests").select("*").eq("user_id", user!.id).order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const txs = useQuery({
    queryKey: ["my-tx", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("wallet_transactions").select("*").eq("user_id", user!.id).order("created_at", { ascending: false }).limit(50);
      if (error) throw error;
      return data;
    },
  });

  return (
    <MobileShell title="Carteira" isAdmin={isAdmin(roles.data)} balance={wallet.data ?? 0}>
      <Card className="bg-gradient-to-br from-surface to-card glow-border mb-4">
        <CardContent className="p-5 text-center">
          <p className="text-xs text-muted-foreground uppercase tracking-widest">Saldo disponível</p>
          <p className="text-4xl font-extrabold text-neon mt-1">{brl(wallet.data ?? 0)}</p>
        </CardContent>
      </Card>

      <Tabs defaultValue="depositar" className="space-y-3">
        <TabsList className="grid grid-cols-3 w-full">
          <TabsTrigger value="depositar">Depositar</TabsTrigger>
          <TabsTrigger value="sacar">Sacar</TabsTrigger>
          <TabsTrigger value="historico">Histórico</TabsTrigger>
        </TabsList>

        <TabsContent value="depositar" className="space-y-3">
          <PixInfo pix={settings.data?.pix_key} holder={settings.data?.pix_holder_name} />
          <DepositForm onCreated={() => { deposits.refetch(); }} />
          <RequestList
            title="Meus depósitos"
            items={deposits.data ?? []}
            onCancel={async (id) => {
              const { error } = await supabase.from("deposit_requests").update({ status: "cancelado" }).eq("id", id);
              if (error) toast.error(error.message); else { toast.success("Pedido cancelado"); qc.invalidateQueries({ queryKey: ["my-deposits"] }); }
            }}
            labelAmount="Valor"
          />
        </TabsContent>

        <TabsContent value="sacar" className="space-y-3">
          <WithdrawForm
            balance={wallet.data ?? 0}
            onCreated={() => { withdrawals.refetch(); qc.invalidateQueries({ queryKey: ["wallet"] }); }}
          />
          <RequestList
            title="Meus saques"
            items={withdrawals.data ?? []}
            onCancel={async (id) => {
              const { error } = await supabase.rpc("cancel_withdrawal", { p_id: id });
              if (error) toast.error(error.message);
              else { toast.success("Pedido cancelado — valor estornado"); qc.invalidateQueries({ queryKey: ["my-withdrawals"] }); qc.invalidateQueries({ queryKey: ["wallet"] }); }
            }}
            labelAmount="Valor"
          />
        </TabsContent>

        <TabsContent value="historico">
          <Card className="bg-card"><CardHeader className="pb-2"><CardTitle className="text-sm">Histórico</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {(txs.data ?? []).length === 0 && <p className="text-xs text-muted-foreground">Sem movimentações.</p>}
              {txs.data?.map((t) => (
                <div key={t.id} className="flex items-center justify-between text-sm py-2 border-b border-border/50 last:border-0">
                  <div>
                    <div className="font-medium capitalize">{t.type.replace("_", " ")}</div>
                    <div className="text-[11px] text-muted-foreground">{t.description ?? "—"} · {dateBR(t.created_at)}</div>
                  </div>
                  <span className={Number(t.amount) >= 0 ? "text-neon font-semibold" : "text-destructive font-semibold"}>
                    {Number(t.amount) >= 0 ? "+" : ""}{brl(t.amount)}
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </MobileShell>
  );
}

function PixInfo({ pix, holder }: { pix?: string; holder?: string }) {
  return (
    <Card className="bg-surface">
      <CardContent className="p-4 space-y-2">
        <p className="text-xs text-muted-foreground">Envie o PIX para a chave abaixo e crie um pedido de depósito:</p>
        <div className="flex items-center justify-between gap-2 bg-card rounded-md px-3 py-2">
          <div className="min-w-0">
            <div className="text-[10px] text-muted-foreground">Chave PIX</div>
            <div className="text-sm font-mono truncate">{pix || "— ainda não configurada —"}</div>
          </div>
          {pix && (
            <Button size="icon" variant="ghost" onClick={() => { navigator.clipboard.writeText(pix); toast.success("Chave copiada"); }}>
              <Copy className="size-4" />
            </Button>
          )}
        </div>
        {holder && <p className="text-[11px] text-muted-foreground">Titular: <span className="text-foreground">{holder}</span></p>}
      </CardContent>
    </Card>
  );
}

function DepositForm({ onCreated }: { onCreated: () => void }) {
  const { user } = useSession();
  const [amount, setAmount] = useState("");
  const [holder, setHolder] = useState("");
  const [loading, setLoading] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const value = parseFloat(amount.replace(",", "."));
    if (!isFinite(value) || value <= 0) { toast.error("Valor inválido"); return; }
    if (holder.trim().length < 3) { toast.error("Informe o titular do PIX"); return; }
    setLoading(true);
    const { error } = await supabase.from("deposit_requests").insert({ user_id: user!.id, amount: value, pix_holder_name: holder.trim(), status: "pendente" });
    setLoading(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Pedido enviado");
    setAmount(""); setHolder("");
    onCreated();
  }
  return (
    <Card className="bg-card">
      <CardHeader className="pb-2"><CardTitle className="text-sm">Solicitar depósito</CardTitle></CardHeader>
      <CardContent>
        <form className="space-y-3" onSubmit={submit}>
          <div>
            <Label htmlFor="dep-amount">Valor (R$)</Label>
            <Input id="dep-amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0,00" required />
          </div>
          <div>
            <Label htmlFor="dep-holder">Nome do titular do PIX usado</Label>
            <Input id="dep-holder" value={holder} onChange={(e) => setHolder(e.target.value)} required />
          </div>
          <Button type="submit" disabled={loading} className="w-full">Enviar pedido</Button>
        </form>
      </CardContent>
    </Card>
  );
}

function WithdrawForm({ balance, pendingTotal, onCreated }: { balance: number; pendingTotal: number; onCreated: () => void }) {
  const { user } = useSession();
  const [amount, setAmount] = useState("");
  const [pix, setPix] = useState("");
  const [loading, setLoading] = useState(false);
  const available = Math.max(0, balance - pendingTotal);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const value = parseFloat(amount.replace(",", "."));
    if (!isFinite(value) || value <= 0) { toast.error("Valor inválido"); return; }
    if (value > available) {
      toast.error(`Você só pode sacar até ${brl(available)} (descontando saques pendentes).`);
      return;
    }
    if (pix.trim().length < 3) { toast.error("Informe sua chave PIX"); return; }
    setLoading(true);
    const { error } = await supabase.from("withdrawal_requests").insert({ user_id: user!.id, amount: value, pix_key: pix.trim(), status: "pendente" });
    setLoading(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Pedido enviado");
    setAmount(""); setPix("");
    onCreated();
  }
  return (
    <Card className="bg-card">
      <CardHeader className="pb-2"><CardTitle className="text-sm">Solicitar saque</CardTitle></CardHeader>
      <CardContent>
        <form className="space-y-3" onSubmit={submit}>
          <div className="rounded-md bg-surface/70 border border-border/60 p-2 text-[11px] text-muted-foreground flex items-center justify-between">
            <span>Disponível para saque</span>
            <span className="text-neon font-semibold">{brl(available)}</span>
          </div>
          <div>
            <Label htmlFor="w-amount">Valor (R$)</Label>
            <Input
              id="w-amount"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              max={available}
              placeholder={`Máx. ${brl(available)}`}
              required
            />
            <div className="mt-1 flex gap-1">
              <Button type="button" size="sm" variant="outline" className="h-6 text-[10px] flex-1" onClick={() => setAmount(available.toFixed(2).replace(".", ","))}>
                Sacar tudo
              </Button>
            </div>
          </div>
          <div>
            <Label htmlFor="w-pix">Sua chave PIX</Label>
            <Input id="w-pix" value={pix} onChange={(e) => setPix(e.target.value)} required />
          </div>
          <Button type="submit" disabled={loading || available <= 0} className="w-full">
            {available <= 0 ? "Sem saldo disponível" : "Enviar pedido"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function RequestList({ title, items, onCancel }: { title: string; items: any[]; onCancel: (id: string) => void; labelAmount: string }) {
  return (
    <Card className="bg-card">
      <CardHeader className="pb-2"><CardTitle className="text-sm">{title}</CardTitle></CardHeader>
      <CardContent className="space-y-2">
        {items.length === 0 && <p className="text-xs text-muted-foreground">Nenhum pedido.</p>}
        {items.map((d) => (
          <div key={d.id} className="flex items-center justify-between text-sm py-2 border-b border-border/50 last:border-0">
            <div>
              <div className="font-semibold text-neon">{brl(d.amount)}</div>
              <div className="text-[11px] text-muted-foreground">{dateBR(d.created_at)}</div>
            </div>
            <div className="flex items-center gap-2">
              <StatusBadge status={d.status} />
              {d.status === "pendente" && (
                <Button size="icon" variant="ghost" onClick={() => onCancel(d.id)} aria-label="Cancelar">
                  <X className="size-4" />
                </Button>
              )}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    pendente: "bg-warning/20 text-warning border border-warning/30",
    aprovado: "bg-primary/20 text-primary border border-primary/30",
    recusado: "bg-destructive/20 text-destructive border border-destructive/30",
    cancelado: "bg-muted text-muted-foreground border border-border",
  };
  return <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium capitalize ${map[status] ?? ""}`}>{status}</span>;
}
