import { FormEvent, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ShieldCheck } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { isCustomerDomainBlocked, platformHostLabel } from "./platformHost";

export default function PlatformLogin() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  if (isCustomerDomainBlocked()) return <Navigate to="/admin" replace />;
  if (!loading && user) return <Navigate to="/platform" replace />;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true); setError("");
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) return setError("Não foi possível entrar. Verifique as credenciais.");
    navigate("/platform", { replace: true });
  };

  return <div className="min-h-screen bg-slate-950 text-white grid place-items-center p-6">
    <Card className="w-full max-w-md border-slate-800 bg-slate-900 text-white shadow-2xl">
      <CardHeader className="space-y-4">
        <div className="h-12 w-12 rounded-2xl bg-white text-slate-950 grid place-items-center"><ShieldCheck className="h-6 w-6" /></div>
        <div><CardTitle className="text-2xl">{platformHostLabel()}</CardTitle><CardDescription className="text-slate-400 mt-1">Acesso exclusivo à administração do SaaS e das empresas clientes.</CardDescription></div>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2"><Label htmlFor="platform-email">E-mail</Label><Input id="platform-email" type="email" value={email} onChange={e=>setEmail(e.target.value)} required className="bg-slate-950 border-slate-700" /></div>
          <div className="space-y-2"><Label htmlFor="platform-password">Senha</Label><Input id="platform-password" type="password" value={password} onChange={e=>setPassword(e.target.value)} required className="bg-slate-950 border-slate-700" /></div>
          {error && <p className="text-sm text-red-400">{error}</p>}
          <Button type="submit" className="w-full bg-white text-slate-950 hover:bg-slate-200" disabled={busy}>{busy ? "Entrando..." : "Entrar no Control Plane"}</Button>
        </form>
      </CardContent>
    </Card>
  </div>;
}
