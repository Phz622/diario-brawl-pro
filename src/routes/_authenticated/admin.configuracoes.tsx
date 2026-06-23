import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/admin/configuracoes")({
  component: SettingsAdmin,
});

function SettingsAdmin() {
  const settings = useQuery({
    queryKey: ["app-settings"],
    queryFn: async () => {
      const { data, error } = await supabase.from("app_settings").select("*").eq("id", 1).maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  const [pix, setPix] = useState("");
  const [holder, setHolder] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (settings.data) { setPix(settings.data.pix_key ?? ""); setHolder(settings.data.pix_holder_name ?? ""); }
  }, [settings.data]);

  async function save() {
    setSaving(true);
    const { error } = await supabase.rpc("update_app_settings", { p_pix_key: pix, p_pix_holder: holder });
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Configurações salvas");
    settings.refetch();
  }

  return (
    <Card className="bg-card max-w-lg">
      <CardHeader className="pb-2"><CardTitle className="text-sm">Configurações de pagamento</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <div><Label>Chave PIX</Label><Input value={pix} onChange={(e) => setPix(e.target.value)} /></div>
        <div><Label>Nome do titular do PIX</Label><Input value={holder} onChange={(e) => setHolder(e.target.value)} /></div>
        <Button onClick={save} disabled={saving} className="w-full glow-strong">{saving ? "Salvando..." : "Salvar"}</Button>
      </CardContent>
    </Card>
  );
}
