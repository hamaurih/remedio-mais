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
import { Seo } from "@/components/Seo";

export default function Auth() {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const nav = useNavigate();
  const [search] = useSearchParams();
  const next = search.get("next");
  const { user, isAdmin, isSeller, loading: authLoading } = useAuth();

  useEffect(() => {
    if (!user || authLoading) return;

    if (next) {
      nav(next, { replace: true });
      return;
    }

    if (isAdmin) {
      nav("/admin", { replace: true });
      return;
    }

    if (isSeller) {
      nav("/admin/vendedor", { replace: true });
      return;
    }

    nav("/", { replace: true });
  }, [user, isAdmin, isSeller, authLoading, nav, next]);

  const pwChecks = {
    length: password.length >= 10,
    letter: /[A-Za-z]/.test(password),
    number: /\d/.test(password),
  };
  const passwordValid = pwChecks.length && pwChecks.letter && pwChecks.number;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (mode === "signup" && !passwordValid) {
      toast.error("A senha precisa ter pelo menos 10 caracteres, com letras e números.");
      return;
    }
    setLoading(true);
    try {
      if (mode === "login") {
        const { data, error } = await supabase.functions.invoke("secure-login", {
          body: { email, password },
        });

        if (error) {
          let code = "";
          let retryAfter = 0;
          try {
            const payload = await (error as any)?.context?.json?.();
            code = String(payload?.error || "");
            retryAfter = Number(payload?.retry_after || 0);
          } catch {
            // resposta não JSON: manter mensagem genérica
          }

          if (code === "too_many_attempts") {
            const minutes = Math.max(1, Math.ceil(retryAfter / 60));
            throw new Error(`LOGIN_RATE_LIMITED:${minutes}`);
          }
          throw new Error("INVALID_LOGIN");
        }

        const session = data?.session;
        if (!session?.access_token || !session?.refresh_token) throw new Error("INVALID_LOGIN");

        const { error: sessionError } = await supabase.auth.setSession({
          access_token: session.access_token,
          refresh_token: session.refresh_token,
        });
        if (sessionError) throw sessionError;

        toast.success("Bem-vindo!");
      } else {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: window.location.origin, data: { full_name: name } },
        });
        if (error) throw error;
        toast.success("Conta criada! Verifique seu e-mail se necessário.");
      }
    } catch (e: any) {
      const msg = String(e?.message || "");
      if (msg.startsWith("LOGIN_RATE_LIMITED:")) {
        const minutes = msg.split(":")[1] || "15";
        toast.error(`Muitas tentativas de acesso. Tente novamente em aproximadamente ${minutes} minuto(s).`);
      } else if (msg === "INVALID_LOGIN" || /invalid login|invalid credentials/i.test(msg)) {
        toast.error("E-mail ou senha incorretos.");
      } else if (/weak|pwned|known to be|leaked|compromised/i.test(msg)) {
        toast.error("Essa senha apareceu em vazamentos conhecidos ou é muito comum. Use uma senha diferente.");
      } else if (/email not confirmed|not confirmed/i.test(msg)) {
        toast.error("Seu e-mail ainda não foi confirmado. Verifique sua caixa de entrada.");
      } else if (/already registered|already exists|user already/i.test(msg)) {
        toast.error("Este e-mail já está cadastrado. Tente entrar.");
      } else {
        toast.error("Não foi possível concluir o acesso. Tente novamente.");
      }
    } finally {
      setLoading(false);
    }
  };

  const Rule = ({ ok, children }: { ok: boolean; children: React.ReactNode }) => (
    <li className={`flex items-center gap-2 ${ok ? "text-green-600" : "text-muted-foreground"}`}>
      <span aria-hidden>{ok ? "✓" : "○"}</span>
      <span>{children}</span>
    </li>
  );

  return (
    <Layout>
      <Seo title={mode === "login" ? "Entrar" : "Criar conta"} description="Acesse sua conta na Farmácia Atacadão dos Medicamentos para acompanhar pedidos e endereços." path="/auth" noindex />
      <div className="container max-w-md py-10">
        <div className="bg-card border rounded-xl p-6 shadow-card">
          <h1 className="text-2xl font-extrabold mb-1">{mode === "login" ? "Entrar" : "Criar conta"}</h1>
          <p className="text-sm text-muted-foreground mb-5">Acesso à área administrativa e à sua conta.</p>
          <form onSubmit={submit} className="space-y-4">
            {mode === "signup" && (
              <div className="space-y-2"><Label>Nome</Label><Input value={name} onChange={(e) => setName(e.target.value)} required autoComplete="name" /></div>
            )}
            <div className="space-y-2"><Label>E-mail</Label><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" /></div>
            <div className="space-y-2">
              <Label>Senha</Label>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={mode === "signup" ? 10 : 6}
                maxLength={256}
                required
                autoComplete={mode === "signup" ? "new-password" : "current-password"}
              />
              {mode === "signup" && (
                <ul className="text-xs space-y-1 mt-2" aria-live="polite">
                  <Rule ok={pwChecks.length}>Pelo menos 10 caracteres</Rule>
                  <Rule ok={pwChecks.letter}>Contém letras (a-z)</Rule>
                  <Rule ok={pwChecks.number}>Contém números (0-9)</Rule>
                  <li className="text-muted-foreground pt-1">Evite senhas reutilizadas, sequências e informações pessoais.</li>
                </ul>
              )}
            </div>
            <Button type="submit" className="w-full" disabled={loading || (mode === "signup" && !passwordValid)}>
              {loading ? "..." : mode === "login" ? "Entrar" : "Criar conta"}
            </Button>
          </form>
          <button className="mt-4 text-sm text-primary hover:underline" onClick={() => setMode(mode === "login" ? "signup" : "login")}>
            {mode === "login" ? "Não tem conta? Criar agora" : "Já tem conta? Entrar"}
          </button>
        </div>
      </div>
    </Layout>
  );
}
