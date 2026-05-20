# Atacadão dos Medicamentos — E-commerce Farmacêutico

E-commerce + painel admin da **Farmácia Atacadão dos Medicamentos**, construído em React + Vite + TypeScript + Tailwind + shadcn/ui, com backend Supabase (Auth, Postgres, Storage, Edge Functions) e integração com o ERP **Trier Drogarias**.

Este projeto é totalmente independente do Lovable — pode ser clonado do GitHub e rodado/deployado em qualquer ambiente (Vercel, Netlify, VPS, etc.).

---

## 1. Stack

- **Frontend:** React 18, Vite 5, TypeScript 5, TailwindCSS 3, shadcn/ui, React Router, TanStack Query, Framer Motion, Zod
- **Backend (Lovable Cloud / Supabase):**
  - Auth (e-mail/senha + roles via tabela `user_roles`)
  - Postgres com RLS em todas as tabelas
  - Storage buckets: `products` (público), `banners` (público), `prescriptions` (privado)
  - Edge Function `trier` (sincroniza produtos do ERP Trier)
- **Integrações:** Trier Drogarias API, WhatsApp (link direto)

---

## 2. Variáveis de ambiente

### Frontend (`.env` na raiz)

Apenas chaves **públicas**. Nenhum segredo do Supabase ou Trier deve ficar no frontend.

```env
VITE_SUPABASE_URL="https://SEU_PROJECT_REF.supabase.co"
VITE_SUPABASE_PUBLISHABLE_KEY="eyJhbGciOiJIUzI1...anon-key..."
VITE_SUPABASE_PROJECT_ID="SEU_PROJECT_REF"
```

> `VITE_SUPABASE_PUBLISHABLE_KEY` é a **anon key** do Supabase — pode ser exposta. A segurança vem das policies de RLS.

### Backend (Edge Function `trier`) — secrets no Supabase

Configurar em **Supabase Dashboard → Project Settings → Edge Functions → Secrets** (ou via CLI `supabase secrets set`):

| Secret | Descrição |
|---|---|
| `TRIER_API_TOKEN` | Token Bearer da API Trier Drogarias |
| `SUPABASE_URL` | URL do projeto (auto‑injetado) |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role (auto‑injetado) — usado apenas server-side |
| `SUPABASE_ANON_KEY` | Anon key (auto‑injetado) |
| `LOVABLE_API_KEY` | (Opcional) Lovable AI Gateway — só se for usar IA |

**Nunca** colocar `SERVICE_ROLE_KEY` ou `TRIER_API_TOKEN` em variáveis `VITE_*`.

---

## 3. Instalação local

```bash
git clone https://github.com/SEU_USUARIO/SEU_REPO.git
cd SEU_REPO

# Pré-requisitos: Node 18+ ou Bun
bun install        # ou: npm install

cp .env.example .env   # preencha as 3 variáveis VITE_*
bun run dev            # http://localhost:8080
```

---

## 4. Setup do Supabase do zero

