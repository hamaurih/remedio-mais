import { Component, type ErrorInfo, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { HelmetProvider } from "react-helmet-async";
import App from "./App.tsx";
import "./index.css";

type ClientErrorPayload = {
  type: string;
  message: string;
  stack?: string;
};

function reportClientError(payload: ClientErrorPayload) {
  try {
    const body = JSON.stringify({
      ...payload,
      path: window.location.pathname,
      userAgent: navigator.userAgent,
      online: navigator.onLine,
      visibility: document.visibilityState,
      timestamp: new Date().toISOString(),
    });

    fetch("/api/client-error", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true,
      credentials: "omit",
    }).catch(() => undefined);
  } catch {
    // Telemetria nunca pode impedir a abertura da loja.
  }
}

window.addEventListener("error", (event) => {
  reportClientError({
    type: "window_error",
    message: event.message || "Erro global no navegador",
    stack: event.error instanceof Error ? event.error.stack : undefined,
  });
});

window.addEventListener("unhandledrejection", (event) => {
  const reason = event.reason;
  reportClientError({
    type: "unhandled_rejection",
    message:
      reason instanceof Error
        ? reason.message
        : typeof reason === "string"
          ? reason
          : "Promise rejeitada sem tratamento",
    stack: reason instanceof Error ? reason.stack : undefined,
  });
});

function reloadClean() {
  const url = new URL(window.location.href);
  url.searchParams.set("_reload", String(Date.now()));
  window.location.replace(url.toString());
}

class GlobalErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    reportClientError({
      type: "react_error_boundary",
      message: error.message || "Falha de renderização React",
      stack: `${error.stack || ""}\n${info.componentStack || ""}`,
    });
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6 text-foreground">
        <div className="w-full max-w-md text-center space-y-4">
          <h1 className="text-2xl font-bold">Atacadão dos Medicamentos</h1>
          <p className="text-sm text-muted-foreground">
            A loja encontrou uma falha ao carregar esta página. Seus dados não foram alterados.
          </p>
          <button
            type="button"
            onClick={reloadClean}
            className="inline-flex h-11 items-center justify-center rounded-lg bg-primary px-5 font-bold text-primary-foreground"
          >
            Tentar novamente
          </button>
        </div>
      </div>
    );
  }
}

// Vite dispara este evento quando uma pagina antiga tenta carregar um chunk
// removido por um deploy novo. No Safari/iOS isso pode resultar em tela branca.
// Fazemos uma unica recarga com cache-busting e evitamos loop infinito.
const CHUNK_RETRY_PARAM = "_chunk_retry";

window.addEventListener("vite:preloadError", (event) => {
  const currentUrl = new URL(window.location.href);
  if (currentUrl.searchParams.has(CHUNK_RETRY_PARAM)) return;

  reportClientError({
    type: "vite_preload_error",
    message: "Falha ao carregar chunk do deploy",
  });

  event.preventDefault();
  currentUrl.searchParams.set(CHUNK_RETRY_PARAM, String(Date.now()));
  window.location.replace(currentUrl.toString());
});

// Se a pagina conseguiu iniciar apos a recuperacao, removemos o parametro sem
// recarregar. Assim URLs compartilhadas continuam limpas.
const bootUrl = new URL(window.location.href);
if (bootUrl.searchParams.has(CHUNK_RETRY_PARAM)) {
  window.setTimeout(() => {
    const cleanUrl = new URL(window.location.href);
    cleanUrl.searchParams.delete(CHUNK_RETRY_PARAM);
    window.history.replaceState(
      window.history.state,
      "",
      `${cleanUrl.pathname}${cleanUrl.search}${cleanUrl.hash}`,
    );
  }, 10000);
}

// Compatibilidade visual da busca administrativa: o backend da tela de produtos
// ja aceita EAN/codigo de barras, SKU e codigo Trier. Este ajuste garante que a
// interface nao continue exibindo o texto legado "Buscar por nome..." enquanto
// as telas administrativas sao migradas para o novo padrao de busca.
function syncProductSearchHint() {
  document
    .querySelectorAll<HTMLInputElement>('input[placeholder="Buscar por nome..."]')
    .forEach((input) => {
      input.placeholder = "Buscar por nome, SKU, código Trier ou código de barras...";
      input.setAttribute(
        "aria-label",
        "Buscar produto por nome, SKU, código Trier ou código de barras",
      );
    });
}

const searchHintObserver = new MutationObserver(syncProductSearchHint);
searchHintObserver.observe(document.documentElement, { childList: true, subtree: true });

createRoot(document.getElementById("root")!).render(
  <GlobalErrorBoundary>
    <HelmetProvider>
      <App />
    </HelmetProvider>
  </GlobalErrorBoundary>,
);

syncProductSearchHint();
