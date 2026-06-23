import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { brl, dateBR } from "@/lib/format";
import { toast } from "sonner";
import { StatusBadge } from "@/routes/_authenticated/carteira";

export const Route = createFileRoute("/_authenticated/admin/depositos")({
  component: DepositsAdmin,
});

function DepositsAdmin() {
  const [tab, setTab] = useState("pendente");
  const qc = useQueryClient();

  const list = useQuery({
    queryKey: ["admin-deposits", tab],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("deposit_requests")
        .select("*, profiles:user_id (full_name, phone, nick)")
        .eq("status", tab as any)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  async function approve(id: string) {
    const { error } = await supabase.rpc("approve_deposit", { p_id: id });
    if (error) { toast.error(error.message); return; }
    toast.success("Aprovado"); qc.invalidateQueries({ queryKey: ["admin-deposits"] });
  }
  async function reject(id: string) {
    const { error } = await supabase.rpc("reject_deposit", { p_id: id });
    if (error) { toast.error(error.message); return; }
    toast.success("Recusado"); qc.invalidateQueries({ queryKey: ["admin-deposits"] });
  }

  return (
    <Card className="bg-card">
      <CardHeader className="pb-2"><CardTitle className="text-sm">Pedidos de depósito</CardTitle></CardHeader>
      <CardContent>
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="grid grid-cols-4 w-full">
            <TabsTrigger value="pendente">Pendentes</TabsTrigger>
            <TabsTrigger value="aprovado">Aprovados</TabsTrigger>
            <TabsTrigger value="recusado">Recusados</TabsTrigger>
            <TabsTrigger value="cancelado">Cancelados</TabsTrigger>
          </TabsList>
          <TabsContent value={tab} className="mt-3 divide-y divide-border">
            {(list.data ?? []).length === 0 && <p className="text-xs text-muted-foreground py-4">Nada aqui.</p>}
            {list.data?.map((d: any) => (
              <div key={d.id} className="py-3 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-semibold text-neon">{brl(d.amount)}</div>
                  <div className="text-xs">{d.profiles?.full_name} <span className="text-muted-foreground">@{d.profiles?.nick}</span></div>
                  <div className="text-[11px] text-muted-foreground">Tel: {d.profiles?.phone} · Titular PIX: {d.pix_holder_name}</div>
                  <div className="text-[11px] text-muted-foreground">{dateBR(d.created_at)}</div>
                </div>
                <div className="flex flex-col items-end gap-1.5">
                  <StatusBadge status={d.status} />
                  {d.status === "pendente" && (
                    <div className="flex gap-1">
                      <Button size="sm" className="h-7 text-[10px]" onClick={() => approve(d.id)}>Aprovar</Button>
                      <Button size="sm" variant="destructive" className="h-7 text-[10px]" onClick={() => reject(d.id)}>Recusar</Button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
