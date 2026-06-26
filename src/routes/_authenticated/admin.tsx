import { createFileRoute, Outlet, Link, useRouter } from "@tanstack/react-router";
import { useSession, useRoles, isAdmin, isMainAdmin } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, LogOut, LayoutDashboard, Users, ArrowDownToLine, ArrowUpFromLine, Trophy, Settings, ScrollText } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin")({
  component: AdminLayout,
});

function AdminLayout() {
  const { user, loading } = useSession();
  const roles = useRoles(user);
  const router = useRouter();
  const qc = useQueryClient();

  if (loading || roles.isLoading) {
    return <div className="min-h-screen flex items-center justify-center text-sm text-muted-foreground">Carregando...</div>;
  }
  if (!isAdmin(roles.data)) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 text-center">
        <div>
          <h2 className="text-lg font-bold">Acesso negado</h2>
          <p className="text-sm text-muted-foreground mt-1">Você não tem permissão para acessar esta área.</p>
          <Button asChild className="mt-4"><Link to="/">Voltar</Link></Button>
        </div>
      </div>
    );
  }

  const main = isMainAdmin(roles.data);

  async function signOut() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    router.navigate({ to: "/auth", replace: true });
  }

  return (
    <div className="min-h-screen flex flex-col">
      <header className="sticky top-0 z-30 backdrop-blur-md bg-background/80 border-b border-border">
        <div className="mx-auto max-w-5xl px-4 py-3 flex items-center gap-3">
          <Link to="/" className="text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" /></Link>
          <span className="font-bold text-neon">Painel Admin</span>
          <button onClick={signOut} className="ml-auto text-muted-foreground hover:text-foreground p-1.5"><LogOut className="size-4" /></button>
        </div>
        <nav className="mx-auto max-w-5xl px-2 overflow-x-auto">
          <div className="flex gap-1 pb-2 min-w-max">
            <Tab to="/admin" exact icon={<LayoutDashboard className="size-3.5" />}>Dashboard</Tab>
            <Tab to="/admin/salas" icon={<Trophy className="size-3.5" />}>Salas</Tab>
            {main && <Tab to="/admin/usuarios" icon={<Users className="size-3.5" />}>Usuários</Tab>}
            {main && <Tab to="/admin/depositos" icon={<ArrowDownToLine className="size-3.5" />}>Depósitos</Tab>}
            {main && <Tab to="/admin/saques" icon={<ArrowUpFromLine className="size-3.5" />}>Saques</Tab>}
            {main && <Tab to="/admin/logs" icon={<ScrollText className="size-3.5" />}>Logs</Tab>}
            {main && <Tab to="/admin/configuracoes" icon={<Settings className="size-3.5" />}>Configurações</Tab>}
          </div>
        </nav>
      </header>
      <main className="mx-auto max-w-5xl w-full px-4 py-4"><Outlet /></main>
    </div>
  );
}

function Tab({ to, exact, icon, children }: { to: string; exact?: boolean; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <Link
      to={to}
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-surface whitespace-nowrap"
      activeProps={{ className: "text-primary-foreground bg-primary glow-strong" }}
      activeOptions={{ exact }}
    >
      {icon}{children}
    </Link>
  );
}
