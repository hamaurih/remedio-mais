import { createRoot } from "react-dom/client";
import { HelmetProvider } from "react-helmet-async";
import App from "./App.tsx";
import "./index.css";

// Vite dispara este evento quando uma pagina antiga tenta carregar um chunk
// removido por um deploy novo. No Safari/iOS isso pode resultar em tela branca.
// Fazemos uma unica recarga com cache-busting e evitamos loop infinito.
const CHUNK_RETRY_PARAM = "_chunk_retry";

window.addEventListener("vite:preloadError", (event) => {
  const currentUrl = new URL(window.location.href);
  if (currentUrl.searchParams.has(CHUNK_RETRY_PARAM)) return;

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
  <HelmetProvider>
    <App />
  </HelmetProvider>
);

syncProductSearchHint();
