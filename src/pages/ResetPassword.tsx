import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { Seo } from "@/components/Seo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export default function ResetPassword() {
  const [search] = useSearchParams();
  const nav = useNavigate();
  const changeMode = search.get("mode") === "change";
  const [sessionReady, setSessionReady] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);

  const valid = useMemo(() => password.length >= 8 && password.length <= 128 && password === confirm, [password, confirm]);

  useEffect(() => {
    let mounted = true;
    const resolveSession = async () => {
      // Supabase processa automaticamente o token do link de recuperação e cria
      // uma sessão temporária. Também funciona para usuário já autenticado.
      const { data } = await supabase.auth.getSession();
      if (!mounted) return;
      setSessionReady(!!data.session);
    };
    void resolveSession();
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (mounted) setSessionReady(!!session);
    });
    return () => { mounted = false; sub.subscription.unsubscribe(); };
  }, []);

  async function readPayload(error: any) {
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
    if (!sessionReady) {
      toast.error("Este link é inválido, expirou ou já foi utilizado. Solicite um novo link.");
      return;
    }
    if (!valid) {
      toast.error("Use pelo menos 8 caracteres e confirme a mesma senha nos dois campos.");
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("secure-password", {
        body: {
          action: changeMode ? "change" : "reset",
          current_password: changeMode ? currentPassword : undefined,
          password,
        },
      });
      if (error) {
        const p = await readPayload(error);
        if (p?.error === "pwned_password" || p?.error === "weak_password") throw new Error("WEAK_PASSWORD");
        if (p?.error === "current_password_invalid") throw new Error("CURRENT_INVALID");
        throw new Error("RESET_FAILED");
      }
      if (!data?.ok) throw new Error("RESET_FAILED");

      await supabase.auth.signOut().catch(() => undefined);
      toast.success("Senha atualizada com segurança. Entre novamente com a nova senha.");
      nav("/auth", { replace: true });
    } catch (e: any) {
      const msg = String(e?.message || "");
      if (msg === "WEAK_PASSWORD") {
        toast.error("Essa senha é muito comum ou apareceu em vazamentos. Escolha outra.");
      } else if (msg === "CURRENT_INVALID") {
        toast.error("A senha atual está incorreta.");
      } else {
        toast.error("Não foi possível atualizar a senha. Solicite um novo link e tente novamente.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Layout>
      <Seo title="Criar nova senha" description="Redefina sua senha com segurança." path="/redefinir-senha" noindex />
      <div className="container max-w-md py-10">
        <div className="bg-card border rounded-xl p-6 shadow-card">
          <h1 className="text-2xl font-extrabold mb-1">{changeMode ? "Alterar senha" : "Criar nova senha"}</h1>
          <p className="text-sm text-muted-foreground mb-5">
            {changeMode
              ? "Confirme sua senha atual e escolha uma nova."
              : "Escolha uma nova senha para sua conta. O link de recuperação é temporário e de uso controlado."}
          </p>

          {!sessionReady && (
            <div className="mb-4 rounded-lg border p-3 text-sm text-muted-foreground">
              Não encontramos uma sessão de recuperação válida. Se você chegou aqui por um link antigo, solicite outro em “Esqueci minha senha”.
            </div>
          )}

          <form onSubmit={submit} className="space-y-4">
            {changeMode && (
              <div className="space-y-2">
                <Label>Senha atual</Label>
                <Input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} required autoComplete="current-password" maxLength={128} />
              </div>
            )}
            <div className="space-y-2">
              <Label>Nova senha</Label>
              <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} maxLength={128} autoComplete="new-password" />
              <p className="text-xs text-muted-foreground">Mínimo de 8 caracteres. Não exigimos símbolos, mas bloqueamos senhas comuns e vazadas.</p>
            </div>
            <div className="space-y-2">
              <Label>Confirmar nova senha</Label>
              <Input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required minLength={8} maxLength={128} autoComplete="new-password" />
            </div>
            <Button type="submit" className="w-full" disabled={loading || !valid || !sessionReady || (changeMode && !currentPassword)}>
              {loading ? "Atualizando..." : "Salvar nova senha"}
            </Button>
          </form>
        </div>
      </div>
    </Layout>
  );
}
