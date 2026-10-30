// 2FA (TOTP) é opcional: staff entra só com senha. Se a conta tiver um fator TOTP
// verificado, o /admin/login pede o código; nunca bloqueia quem não cadastrou 2FA.
export function adminAccess(authenticated: boolean, isAdmin: boolean, isSeller: boolean) {
  if (!authenticated) return 'login';
  if (!isAdmin && !isSeller) return 'denied';
  return 'allowed';
}

export function strongAdminPassword(password: string) {
  return password.length >= 12 && password.length <= 128 && /[a-z]/.test(password) && /[A-Z]/.test(password) && /\d/.test(password) && /[^a-zA-Z0-9]/.test(password);
}
