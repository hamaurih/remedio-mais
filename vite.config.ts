import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
  build: {
    // Suporte a Safari/iOS 12.2+; transpila sintaxe moderna quando necessario.
    target: "safari12.2",
    cssCodeSplit: true,
    modulePreload: {
      resolveDependencies: (_filename, deps, context) =>
        context.hostType === "html"
          ? deps.filter((dep) => !dep.includes("admin-import-parsers"))
          : deps,
    },
    rollupOptions: {
      output: {
        manualChunks(id) {
          // Importadores de Excel/CSV/XML são usados apenas no administrativo.
          // Não os forçamos em um chunk manual compartilhado porque o Rollup pode
          // colocar helpers comuns nesse chunk e fazer o React público depender dele
          // antes mesmo de montar a aplicação. As rotas lazy do admin mantêm esses
          // pacotes fora do bootstrap público automaticamente.
          if (id.includes("node_modules/react/") || id.includes("node_modules/react-dom/") || id.includes("node_modules/scheduler/")) {
            return "react-vendor";
          }
          if (id.includes("node_modules/react-router") || id.includes("node_modules/@remix-run/router")) {
            return "router-vendor";
          }
          if (id.includes("node_modules/@tanstack/")) {
            return "query-vendor";
          }
          if (id.includes("node_modules/@supabase/")) {
            return "supabase-vendor";
          }
        },
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime", "@tanstack/react-query", "@tanstack/query-core"],
  },
}));
