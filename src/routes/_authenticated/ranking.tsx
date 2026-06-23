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
      return (data ?? []) as { nick: string; matches_played: number }[];
    },
  });

  return (
    <MobileShell title="Ranking" isAdmin={isAdmin(roles.data)} balance={wallet.data ?? 0}>
      <Card className="bg-card glow-border">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2 text-neon">
            <Trophy className="size-4" /> Ranking de partidas
          </CardTitle>
        </CardHeader>
        <CardContent>
          {ranking.isLoading && <p className="text-xs text-muted-foreground">Carregando...</p>}
          {!ranking.isLoading && (ranking.data?.length ?? 0) === 0 && (
            <p className="text-xs text-muted-foreground">Nenhuma partida finalizada ainda.</p>
          )}
          <ol className="space-y-1.5">
            {ranking.data?.map((r, i) => (
              <li key={r.nick + i} className="flex items-center justify-between gap-3 px-3 py-2 rounded-md bg-surface">
                <div className="flex items-center gap-3 min-w-0">
                  <span className={`text-sm font-bold w-6 text-center ${i === 0 ? "text-yellow-400" : i === 1 ? "text-zinc-300" : i === 2 ? "text-amber-600" : "text-muted-foreground"}`}>
                    {i < 3 ? <Medal className="size-4 inline" /> : i + 1}
                  </span>
                  <span className="text-sm font-medium truncate">@{r.nick}</span>
                </div>
                <span className="text-sm font-semibold text-neon">{r.matches_played}</span>
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>
    </MobileShell>
  );
}
