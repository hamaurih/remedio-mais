import { createRoot } from "react-dom/client";
import { HelmetProvider } from "react-helmet-async";
import App from "./App.tsx";
import "./index.css";

// Compatibilidade visual da busca administrativa: o backend da tela de produtos
// já aceita EAN/código de barras, SKU e código Trier. Este ajuste garante que a
// interface não continue exibindo o texto legado "Buscar por nome..." enquanto
// as telas administrativas são migradas para o novo padrão de busca.
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
