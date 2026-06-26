import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Session, User } from "@supabase/supabase-js";

export type Profile = {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  cpf: string | null;
};

export function useAuth() {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isSeller, setIsSeller] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    async function refreshUser(s: Session | null) {
      if (!s) {
        if (!mounted) return;
        setUser(null);
        setProfile(null);
        setIsAdmin(false);
        setIsSeller(false);
        setLoading(false);
        return;
      }
      const { data, error } = await supabase.auth.getUser();
      if (!mounted) return;
      if (error || !data?.user) {
        setUser(null);
        setProfile(null);
        setIsAdmin(false);
        setIsSeller(false);
        setLoading(false);
        return;
      }
      setUser(data.user);
      const [{ data: roles }, { data: prof }] = await Promise.all([
        supabase.from("user_roles").select("role").eq("user_id", data.user.id),
        supabase.from("profiles").select("id, full_name, email, phone, cpf").eq("id", data.user.id).maybeSingle(),
      ]);
      if (!mounted) return;
      const rs = (roles || []).map((r: any) => r.role);
      setIsAdmin(rs.includes("admin"));
      setIsSeller(rs.includes("seller"));
      setProfile((prof as Profile) || null);
      setLoading(false);
    }

    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      setTimeout(() => { void refreshUser(s); }, 0);
    });

    supabase.auth.getSession().then(({ data: { session: s } }) => {
      if (!mounted) return;
      setSession(s);
      void refreshUser(s);
    });

    return () => { mounted = false; sub.subscription.unsubscribe(); };
  }, []);

  return { session, user, profile, isAdmin, isSeller, loading };
}

