# Correções altas da loja pública

Plano: (1) login administrativo separado com papéis existentes admin/seller, guard com AAL2 e cadastro/desafio TOTP; validar senha forte no fluxo de redefinição para staff; (2) compartilhar conferência real de estoque entre alerta e resumo, limitar adições e quantidades; (3) corrigir exclusivamente piso e contraste tipográfico público; (4) manter apenas logo/ícones e busca no sticky mobile; (5) barra contextual no produto reutilizando o mesmo handler de adição.

Preservar layout, marca, ordem, contratos de pagamento e permissões existentes. Sem migration ou alteração remota. Validar testes de guard e estoque, suíte Vitest, build, lint alterado e preview mobile 390x844. Rollback: reverter os commits deste PR; não há dados a reverter.

## Implementação e arquivos

- A1: `src/App.tsx`, `src/pages/admin/AdminLogin.tsx`, `src/pages/admin/AdminLayout.tsx`, `src/lib/adminAccess.ts`, `src/hooks/useAuth.ts`, `src/pages/ResetPassword.tsx`, `src/pages/admin/AdminRegistrations.tsx`, `supabase/functions/admin-user-security/index.ts`: login dedicado; papéis confiáveis existentes admin/seller; guard exige AAL2; cadastro/desafio TOTP sem flag de bypass; senha staff de 12–128 caracteres com maiúscula, minúscula, número e símbolo; falha de consulta de papéis bloqueia redefinição. Sem mudança de cadastro/login de clientes em `/auth`.
- A2: `src/lib/store.ts`, `src/components/CartLiveAlert.tsx`, `src/pages/Cart.tsx`, `src/components/ProductCard.tsx`, `src/components/ProductQuickView.tsx`, `src/pages/Product.tsx`, `src/components/GenericSuggestionDialog.tsx`: estoque disponível e quantidade acumulada; mutações recusam excesso sem anunciar sucesso; carrinho consulta simples em lotes de até 30 e variantes no Supabase; resumo e avanço bloqueados até conferir todos os itens e resolver insuficiência. Estoque remoto atualizado prevalece sobre limite antigo na edição do carrinho. Respostas antigas são descartadas.
- A3: `src/index.css`, `src/components/Layout.tsx`, `src/components/{CampaignAutoBanner,CampaignShelf,Footer,GenericSuggestionDialog,Header,HeroSlider,ProductCard,ProductQuickView,ProductShelf,PromoBanner,PromoMosaic,SearchAutocomplete,WhatsAppFab}.tsx`, `src/pages/{Campaign,Cart,Index,Product}.tsx`: piso de 12px, incluindo estilos inline do slider; laboratório/preço riscado 12px, principal do card 22px; token secundário público próximo a #4B5563. Marca e fontes preservadas; texto dentro de imagens existentes não foi redesenhado.
- A4: `src/components/Header.tsx`: sticky mobile contém linha de logo/ícones e busca; categorias rolam fora do sticky. Faixa “Compre online” já fica fora do header. Desktop preservado.
- A5: `src/pages/Product.tsx`, `src/components/WhatsAppFab.tsx`: barra contextual mobile de preço, adicionar e ícone WhatsApp; mesma ação/validação de estoque; barra geral omitida apenas no produto mobile. FAB desktop preservado.
- Testes: `src/test/publicUx.test.ts`, `src/test/publicUxRoutes.test.tsx`, `e2e/public-ux.spec.ts`.

Reuso shadcn: Button, Input, Label, Card e Alert locais; Dialog/Sheet existentes preservados. CLI `info`, `search @shadcn -q login`, `docs input` e `view @shadcn/input` inspecionados. Nenhum componente sobrescrito ou dependência adicionada.

## Passos manuais antes de liberar

1. Revisar o PR; não houve merge ou deploy em produção.
2. Confirmar MFA TOTP permitido no painel Supabase Auth. O SDK instalado suporta `auth.mfa`; o fluxo segue a [documentação oficial TOTP](https://supabase.com/docs/guides/auth/auth-mfa/totp). Caso haja restrição externa, o login falha fechado; não existe bypass de MFA.
3. Usar uma conta com papel existente `admin` (ou `seller` para sua área), senha forte e aplicativo autenticador. Não criamos conta ou alteramos senha real. Testar cadastro TOTP, código inválido, novo login/desafio e recuperação com conta de homologação. Sem credenciais staff disponíveis, essas operações remotas não foram exercitadas.
4. Publicar, após aprovação e pelo processo habitual, a função `admin-user-security` atualizada para a regra de senha staff também valer na redefinição administrativa pelo servidor. Nenhuma migration é necessária. A tela de recuperação mantém o endpoint `secure-password` já referenciado pelo projeto; sua implementação não existe neste checkout e deve ser verificada no ambiente, inclusive para política staff no servidor. A validação da interface foi implementada e falha fechado quando o papel não pode ser determinado.
5. MFA é exigido pelo guard do painel. Não alteramos RLS nem contratos das APIs: eventual exigência de AAL2 diretamente em todas as APIs administrativas é uma política de backend adicional, fora desta correção de login.

## Evidências

- Vitest: 23 arquivos, 154 testes aprovados (11 testes novos de autorização/MFA/estoque).
- Build de produção aprovado.
- ESLint nos arquivos alterados/novos: 0 erros, 124 avisos (principalmente `any` já utilizado no projeto).
- Typecheck adicional: 3 erros preexistentes e fora do diff em `src/components/admin/dashboard/AdminDashboardCharts.tsx:81`, `src/hooks/useStoreSettings.ts:33`, `src/pages/admin/AdminOrders.tsx:256`. Não há script typecheck em package.json; foi usado `npx tsc --noEmit -p tsconfig.app.json`.
- Playwright: 1 teste aprovado em viewport 390×844, com catálogo real, header <=112px e barra contextual visível. Medição manual no Chromium: header sticky **101px**, redirecionamento `/admin` → `/admin/login`, nenhum erro JavaScript nessa navegação. Preview mobile inspecionado visualmente; FAB geral não aparece junto da barra contextual no mobile.
- `test-results/` permaneceu fora do commit. Sitemap gerado durante build excluído da entrega.
