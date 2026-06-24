import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { MobileShell } from "@/components/MobileShell";
import { useSession, useRoles, useWallet, isAdmin } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Trophy, Medal } from "lucide-react";

export const Route = createFileRoute("/_authenticated/ranking")({
  component: RankingPage,
});

function RankingPage() {
  const { user } = useSession();
  const roles = useRoles(user);
  const wallet = useWallet(user);

  const ranking = useQuery({
    queryKey: ["ranking"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_ranking", { p_limit: 100 });
      if (error) throw error;
      return (data ?? []) as { nick: string; matches_played: number; wins: number }[];
    },
  });

  return (
    <MobileShell title="Ranking" isAdmin={isAdmin(roles.data)} balance={wallet.data ?? 0}>
      <Card className="bg-card glow-border">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2 text-neon">
            <Trophy className="size-4" /> Ranking de jogadores
          </CardTitle>
        </CardHeader>
        <CardContent>
          {ranking.isLoading && <p className="text-xs text-muted-foreground">Carregando...</p>}
          {!ranking.isLoading && (ranking.data?.length ?? 0) === 0 && (
            <p className="text-xs text-muted-foreground">Nenhuma partida finalizada ainda.</p>
          )}
          <div className="grid grid-cols-[2rem_1fr_3rem_3rem] items-center gap-2 text-[10px] uppercase tracking-wider text-muted-foreground px-3 pb-1">
            <span className="text-center">#</span>
            <span>Jogador</span>
            <span className="text-right">Vit.</span>
            <span className="text-right">Part.</span>
          </div>
          <ol className="space-y-1.5">
            {ranking.data?.map((r, i) => (
              <li key={r.nick + i} className="grid grid-cols-[2rem_1fr_3rem_3rem] items-center gap-2 px-3 py-2 rounded-md bg-surface">
                <span className={`text-sm font-bold text-center ${i === 0 ? "text-yellow-400" : i === 1 ? "text-zinc-300" : i === 2 ? "text-amber-600" : "text-muted-foreground"}`}>
                  {i < 3 ? <Medal className="size-4 inline" /> : i + 1}
                </span>
                <span className="text-sm font-medium truncate">@{r.nick}</span>
                <span className="text-sm text-right font-semibold text-neon">{r.wins}</span>
                <span className="text-sm text-right text-muted-foreground">{r.matches_played}</span>
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>
    </MobileShell>
  );
}
