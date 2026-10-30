import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { customerAccount } from "@/lib/customerAccountApi";
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
  const [rolesResolved, setRolesResolved] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    let revision = 0;

    async function refreshUser(s: Session | null) {
      if (!mounted) return;
      const current = ++revision;
      setLoading(true);
      setRolesResolved(false);
      if (!s) {
        if (!mounted || current !== revision) return;
        setUser(null);
        setProfile(null);
        setIsAdmin(false);
        setIsSeller(false);
        setLoading(false);
        return;
      }

      const { data, error } = await supabase.auth.getUser();
      if (!mounted || current !== revision) return;
      if (error || !data?.user) {
        setUser(null);
        setProfile(null);
        setIsAdmin(false);
        setIsSeller(false);
        setLoading(false);
        return;
      }

      setUser(data.user);
      try {
        const context = await customerAccount<{ profile: Profile | null; roles: string[] }>("context");
        if (!mounted || current !== revision) return;
        setRolesResolved(true);
        const roles = context.roles || [];
        setIsAdmin(roles.includes("admin"));
        setIsSeller(roles.includes("seller"));
        setProfile(context.profile || null);
      } catch {
        if (!mounted || current !== revision) return;
        // Falhar fechado: sessão continua identificada, mas nenhum privilégio é concedido.
        setIsAdmin(false);
        setIsSeller(false);
        setProfile(null);
      } finally {
        if (mounted && current === revision) setLoading(false);
      }
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

  return { session, user, profile, isAdmin, isSeller, loading, rolesResolved };
}
