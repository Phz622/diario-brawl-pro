import { createFileRoute } from "@tanstack/react-router";
import { MobileShell } from "@/components/MobileShell";
import { useSession, useRoles, useWallet, useProfile, isAdmin } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_authenticated/perfil")({
  component: ProfilePage,
});

function ProfilePage() {
  const { user } = useSession();
  const roles = useRoles(user);
  const profile = useProfile(user);
  const wallet = useWallet(user);

  return (
    <MobileShell title="Perfil" isAdmin={isAdmin(roles.data)} balance={wallet.data ?? 0}>
      <Card className="bg-card glow-border">
        <CardHeader className="pb-2"><CardTitle className="text-sm">Seus dados</CardTitle></CardHeader>
        <CardContent className="space-y-3 text-sm">
          <Row label="Nome" value={profile.data?.full_name} />
          <Row label="Telefone" value={profile.data?.phone} />
          <Row label="Nick" value={profile.data?.nick} />
          <Row label="Email" value={user?.email} />
          <div className="pt-2">
            <p className="text-xs text-muted-foreground mb-1">Cargos</p>
            <div className="flex flex-wrap gap-1.5">
              {(roles.data ?? []).map((r) => <Badge key={r} variant="secondary" className="capitalize">{r.replace("_", " ")}</Badge>)}
              {(roles.data ?? []).length === 0 && <span className="text-xs text-muted-foreground">—</span>}
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground pt-3 border-t border-border">
            Para alterar nome, telefone ou nick, contate um administrador.
          </p>
        </CardContent>
      </Card>
    </MobileShell>
  );
}

function Row({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="font-medium text-right truncate">{value || "—"}</span>
    </div>
  );
}
