import { Layout } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useEffect } from "react";

export default function Auth() {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const nav = useNavigate();
  const [search] = useSearchParams();
  const next = search.get("next");
  const { user, isAdmin, isSeller } = useAuth();

  useEffect(() => {
    if (user) nav(next || (isAdmin || isSeller ? "/admin" : "/"));
  }, [user, isAdmin, isSeller, nav, next]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === "login") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        toast.success("Bem-vindo!");
      } else {
        const { error } = await supabase.auth.signUp({
          email, password,
          options: { emailRedirectTo: window.location.origin, data: { full_name: name } },
        });
        if (error) throw error;
        toast.success("Conta criada! Verifique seu e-mail se necessário.");
      }
    } catch (e: any) {
      const msg = String(e?.message || "");
      if (/weak|pwned|known to be|leaked|compromised/i.test(msg)) {
        toast.error("Essa senha é muito comum ou apareceu em vazamentos conhecidos. Escolha uma senha mais forte (ideal: 10+ caracteres com letras, números e símbolos).");
      } else if (/invalid login|invalid credentials/i.test(msg)) {
        toast.error("E-mail ou senha incorretos.");
      } else if (/already registered|already exists|user already/i.test(msg)) {
        toast.error("Este e-mail já está cadastrado. Tente entrar.");
      } else {
        toast.error(msg || "Erro");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Layout>
      <div className="container max-w-md py-10">
        <div className="bg-card border rounded-xl p-6 shadow-card">
          <h1 className="text-2xl font-extrabold mb-1">{mode === "login" ? "Entrar" : "Criar conta"}</h1>
          <p className="text-sm text-muted-foreground mb-5">Acesso à área administrativa e à sua conta.</p>
          <form onSubmit={submit} className="space-y-4">
            {mode === "signup" && (
              <div className="space-y-2"><Label>Nome</Label><Input value={name} onChange={(e) => setName(e.target.value)} required /></div>
            )}
            <div className="space-y-2"><Label>E-mail</Label><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></div>
            <div className="space-y-2"><Label>Senha</Label><Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={6} required /></div>
            <Button type="submit" className="w-full" disabled={loading}>{loading ? "..." : mode === "login" ? "Entrar" : "Criar conta"}</Button>
          </form>
          <button className="mt-4 text-sm text-primary hover:underline" onClick={() => setMode(mode === "login" ? "signup" : "login")}>
            {mode === "login" ? "Não tem conta? Criar agora" : "Já tem conta? Entrar"}
          </button>
        </div>
      </div>
    </Layout>
  );
}
