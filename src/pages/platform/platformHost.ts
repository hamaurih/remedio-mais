export function isCustomerDomainBlocked() {
  if (typeof window === "undefined") return false;
  const host = window.location.hostname.toLowerCase();
  return host === "atacadaodosmedicamentos.com.br" || host === "www.atacadaodosmedicamentos.com.br";
}

export function platformHostLabel() {
  if (typeof window === "undefined") return "Plataforma SaaS";
  return window.location.hostname.includes("vercel.app") || window.location.hostname === "localhost"
    ? "Control Plane — Homologação"
    : "Administração da Plataforma";
}
