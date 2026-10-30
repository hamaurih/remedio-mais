# Correções médias de UX da loja pública — M2, M3 e M4

Correções aprovadas por Amauri. Branch `fix/ux-media-loja-publica`, baseada em `origin/main` atualizado em 30/10/2026. Escopo restrito à apresentação pública, sem mudanças em autenticação, administração, checkout, pagamentos, ERP, banco ou configuração de deploy.

## M1 — mantido intencionalmente

As imagens genéricas “Venda sob prescrição” com a marca da loja nos medicamentos Rx foram intencionalmente mantidas por exigência legal informada pelo dono. Nenhuma alteração no tratamento de imagens ou produtos.

## M2 — contraste de Melhores Ofertas

Arquivo: `src/components/ProductShelf.tsx`.

Antes: subtítulo com `text-muted-foreground`; “Ver todos →” com `text-primary`. A auditoria apontava #6A707C e #DA1B2E sobre #FFCE0A, respectivamente 3,34:1 e 3,37:1. O tema atual também tem sobrescrita de muted-foreground na loja pública; esses valores de antes são os registrados na auditoria.

Depois: somente na variante `highlight`, subtítulo e link/seta usam o token existente `text-highlight-foreground`. O link tem sublinhado permanente. O estado vazio usa o mesmo token para manter legibilidade. As demais variantes mantêm suas classes anteriores. Fundo amarelo, título, selo, cards e ordem das seções preservados.

Contrastes calculados a partir das cores computadas pelo Chromium:

| Elemento | Texto/token | Fundo/token | Razão final |
| --- | --- | --- | --- |
| Os maiores descontos da loja | `highlight-foreground`: rgb(68, 29, 4), #441D04 | `highlight`: rgb(255, 206, 10), #FFCE0A | **9,896:1** |
| Ver todos e seta → | `highlight-foreground`: #441D04 | `highlight`: #FFCE0A | **9,896:1** |
| Mensagem de vitrine vazia | `highlight-foreground`: #441D04 | `highlight`: #FFCE0A | **9,896:1** |

Método WCAG: normalizar canais sRGB para 0–1; linearizar com `c/12,92` se `c ≤ 0,04045`, senão `((c+0,055)/1,055)^2,4`; luminância `L = 0,2126R + 0,7152G + 0,0722B`; contraste `(Lmaior+0,05)/(Lmenor+0,05)`. Todos acima do mínimo AA de 4,5:1 para texto pequeno. O teste de navegador calcula o contraste do subtítulo e link a partir de `getComputedStyle`.

## M3 — navegação horizontal desktop

Arquivo: `src/components/CategoryNav.tsx`.

Antes: lista com overflow horizontal e scrollbar oculta, sem indicação de conteúdo fora da área visível.

Depois: botões shadcn `Button`/ghost com ícones Lucide e rótulos “Categorias anteriores” / “Mais categorias”, mostrados somente quando existe conteúdo no respectivo lado. Espaços laterais estáveis no desktop evitam deslocamento da lista ao trocar de seta. O viewport e seu conteúdo são observados com `ResizeObserver`, além de eventos de resize e scroll, cobrindo menus remotos e fontes carregadas depois da montagem. O estado só muda quando muda a disponibilidade de algum lado.

Rolagem suave por clique/Enter/Espaço nos botões ou setas do teclado com foco na região “Categorias da loja”. Todos os links continuam no fluxo de Tab e o navegador revela o link focado. Nenhuma categoria foi removida, escondida ou reordenada. Os espaços/botões das setas não ocupam área no mobile; a navegação continua fora do header sticky mobile.

## M4 — um caminho de WhatsApp na home mobile

Arquivos: `src/components/HomeTopCta.tsx`, `src/components/BenefitCards.tsx`, `src/components/PrescriptionCTA.tsx`, `src/components/Footer.tsx`.

