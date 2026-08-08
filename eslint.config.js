import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      "@typescript-eslint/no-unused-vars": "off",
      // O projeto usa `as any` de propósito nas consultas ao banco (tipos gerados
      // não cobrem todas as colunas). Mantemos como aviso para que erros de lint
      // reais fiquem visíveis em vez de afogados em ~900 ocorrências.
      "@typescript-eslint/no-explicit-any": "warn",
    },
  },
  {
    // Arquivos gerados (tipos do backend, config do Tailwind) e primitivos
    // shadcn/ui seguem convenções próprias que não devemos reescrever.
    files: ["src/components/ui/**", "src/integrations/**", "tailwind.config.ts"],
    rules: {
      "@typescript-eslint/no-empty-object-type": "off",
      "@typescript-eslint/ban-ts-comment": "off",
      "@typescript-eslint/no-require-imports": "off",
    },
  },
);

