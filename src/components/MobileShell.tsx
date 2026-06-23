import { Link, useRouter } from "@tanstack/react-router";
import { Home, Wallet, User, Shield, LogOut } from "lucide-react";
import type { ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";

export function MobileShell({
  children,
  title,
  isAdmin,
  balance,
}: {
  children: ReactNode;
  title?: string;
  isAdmin?: boolean;
  balance?: number;
}) {
  const router = useRouter();
  const qc = useQueryClient();

  async function signOut() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    router.navigate({ to: "/auth", replace: true });
  }

  return (
    <div className="min-h-screen flex flex-col">
      <header className="sticky top-0 z-30 backdrop-blur-md bg-background/80 border-b border-border">
        <div className="mx-auto max-w-6xl px-4 md:px-8 py-3 flex items-center gap-3">
          <Link to="/" className="font-bold tracking-tight text-neon text-lg md:text-xl">
            Diário Brawl Pro
          </Link>
          <nav className="hidden md:flex items-center gap-1 ml-6">
            <DesktopNavItem to="/" icon={<Home className="size-4" />} label="Salas" />
            <DesktopNavItem to="/carteira" icon={<Wallet className="size-4" />} label="Carteira" />
            <DesktopNavItem to="/perfil" icon={<User className="size-4" />} label="Perfil" />
          </nav>
          <div className="ml-auto flex items-center gap-2">
            {typeof balance === "number" && (
              <span className="text-xs md:text-sm px-2.5 py-1 rounded-full glow-border bg-surface text-neon font-semibold">
                R$ {balance.toFixed(2).replace(".", ",")}
              </span>
            )}
            <button
              onClick={signOut}
              className="text-muted-foreground hover:text-foreground p-1.5 rounded-md"
              aria-label="Sair"
            >
              <LogOut className="size-4" />
            </button>
          </div>
        </div>
        {isAdmin && (
          <div className="bg-primary/15 border-t border-primary/30">
            <div className="mx-auto max-w-6xl px-4 md:px-8 py-2 flex items-center justify-between gap-3">
              <span className="text-xs text-primary font-medium flex items-center gap-1.5">
                <Shield className="size-3.5" /> Conta de administrador
              </span>
              <Button asChild size="sm" variant="default" className="h-7 px-3 text-xs glow-strong">
                <Link to="/admin">Painel Admin</Link>
              </Button>
            </div>
          </div>
        )}
        {title && (
          <div className="mx-auto max-w-6xl px-4 md:px-8 pb-3">
            <h1 className="text-xl md:text-2xl font-bold tracking-tight">{title}</h1>
          </div>
        )}
      </header>

      <main className="flex-1 mx-auto max-w-6xl w-full px-4 md:px-8 py-4 md:py-8 pb-24 md:pb-8">{children}</main>

      <nav className="md:hidden fixed bottom-0 inset-x-0 z-30 border-t border-border bg-background/95 backdrop-blur-md">
        <div className="mx-auto max-w-xl grid grid-cols-3">
          <NavItem to="/" icon={<Home className="size-5" />} label="Salas" />
          <NavItem to="/carteira" icon={<Wallet className="size-5" />} label="Carteira" />
          <NavItem to="/perfil" icon={<User className="size-5" />} label="Perfil" />
        </div>
      </nav>
    </div>
  );
}

function NavItem({ to, icon, label }: { to: string; icon: ReactNode; label: string }) {
  return (
    <Link
      to={to}
      className="flex flex-col items-center justify-center py-3 text-muted-foreground hover:text-foreground"
      activeProps={{ className: "text-neon" }}
      activeOptions={{ exact: to === "/" }}
    >
      {icon}
      <span className="text-[10px] mt-0.5 font-medium">{label}</span>
    </Link>
  );
}

function DesktopNavItem({ to, icon, label }: { to: string; icon: ReactNode; label: string }) {
  return (
    <Link
      to={to}
      className="flex items-center gap-2 px-3 py-1.5 rounded-md text-sm text-muted-foreground hover:text-foreground hover:bg-surface transition-colors"
      activeProps={{ className: "text-neon bg-surface" }}
      activeOptions={{ exact: to === "/" }}
    >
      {icon}
      <span className="font-medium">{label}</span>
    </Link>
  );
}