1. Criar projeto em [supabase.com](https://supabase.com).
2. Aplicar migrações:
   ```bash
   npx supabase link --project-ref SEU_REF
   npx supabase db push
   ```
   (todas as migrações ficam em `supabase/migrations/`)
3. Criar os buckets de storage (se não existirem):
   - `products` — público
   - `banners` — público
   - `prescriptions` — privado
4. Em **Authentication → Providers**: habilitar **Email** (e Google, se desejado).
5. Em **Edge Functions**, fazer deploy do `trier`:
   ```bash
   npx supabase functions deploy trier --no-verify-jwt
   npx supabase secrets set TRIER_API_TOKEN=...
   ```
6. Conceder admin ao seu usuário:
   ```sql
   insert into public.user_roles (user_id, role)
   values ('SEU_AUTH_UID', 'admin');
   ```

---

## 5. Deploy externo

### Vercel
1. Importar o repositório no Vercel.
2. Framework: **Vite**. Build: `bun run build` (ou `npm run build`). Output: `dist`.
3. Adicionar as 3 env vars `VITE_*` em **Project Settings → Environment Variables**.
4. Deploy. SPA routing já funciona (Vercel detecta Vite automaticamente). Se necessário, criar `vercel.json`:
   ```json
   { "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }] }
   ```

### Netlify
1. Build command: `bun run build`. Publish directory: `dist`.
2. Adicionar as 3 env vars `VITE_*`.
3. Criar `public/_redirects`:
   ```
   /*  /index.html  200
   ```

### Domínio próprio
- Apontar DNS para Vercel/Netlify.
- Ativar HTTPS automático.

---

## 6. Estrutura do projeto

```
src/
  components/        # UI (Header, Footer, ProductCard, ProductQuickView, ...)
  components/ui/     # shadcn primitives
  pages/             # rotas públicas (Index, Category, Product, Cart, Auth, ...)
  pages/admin/       # painel admin (Products, Banners, Trier, Settings, ...)
  hooks/             # useAuth, useCart, useStoreSettings
  lib/               # store (cart), pix, quickview, utils
  integrations/supabase/  # client + types (auto-gerados — NÃO editar)
supabase/
  functions/trier/   # edge function de sincronização ERP
  migrations/        # SQL versionado
```

---

## 7. Persistência

Toda informação relevante vive no **Supabase**:

- `products`, `categories`, `banners`, `offers`, `orders`, `order_items`, `prescriptions`, `store_settings`, `profiles`, `user_roles`
- Imagens em **Storage** (`products`, `banners`, `prescriptions`)

O único uso de `localStorage` é o **carrinho de compras** (UX — não exige login). Pedidos são persistidos no banco ao finalizar.

---

## 8. Segurança

- RLS habilitado em todas as tabelas; roles validadas via função `has_role()` (SECURITY DEFINER).
- Admin **nunca** verificado por flag de cliente — sempre via tabela `user_roles`.
- Apenas **anon key** no frontend.
- `SERVICE_ROLE_KEY` e `TRIER_API_TOKEN` ficam exclusivamente em edge functions.
- Edge function `trier` valida payload com Zod.

---

## 9. Checklist técnico para produção fora do Lovable

- [ ] Repositório criado no GitHub e código sincronizado
- [ ] Projeto Supabase criado (próprio, fora do Lovable Cloud)
- [ ] Migrações aplicadas (`supabase db push`)
- [ ] Buckets `products`, `banners`, `prescriptions` criados com policies corretas
- [ ] Edge function `trier` deployada
- [ ] Secret `TRIER_API_TOKEN` configurado no Supabase
- [ ] Provedor Email habilitado em Auth (e Google, se necessário)
- [ ] Templates de e-mail customizados (confirmação, reset senha)
- [ ] URL do site configurada em **Auth → URL Configuration** (Site URL + Redirect URLs)
- [ ] Primeiro usuário admin inserido em `user_roles`
- [ ] Variáveis `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_PROJECT_ID` no Vercel/Netlify
- [ ] Build rodando (`bun run build`) sem erros
- [ ] SPA fallback configurado (`vercel.json` ou `_redirects`)
- [ ] Domínio próprio + HTTPS
- [ ] Cron/agendador chamando edge function `trier` (ex.: cron-job.org, Supabase Scheduled Functions) para sincronização periódica
- [ ] Backup automático do Postgres habilitado (Supabase Pro)
- [ ] Logs/observabilidade ativados (Supabase Logs, Vercel Analytics)
- [ ] WhatsApp Business configurado com o número usado em `store_settings.whatsapp`
- [ ] Política de privacidade e termos de uso publicados
- [ ] LGPD: revisar coleta de dados em `orders` e `prescriptions`

---

## 10. Comandos úteis

```bash
bun run dev          # dev server (porta 8080)
bun run build        # build de produção → dist/
bun run preview      # serve o build localmente
bun run lint         # eslint
bun run test         # vitest

# Supabase CLI
npx supabase db push                     # aplica migrações
npx supabase functions deploy trier      # redeploya edge function
npx supabase gen types typescript --linked > src/integrations/supabase/types.ts
```

---

## Suporte

Em caso de dúvida sobre a integração Trier, verificar logs em **Supabase → Edge Functions → trier → Logs**.