A investigação mostrou que o header atual já não contém WhatsApp. A entrada fixa existente está em `WhatsAppFab`, que no mobile é uma barra com WhatsApp e Carrinho. Mantê-la oferece acesso constante e preserva a ação de Carrinho sem criar um novo FAB nem redesenhar a página.

Na home abaixo de 768px foram ocultados os links duplicados da faixa inicial, do card de suporte, da seção de receita e do rodapé (ícone social e telefone clicável). O telefone permanece como texto no rodapé. Os três primeiros componentes são usados exclusivamente na home; no rodapé compartilhado a condição é explicitamente `pathname === "/"`. Não há mudança na ordem das seções ou nas cores.

Desktop mantém todos os acessos. Outras páginas mantêm os acessos existentes. `Header`, `WhatsAppFab` e a página de produto não foram alterados: Login/Carrinho preservados e produto continua com a barra A5 e seu ícone secundário, sem entrada fixa mobile duplicada.

## Fundação shadcn e validação

npm; React 18/Vite; Tailwind 3; shadcn estilo `default`, base Radix/Slate, aliases `@/`, Lucide. Consultados `npx shadcn@latest info`, `search @shadcn -q "scroll"`, `docs button` e `view @shadcn/button`. Sem registries personalizados configurados. Reutilizado `@shadcn/button` já instalado, sem sobrescrita, instalação de componentes ou mudança de dependências. A lista nativa existente permite observar o overflow sem trocar sua estrutura por carousel/scroll-area.

Testes adicionados: `src/test/categoryOverflow.test.tsx`, `src/test/highlightShelf.test.tsx` e `e2e/public-ux-media.spec.ts`. O primeiro cobre início/meio/fim, ausência de overflow, resize, clique e teclado; o segundo cobre variante amarela, estado vazio, preservação de outras variantes e loading. Playwright verifica categorias a 1280 e 1440px, contagem de links WhatsApp visíveis em toda a home a 390×844, header ≤112px, Login/Carrinho, acesso no rodapé de outra página, desktop e contraste real. O teste existente `e2e/public-ux.spec.ts` verifica também a barra de produto com dados reais, sem fabricar estoque.

Reversão simples dos componentes desta branch; nenhuma migração ou configuração externa necessária. `public/sitemap.xml` é gerado pelo build e foi excluído da entrega; `test-results/` permanece não rastreado.

### Resultado final

- `npm run test`: **25 arquivos, 156 testes aprovados, 0 falhas**.
- `npm run build`: **aprovado**, 3469 módulos transformados. Dois avisos preexistentes sobre imports simultaneamente estáticos/dinâmicos de `metaEvents.ts` e `cartFunnel.ts`.
- ESLint dos **9 arquivos TS/TSX alterados/adicionados**: **0 erros, 1 warning preexistente** (`Footer.tsx`, `Field` usa `any`, linha 65; mesmo trecho em origin/main na linha 64).
- `npx playwright test e2e/public-ux-media.spec.ts e2e/public-ux.spec.ts --project=chromium`: **5 aprovados, 0 falhas**. M3 em 1280 e 1440px; M4 em 390×844 com exatamente **1 link WhatsApp visível**, inclusive após percorrer a home; regressão A4/A5 aprovada com produto real. Capturas inspecionadas em `/tmp/remedio-ux-{home-390,footer-390,nav-1280,nav-1440,ofertas}.png` (artefatos locais, não versionados).
- Checagem adicional `npx tsc --noEmit -p tsconfig.app.json`: **3 erros fora do escopo**, em `AdminDashboardCharts.tsx:81` (TS2769), `useStoreSettings.ts:33` (TS2352) e `AdminOrders.tsx:256` (TS2367). Nenhum desses arquivos foi alterado.
- Revisão independente do diff não encontrou regressões nas correções; o sitemap gerado foi identificado e restaurado antes do commit.

Sem bloqueio para revisão do PR. Os avisos e erros preexistentes acima permanecem como pendências fora do escopo. Nenhum merge ou deploy foi realizado.
