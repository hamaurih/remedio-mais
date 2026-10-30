import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { customerAccount } from '@/lib/customerAccountApi';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';

export default function AdminLogin() {
  const nav = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [factorId, setFactorId] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true); setError('');
    try {
      if (factorId) {
        const result = await supabase.auth.mfa.challengeAndVerify({ factorId, code });
        if (result.error) throw result.error;
        nav('/admin', { replace: true });
        return;
      }
      const login = await supabase.auth.signInWithPassword({ email, password });
      if (login.error) throw new Error('E-mail ou senha inválidos.');
      const context = await customerAccount<{ roles: string[] }>('context');
      if (!context.roles?.some(role => ['admin', 'seller'].includes(role))) {
        await supabase.auth.signOut();
        throw new Error('Acesso restrito a administradores e vendedores. Use o login da loja para sua conta de cliente.');
      }
      // 2FA opcional: só pede código se a conta já tiver TOTP verificado.
      const factors = await supabase.auth.mfa.listFactors().catch(() => null);
      const verified = factors && !factors.error ? factors.data.totp.find(f => f.status === 'verified') : undefined;
      if (verified) {
        const assurance = await supabase.auth.mfa.getAuthenticatorAssuranceLevel().catch(() => null);
        if (assurance?.data?.currentLevel !== 'aal2') { setFactorId(verified.id); return; }
      }
      nav('/admin', { replace: true });
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Não foi possível validar o acesso. Tente novamente.');
    } finally { setBusy(false); }
  }

  return <main className="min-h-screen grid place-items-center bg-background p-4">
    <Card className="w-full max-w-md">
      <CardHeader><CardTitle>Painel administrativo</CardTitle><p className="text-sm text-muted-foreground">Acesso exclusivo para administradores e vendedores.</p></CardHeader>
      <CardContent>
        <form onSubmit={submit} className="space-y-4">
          {error && <Alert variant="destructive"><AlertDescription role="alert">{error}</AlertDescription></Alert>}
          {!factorId ? <>
            <div><Label htmlFor="admin-email">E-mail</Label><Input id="admin-email" type="email" autoComplete="username" required value={email} onChange={e => setEmail(e.target.value)} /></div>
            <div><Label htmlFor="admin-password">Senha</Label><Input id="admin-password" type="password" autoComplete="current-password" required value={password} onChange={e => setPassword(e.target.value)} /></div>
          </> : <>
            <div><Label htmlFor="admin-totp">Código do autenticador</Label><Input id="admin-totp" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required value={code} onChange={e => setCode(e.target.value)} /></div>
          </>}
          <Button className="w-full" disabled={busy}>{busy ? 'Validando...' : factorId ? 'Confirmar código' : 'Entrar no painel'}</Button>
          <Link className="block text-sm text-primary" to="/auth">Login de cliente</Link>
        </form>
      </CardContent>
    </Card>
  </main>;
}
