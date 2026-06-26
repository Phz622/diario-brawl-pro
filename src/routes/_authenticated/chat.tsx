import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { MobileShell } from "@/components/MobileShell";
import { useRoles, useSession, useWallet, isAdmin } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { ImagePlus, MessageCircle, Send, Star } from "lucide-react";

export const Route = createFileRoute("/_authenticated/chat")({ component: ChatPage });

type ThreadMode = "public" | "private";

function ChatPage() {
  const { user } = useSession();
  const roles = useRoles(user);
  const wallet = useWallet(user);
  const qc = useQueryClient();
  const [mode, setMode] = useState<ThreadMode>("public");
  const [threadId, setThreadId] = useState("");
  const [selectedAdmin, setSelectedAdmin] = useState("");

  const admins = useQuery({
    queryKey: ["chat-admins"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_chat_admins");
      if (error) throw error;
      return data ?? [];
    },
  });

  const privateThreads = useQuery({
    queryKey: ["chat-private-threads", user?.id],
    enabled: !!user && isAdmin(roles.data),
    queryFn: async () => {
      const { data, error } = await supabase.from("chat_threads").select("*").eq("type", "private").order("updated_at", { ascending: false });
      if (error) throw error;
      const ids = Array.from(new Set((data ?? []).flatMap((t) => [t.participant_id, t.admin_id]).filter(Boolean))) as string[];
      const profiles: Record<string, any> = {};
      if (ids.length) {
        const { data: ps } = await supabase.from("profiles").select("id, nick, full_name").in("id", ids);
        for (const p of ps ?? []) profiles[p.id] = p;
      }
      return (data ?? []).map((t) => ({ ...t, participant: t.participant_id ? profiles[t.participant_id] : null, admin: t.admin_id ? profiles[t.admin_id] : null }));
    },
    refetchInterval: 10000,
  });

  useEffect(() => {
    if (mode !== "public") return;
    supabase.rpc("get_or_create_public_chat").then(({ data, error }) => {
      if (error) toast.error(error.message); else setThreadId(data ?? "");
    });
  }, [mode]);

  async function openPrivate(adminId: string) {
    setSelectedAdmin(adminId);
    setMode("private");
    const { data, error } = await supabase.rpc("get_or_create_private_chat", { p_admin_id: adminId });
    if (error) { toast.error(error.message); return; }
    setThreadId(data ?? "");
  }

  function openThread(id: string) { setMode("private"); setThreadId(id); }

  useEffect(() => {
    const ch = supabase.channel("chat-page")
      .on("postgres_changes", { event: "*", schema: "public", table: "chat_messages" }, () => qc.invalidateQueries({ queryKey: ["chat-messages", threadId] }))
      .on("postgres_changes", { event: "*", schema: "public", table: "chat_threads" }, () => qc.invalidateQueries({ queryKey: ["chat-private-threads", user?.id] }))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [qc, threadId, user?.id]);

  return (
    <MobileShell title="Chat" isAdmin={isAdmin(roles.data)} balance={wallet.data ?? 0}>
      <div className="grid md:grid-cols-[280px_1fr] gap-3">
        <Card className="bg-card glow-border"><CardContent className="p-3 space-y-3">
          <Tabs value={mode} onValueChange={(v) => { setMode(v as ThreadMode); if (v === "public") setSelectedAdmin(""); }}>
            <TabsList className="grid grid-cols-2 w-full"><TabsTrigger value="public">Público</TabsTrigger><TabsTrigger value="private">Privado</TabsTrigger></TabsList>
          </Tabs>
          {mode === "private" && !isAdmin(roles.data) && <div className="space-y-1"><p className="text-xs text-muted-foreground">Escolha o admin para chamar:</p>{admins.data?.map((a) => <Button key={a.user_id} variant={selectedAdmin === a.user_id ? "default" : "outline"} size="sm" className="w-full justify-start" onClick={() => openPrivate(a.user_id)}>{a.is_owner && <Star className="size-3 text-yellow-300 fill-yellow-300 mr-1" />}@{a.nick}</Button>)}</div>}
          {mode === "private" && isAdmin(roles.data) && <div className="space-y-1"><p className="text-xs text-muted-foreground">Conversas privadas:</p>{privateThreads.data?.map((t) => <Button key={t.id} variant={threadId === t.id ? "default" : "outline"} size="sm" className="w-full justify-start" onClick={() => openThread(t.id)}>@{t.participant?.nick ?? "participante"}</Button>)}</div>}
          {mode === "public" && <p className="text-xs text-muted-foreground flex gap-1"><MessageCircle className="size-3" />Chat liberado para todos. Mensagens somem em 12h.</p>}
        </CardContent></Card>
        <ChatWindow threadId={threadId} userId={user?.id ?? ""} />
      </div>
    </MobileShell>
  );
}

function ChatWindow({ threadId, userId }: { threadId: string; userId: string }) {
  const qc = useQueryClient();
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const messages = useQuery({
    queryKey: ["chat-messages", threadId], enabled: !!threadId,
    queryFn: async () => {
      const { data, error } = await supabase.from("chat_messages").select("*").eq("thread_id", threadId).order("created_at", { ascending: true });
      if (error) throw error;
      const senderIds = Array.from(new Set((data ?? []).map((m) => m.sender_id)));
      const profiles: Record<string, any> = {};
      if (senderIds.length) { const { data: ps } = await supabase.from("profiles").select("id, nick").in("id", senderIds); for (const p of ps ?? []) profiles[p.id] = p; }
      const paths = (data ?? []).map((m) => m.image_path).filter(Boolean) as string[];
      const urls: Record<string, string> = {};
      if (paths.length) { const { data: signed } = await supabase.storage.from("chat-images").createSignedUrls(paths, 3600); for (const s of signed ?? []) if (s.path && s.signedUrl) urls[s.path] = s.signedUrl; }
      return (data ?? []).map((m) => ({ ...m, sender: profiles[m.sender_id], imageUrl: m.image_path ? urls[m.image_path] : null }));
    }, refetchInterval: 4000,
  });

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages.data?.length]);

  async function send() {
    if (!threadId) { toast.error("Abra uma conversa primeiro"); return; }
    if (!text.trim() && !file) return;
    if (file && file.size > 10 * 1024 * 1024) { toast.error("Imagem maior que 10MB"); return; }
    setSending(true);
    let imagePath: string | null = null;
    if (file) {
      imagePath = `${userId}/${threadId}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "-")}`;
      const { error } = await supabase.storage.from("chat-images").upload(imagePath, file, { contentType: file.type });
      if (error) { setSending(false); toast.error(error.message); return; }
    }
    const { error } = await supabase.rpc("send_chat_message", { p_thread_id: threadId, p_body: text, p_image_path: imagePath, p_image_name: file?.name ?? null, p_image_size: file?.size ?? null });
    setSending(false);
    if (error) { toast.error(error.message); return; }
    setText(""); setFile(null); qc.invalidateQueries({ queryKey: ["chat-messages", threadId] });
  }

  const items = useMemo(() => messages.data ?? [], [messages.data]);
  return <Card className="bg-card glow-border min-h-[560px]"><CardContent className="p-0 flex flex-col h-[70vh] min-h-[520px]">
    <div className="flex-1 overflow-y-auto p-3 space-y-2 bg-[radial-gradient(circle_at_top_right,rgba(57,255,20,.08),transparent_35%)]">
      {!threadId && <p className="text-sm text-muted-foreground text-center mt-16">Escolha um chat para começar.</p>}
      {items.map((m) => <div key={m.id} className={`flex ${m.sender_id === userId ? "justify-end" : "justify-start"}`}><div className={`max-w-[78%] rounded-2xl px-3 py-2 text-sm ${m.sender_id === userId ? "bg-primary text-primary-foreground" : "bg-surface border border-border"}`}><div className="text-[10px] opacity-70 mb-1">@{m.sender?.nick ?? "user"}</div>{m.body && <p className="whitespace-pre-wrap break-words">{m.body}</p>}{m.imageUrl && <img src={m.imageUrl} alt={m.image_name ?? "imagem"} className="mt-2 rounded-lg max-h-64 object-contain" />}</div></div>)}
      <div ref={bottomRef} />
    </div>
    <div className="border-t border-border p-3 space-y-2"><div className="flex gap-2"><Input value={text} onChange={(e) => setText(e.target.value)} placeholder="Mensagem..." onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) send(); }} /><label className="inline-flex items-center justify-center size-10 rounded-md border border-border cursor-pointer"><ImagePlus className="size-4" /><input type="file" accept="image/*" className="hidden" onChange={(e) => setFile(e.target.files?.[0] ?? null)} /></label><Button onClick={send} disabled={sending || !threadId}><Send className="size-4" /></Button></div>{file && <Badge variant="secondary" className="text-[10px]">{file.name} · {(file.size / 1024 / 1024).toFixed(1)}MB</Badge>}</div>
  </CardContent></Card>;
}