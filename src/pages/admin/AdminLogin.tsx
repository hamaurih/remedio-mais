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
  const [qr, setQr] = useState('');
  const [secret, setSecret] = useState('');
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
      const assurance = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (assurance.error) throw assurance.error;
      if (assurance.data.currentLevel === 'aal2') { nav('/admin', { replace: true }); return; }
      const factors = await supabase.auth.mfa.listFactors();
      if (factors.error) throw factors.error;
      const verified = factors.data.totp.find(f => f.status === 'verified');
      if (verified) { setFactorId(verified.id); return; }
      // Limpa apenas cadastros incompletos para permitir retomar após abandono.
      for (const factor of factors.data.all.filter(f => f.factor_type === 'totp' && f.status === 'unverified')) {
        const removed = await supabase.auth.mfa.unenroll({ factorId: factor.id });
        if (removed.error) throw removed.error;
      }
      const enrolled = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'Painel administrativo' });
      if (enrolled.error) throw enrolled.error;
      setFactorId(enrolled.data.id);
      setQr(enrolled.data.totp.qr_code);
      setSecret(enrolled.data.totp.secret);
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
            {qr && <><p className="text-sm">Cadastre este QR code no seu aplicativo autenticador.</p><img src={qr.startsWith('data:') ? qr : `data:image/svg+xml;charset=utf-8,${encodeURIComponent(qr)}`} alt="QR code para cadastrar autenticação em duas etapas" className="w-48 mx-auto" /><p className="text-xs break-all">Chave para cadastro manual: {secret}</p></>}
            <div><Label htmlFor="admin-totp">Código do autenticador</Label><Input id="admin-totp" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required value={code} onChange={e => setCode(e.target.value)} /></div>
          </>}
          <Button className="w-full" disabled={busy}>{busy ? 'Validando...' : factorId ? 'Confirmar código' : 'Entrar no painel'}</Button>
          <Link className="block text-sm text-primary" to="/auth">Login de cliente</Link>
        </form>
      </CardContent>
    </Card>
  </main>;
}
