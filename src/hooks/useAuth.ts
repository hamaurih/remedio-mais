import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Session, User } from "@supabase/supabase-js";

export function useAuth() {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isSeller, setIsSeller] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    // Revalida o usuário com o servidor (não confia apenas no token local).
    async function refreshUser(s: Session | null) {
      if (!s) {
        if (!mounted) return;
        setUser(null);
        setIsAdmin(false);
        setIsSeller(false);
        setLoading(false);
        return;
      }
      const { data, error } = await supabase.auth.getUser();
      if (!mounted) return;
      if (error || !data?.user) {
        setUser(null);
        setIsAdmin(false);
        setIsSeller(false);
        setLoading(false);
        return;
      }
      setUser(data.user);
      const { data: roles } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", data.user.id);
      if (!mounted) return;
      const rs = (roles || []).map((r: any) => r.role);
      setIsAdmin(rs.includes("admin"));
      setIsSeller(rs.includes("seller"));
      setLoading(false);
    }

    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      // defer para evitar deadlock dentro do callback do supabase
      setTimeout(() => { void refreshUser(s); }, 0);
    });

    supabase.auth.getSession().then(({ data: { session: s } }) => {
      if (!mounted) return;
      setSession(s);
      void refreshUser(s);
    });

    return () => { mounted = false; sub.subscription.unsubscribe(); };
  }, []);

  return { session, user, isAdmin, isSeller, loading };
}
