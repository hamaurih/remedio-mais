import { Layout } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Seo } from "@/components/Seo";

export default function Auth() {
  const [mode, setMode] = useState<"login" | "signup" | "forgot">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const nav = useNavigate();
  const [search] = useSearchParams();
  const next = search.get("next");
  const { user, isAdmin, isSeller, loading: authLoading } = useAuth();

  useEffect(() => {
    if (!user || authLoading || mode === "forgot") return;

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
  }, [user, isAdmin, isSeller, authLoading, nav, next, mode]);

  const passwordValid = password.length >= 8 && password.length <= 128;

  async function readInvokePayload(error: any) {
    try {
      const response: Response | undefined = error?.context;
      if (response && typeof response.clone === "function") {
        const text = await response.clone().text();
        try { return JSON.parse(text); } catch { return null; }
      }
    } catch { /* ignore */ }
    return null;
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (mode === "signup" && !passwordValid) {
      toast.error("Use uma senha com pelo menos 8 caracteres.");
      return;
    }
    setLoading(true);
    try {
      if (mode === "forgot") {
        const { data, error } = await supabase.functions.invoke("secure-account-auth", {
          body: { action: "request-reset", email },
        });
        if (error) {
          const p = await readInvokePayload(error);
          if (p?.error === "too_many_attempts") throw new Error("RATE_LIMITED");
          throw new Error("RESET_FAILED");
        }
        toast.success(data?.message || "Se o e-mail estiver cadastrado, enviaremos as instruções.");
        setMode("login");
        return;
      }

      if (mode === "login") {
        const { data, error } = await supabase.functions.invoke("secure-login", {
          body: { email, password },
        });

        if (error) {
          const payload = await readInvokePayload(error);
          const code = String(payload?.error || "");
          const retryAfter = Number(payload?.retry_after || 0);
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
        return;
      }

      const { data, error } = await supabase.functions.invoke("secure-account-auth", {
        body: { action: "signup", email, password, name },
      });
      if (error) {
        const p = await readInvokePayload(error);
        const code = String(p?.error || "");
        if (code === "pwned_password" || code === "weak_password") throw new Error("WEAK_PASSWORD");
        if (code === "account_exists") throw new Error("ACCOUNT_EXISTS");
        if (code === "too_many_attempts") throw new Error("RATE_LIMITED");
        throw new Error("SIGNUP_FAILED");
      }

      if (data?.session?.access_token && data?.session?.refresh_token) {
        await supabase.auth.setSession({
          access_token: data.session.access_token,
          refresh_token: data.session.refresh_token,
        });
        toast.success("Conta criada! Bem-vindo.");
      } else {
        toast.success("Conta criada. Confira seu e-mail para confirmar o cadastro.");
        setMode("login");
      }
    } catch (e: any) {
      const msg = String(e?.message || "");
      if (msg.startsWith("LOGIN_RATE_LIMITED:")) {
        const minutes = msg.split(":")[1] || "15";
        toast.error(`Muitas tentativas de acesso. Tente novamente em aproximadamente ${minutes} minuto(s).`);
      } else if (msg === "RATE_LIMITED") {
        toast.error("Muitas tentativas em sequência. Aguarde alguns minutos e tente novamente.");
      } else if (msg === "INVALID_LOGIN" || /invalid login|invalid credentials/i.test(msg)) {
        toast.error("E-mail ou senha incorretos.");
      } else if (msg === "WEAK_PASSWORD" || /weak|pwned|known to be|leaked|compromised/i.test(msg)) {
        toast.error("Essa senha é muito comum ou apareceu em vazamentos. Escolha outra senha.");
      } else if (msg === "ACCOUNT_EXISTS") {
        toast.error("Este e-mail já está cadastrado. Entre na conta ou use “Esqueci minha senha”.");
      } else if (/email not confirmed|not confirmed/i.test(msg)) {
        toast.error("Seu e-mail ainda não foi confirmado. Verifique sua caixa de entrada.");
      } else if (msg === "RESET_FAILED") {
        toast.error("Não foi possível solicitar a redefinição agora. Tente novamente.");
      } else {
        toast.error("Não foi possível concluir o acesso. Tente novamente.");
      }
    } finally {
      setLoading(false);
    }
  };

  const title = mode === "login" ? "Entrar" : mode === "signup" ? "Criar conta" : "Esqueci minha senha";

  return (
    <Layout>
      <Seo title={title} description="Acesse sua conta na Farmácia Atacadão dos Medicamentos para acompanhar pedidos e endereços." path="/auth" noindex />
      <div className="container max-w-md py-10">
        <div className="bg-card border rounded-xl p-6 shadow-card">
          <h1 className="text-2xl font-extrabold mb-1">{title}</h1>
          <p className="text-sm text-muted-foreground mb-5">
            {mode === "forgot"
              ? "Informe seu e-mail. Se ele estiver cadastrado, enviaremos um link seguro para criar uma nova senha."
              : "Acesso seguro à sua conta de compras."}
          </p>

          <form onSubmit={submit} className="space-y-4">
            {mode === "signup" && (
              <div className="space-y-2">
                <Label>Nome</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} required autoComplete="name" maxLength={120} />
              </div>
            )}

            <div className="space-y-2">
              <Label>E-mail</Label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" maxLength={254} />
            </div>

            {mode !== "forgot" && (
              <div className="space-y-2">
                <Label>Senha</Label>
                <Input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  minLength={mode === "signup" ? 8 : 1}
                  maxLength={128}
                  required
                  autoComplete={mode === "signup" ? "new-password" : "current-password"}
                />
                {mode === "signup" && (
                  <div className="text-xs text-muted-foreground space-y-1">
                    <p className={password.length >= 8 ? "text-green-600" : ""}>{password.length >= 8 ? "✓" : "○"} Pelo menos 8 caracteres</p>
                    <p>Não precisa usar símbolo. Senhas comuns, pessoais ou encontradas em vazamentos são bloqueadas automaticamente.</p>
                  </div>
                )}
              </div>
            )}

            <Button type="submit" className="w-full" disabled={loading || (mode === "signup" && !passwordValid)}>
              {loading ? "Aguarde..." : mode === "login" ? "Entrar" : mode === "signup" ? "Criar conta" : "Enviar link de redefinição"}
            </Button>
          </form>

          {mode === "login" && (
            <button className="mt-4 block text-sm text-primary hover:underline" onClick={() => setMode("forgot")}>
              Esqueci minha senha
            </button>
          )}

          <button
            className="mt-3 text-sm text-primary hover:underline"
            onClick={() => {
              setPassword("");
              setMode(mode === "login" ? "signup" : "login");
            }}
          >
            {mode === "login" ? "Não tem conta? Criar agora" : "Voltar para entrar"}
          </button>
        </div>
      </div>
    </Layout>
  );
}
