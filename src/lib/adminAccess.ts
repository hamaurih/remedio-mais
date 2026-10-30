export function adminAccess(authenticated: boolean, isAdmin: boolean, isSeller: boolean, aal2: boolean) {
  if (!authenticated) return 'login';
  if (!isAdmin && !isSeller) return 'denied';
  return aal2 ? 'allowed' : 'login';
}

export function strongAdminPassword(password: string) {
  return password.length >= 12 && password.length <= 128 && /[a-z]/.test(password) && /[A-Z]/.test(password) && /\d/.test(password) && /[^a-zA-Z0-9]/.test(password);
}
