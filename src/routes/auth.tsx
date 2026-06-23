import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Shield, Zap } from "lucide-react";

export const Route = createFileRoute("/auth")({
  ssr: false,
  component: AuthPage,
});

const ADMIN_DOMAIN = "diariobrawl.app";

function toAdminEmail(username: string) {
  return `${username.trim().toLowerCase()}@${ADMIN_DOMAIN}`;
}

function isEmail(s: string) {
  return /\S+@\S+\.\S+/.test(s);
}

function AuthPage() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<"login" | "signup">("login");

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/", replace: true });
    });
  }, [navigate]);

  return (
    <div className="min-h-screen neon-grid-bg flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-surface glow-border text-xs text-neon font-semibold mb-3">
            <Zap className="size-3.5" /> Plataforma de campeonatos
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight text-neon">Diário Brawl Pro</h1>
          <p className="text-sm text-muted-foreground mt-1">Entre para gerenciar suas salas e saldo R$.</p>
        </div>

        <Card className="bg-card/80 backdrop-blur-md glow-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Acessar conta</CardTitle>
          </CardHeader>
          <CardContent>
            <Tabs value={tab} onValueChange={(v) => setTab(v as "login" | "signup")}>
              <TabsList className="grid grid-cols-2 w-full mb-4">
                <TabsTrigger value="login">Entrar</TabsTrigger>
                <TabsTrigger value="signup">Cadastrar</TabsTrigger>
              </TabsList>
              <TabsContent value="login"><LoginForm /></TabsContent>
              <TabsContent value="signup"><SignupForm onDone={() => setTab("login")} /></TabsContent>
            </Tabs>
          </CardContent>
        </Card>

        <p className="text-[11px] text-muted-foreground text-center mt-4 flex items-center justify-center gap-1">
          <Shield className="size-3" /> Admin principal: digite seu usuário (sem @) no campo de email.
        </p>
      </div>
    </div>
  );
}

function LoginForm() {
  const navigate = useNavigate();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const email = isEmail(identifier) ? identifier.trim().toLowerCase() : toAdminEmail(identifier);
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      toast.success("Bem-vindo!");
      navigate({ to: "/", replace: true });
    } catch (err: any) {
      toast.error(err.message ?? "Falha ao entrar");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <div>
        <Label htmlFor="identifier">Email ou usuário admin</Label>
        <Input id="identifier" value={identifier} onChange={(e) => setIdentifier(e.target.value)} placeholder="seuemail@exemplo.com" required autoComplete="username" />
      </div>
      <div>
        <Label htmlFor="password">Senha</Label>
        <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" />
      </div>
      <Button type="submit" disabled={loading} className="w-full glow-strong">{loading ? "Entrando..." : "Entrar"}</Button>
    </form>
  );
}

const signupSchema = z.object({
  full_name: z.string().trim().min(3, "Nome completo obrigatório").max(120),
  phone: z.string().trim().min(8, "Telefone inválido").max(20),
  nick: z.string().trim().min(2, "Nick obrigatório").max(40),
  email: z.string().trim().email("Email inválido").max(160),
  password: z.string().min(6, "Senha precisa de 6+ caracteres").max(100),
});

function SignupForm({ onDone }: { onDone: () => void }) {
  const [form, setForm] = useState({ full_name: "", phone: "", nick: "", email: "", password: "" });
  const [loading, setLoading] = useState(false);

  function set<K extends keyof typeof form>(k: K, v: string) { setForm((f) => ({ ...f, [k]: v })); }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const parsed = signupSchema.parse(form);
      // pre-check duplicates via RLS-friendly RPC? Use direct table — anyone can fail and we surface.
      const { error } = await supabase.auth.signUp({
        email: parsed.email.toLowerCase(),
        password: parsed.password,
        options: {
          emailRedirectTo: typeof window !== "undefined" ? window.location.origin : undefined,
          data: { full_name: parsed.full_name, phone: parsed.phone, nick: parsed.nick },
        },
      });
      if (error) {
        if (error.message?.toLowerCase().includes("duplicate") || error.message?.toLowerCase().includes("unique")) {
          throw new Error("Já existe uma conta com este nome, telefone ou nick.");
        }
        throw error;
      }
      toast.success("Conta criada! Faça login.");
      onDone();
    } catch (err: any) {
      toast.error(err.message ?? "Erro ao criar conta");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <div>
        <Label htmlFor="full_name">Nome completo</Label>
        <Input id="full_name" value={form.full_name} onChange={(e) => set("full_name", e.target.value)} required />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor="phone">Telefone</Label>
          <Input id="phone" inputMode="tel" value={form.phone} onChange={(e) => set("phone", e.target.value)} required placeholder="(11) 90000-0000" />
        </div>
        <div>
          <Label htmlFor="nick">Nick Brawl Stars</Label>
          <Input id="nick" value={form.nick} onChange={(e) => set("nick", e.target.value)} required />
        </div>
      </div>
      <div>
        <Label htmlFor="email">Email</Label>
        <Input id="email" type="email" value={form.email} onChange={(e) => set("email", e.target.value)} required autoComplete="email" />
      </div>
      <div>
        <Label htmlFor="password">Senha</Label>
        <Input id="password" type="password" value={form.password} onChange={(e) => set("password", e.target.value)} required autoComplete="new-password" />
      </div>
      <p className="text-[11px] text-muted-foreground">Após criar, esses dados só podem ser alterados pelo admin.</p>
      <Button type="submit" disabled={loading} className="w-full glow-strong">{loading ? "Criando..." : "Criar conta"}</Button>
    </form>
  );
}
