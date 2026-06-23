import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { brl } from "@/lib/format";
import { Users, Wallet, Trophy, Clock } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/")({
  component: Dashboard,
});

function Dashboard() {
  const stats = useQuery({
    queryKey: ["admin-stats"],
    queryFn: async () => {
      const [users, wallets, parts, pending] = await Promise.all([
        supabase.from("profiles").select("id", { count: "exact", head: true }),
        supabase.from("wallets").select("balance"),
        supabase.from("room_participants").select("room_id", { count: "exact", head: true }),
        supabase.from("deposit_requests").select("id", { count: "exact", head: true }).eq("status", "pendente"),
      ]);
      const totalBalance = (wallets.data ?? []).reduce((s, w) => s + Number(w.balance), 0);
      return {
        users: users.count ?? 0,
        balance: totalBalance,
        inscriptions: parts.count ?? 0,
        pending: pending.count ?? 0,
      };
    },
  });

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      <StatCard icon={<Users className="size-4" />} label="Usuários" value={stats.data?.users ?? "—"} />
      <StatCard icon={<Wallet className="size-4" />} label="Saldo total" value={brl(stats.data?.balance ?? 0)} />
      <StatCard icon={<Trophy className="size-4" />} label="Inscrições" value={stats.data?.inscriptions ?? "—"} />
      <StatCard icon={<Clock className="size-4" />} label="Pedidos pendentes" value={stats.data?.pending ?? "—"} />
    </div>
  );
}

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: any }) {
  return (
    <Card className="bg-card glow-border">
      <CardContent className="p-4">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">{icon}{label}</div>
        <div className="text-2xl font-extrabold text-neon mt-1">{value}</div>
      </CardContent>
    </Card>
  );
}
