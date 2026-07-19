import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export type Profile = {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  cpf: string | null;
};

type AuthContextValue = {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  isAdmin: boolean;
  isSeller: boolean;
  loading: boolean;
  error: string | null;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isSeller, setIsSeller] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const refreshSequence = useRef(0);

  useEffect(() => {
    let mounted = true;

    async function refreshUser(nextSession: Session | null) {
      const sequence = ++refreshSequence.current;
      setLoading(true);
      setError(null);

      if (!nextSession) {
        if (!mounted || sequence !== refreshSequence.current) return;
        setUser(null);
        setProfile(null);
        setIsAdmin(false);
        setIsSeller(false);
        setLoading(false);
        return;
      }

      const { data, error: userError } = await supabase.auth.getUser(
        nextSession.access_token,
      );

      if (!mounted || sequence !== refreshSequence.current) return;

      if (userError || !data.user) {
        setUser(null);
        setProfile(null);
        setIsAdmin(false);
        setIsSeller(false);
        setError(userError?.message || "Não foi possível validar a sessão.");
        setLoading(false);
        return;
      }

      setUser(data.user);

      const [{ data: roles, error: rolesError }, { data: profileRow, error: profileError }] =
        await Promise.all([
          supabase.from("user_roles").select("role").eq("user_id", data.user.id),
          supabase
            .from("profiles")
            .select("id, full_name, email, phone, cpf")
            .eq("id", data.user.id)
            .maybeSingle(),
        ]);

      if (!mounted || sequence !== refreshSequence.current) return;

      const roleNames = (roles ?? []).map((role) => role.role);
      setIsAdmin(roleNames.includes("admin"));
      setIsSeller(roleNames.includes("seller"));
      setProfile((profileRow as Profile | null) ?? null);
      setError(rolesError?.message || profileError?.message || null);
      setLoading(false);
    }

    const { data: subscription } = supabase.auth.onAuthStateChange(
      (_event, nextSession) => {
        setSession(nextSession);
        // Supabase recommends deferring additional client calls made from the
        // auth callback to avoid locking the session update.
        setTimeout(() => {
          if (mounted) void refreshUser(nextSession);
        }, 0);
      },
    );

    void supabase.auth.getSession().then(({ data, error: sessionError }) => {
      if (!mounted) return;
      if (sessionError) {
        setError(sessionError.message);
        setLoading(false);
        return;
      }
      setSession(data.session);
      void refreshUser(data.session);
    });

    return () => {
      mounted = false;
      refreshSequence.current += 1;
      subscription.subscription.unsubscribe();
    };
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      user,
      profile,
      isAdmin,
      isSeller,
      loading,
      error,
    }),
    [session, user, profile, isAdmin, isSeller, loading, error],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}
