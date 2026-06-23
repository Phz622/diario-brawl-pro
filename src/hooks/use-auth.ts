import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Session, User } from "@supabase/supabase-js";

export function useSession() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);
  return { session, user: session?.user ?? null, loading };
}

export type AppRole = "admin_principal" | "admin_salas" | "participante";

export function useRoles(user: User | null) {
  return useQuery({
    queryKey: ["roles", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.from("user_roles").select("role").eq("user_id", user!.id);
      if (error) throw error;
      return (data ?? []).map((r) => r.role as AppRole);
    },
  });
}

export function useProfile(user: User | null) {
  return useQuery({
    queryKey: ["profile", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("*").eq("id", user!.id).maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

export function useWallet(user: User | null) {
  return useQuery({
    queryKey: ["wallet", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.from("wallets").select("balance").eq("user_id", user!.id).maybeSingle();
      if (error) throw error;
      return data?.balance ?? 0;
    },
  });
}

export function isAdmin(roles: AppRole[] | undefined) {
  return !!roles?.some((r) => r === "admin_principal" || r === "admin_salas");
}
export function isMainAdmin(roles: AppRole[] | undefined) {
  return !!roles?.includes("admin_principal");
}
