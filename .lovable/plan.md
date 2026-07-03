# Auditoria e Controle de Qualidade — Atacadão dos Medicamentos

Objetivo: mapear tudo que existe hoje, classificar por status (funciona / quebrado / sem uso / precisa melhorar) e sair com um checklist claro para o site entrar em operação real.

Fiz uma varredura inicial no banco e no código. Números-chave que já mudam a estratégia:

- **23.474 produtos no total**, mas só **3.904 ativos** e **3.926 com estoque** — o resto é lixo do Trier ocupando o banco.
- **21.080 produtos sem imagem** (~90%), **2.076 sem EAN**, **723 sem categoria**.
- **7 pedidos** no total (todos nos últimos 30 dias) — plataforma ainda não está em uso real.
- **0 tiles no mosaico da home**, **0 prescrições enviadas**, **1 campanha**, **3 banners**, **45 variantes**, **2 clientes**.

Isto é uma auditoria — o entregável é um **relatório** que vou gerar no admin, não uma refatoração cega. Depois você decide o que atacar.

---

## Fase 1 — Diagnóstico automático (o que vou construir agora)

Criar **`/admin/auditoria`**, uma página única de controle de qualidade que consolida:

### 1.1 Saúde do catálogo
- Ativos vs inativos vs sem estoque (do jeito que já mostra no Data Quality, mas somando tudo).
- Produtos "zumbis": inativos + sem estoque + sem venda nunca → candidatos a arquivar.
- Duplicados por EAN e por nome.
- Produtos com preço promocional inválido (promo ≥ preço, promo negativo).
- Fotos quebradas (image_url apontando para URL que retorna 404) — verificação por amostragem.

### 1.2 Saúde das páginas públicas
Checklist automático rodando contra cada rota (`/`, `/departamentos`, `/categoria/*`, `/produto/*`, `/carrinho`, `/checkout`, `/enviar-receita`, `/minha-conta`, `/auth`):
- Renderiza sem erro de console?
- Requests para `products` retornam dados?
- SEO mínimo (title, description, H1)?

### 1.3 Saúde do admin
Lista das 26 páginas admin com:
- Última vez que foi acessada (via logs).
- Se ainda faz sentido existir (ex.: `AdminBannerGenerator`, `AdminHomeDiagnostics`, `AdminProductsReconcile` — provavelmente sobras de setup).
- Se depende de dado que não existe (ex.: `AdminPrescriptions` com 0 prescrições, `AdminMosaic` com 0 tiles).

### 1.4 Saúde das integrações
- **Trier**: última sincronização, taxa de erro nos últimos 7 dias, produtos bloqueados por `lock_manual_price`/`lock_manual_stock`.
- **Mercado Pago**: pedidos com `payment_status` travado, webhooks recebidos vs esperados.
- **WhatsApp Agent**: se está sendo chamado.
- **Google Maps**: se as chaves estão ativas.

### 1.5 Edge Functions
Para cada uma das 13 functions: última invocação, taxa de erro, tempo médio. Marca como "sem uso há 30d" as candidatas a remover.

### 1.6 Segurança e RLS
Rodar o linter do banco e listar tabelas sem policy adequada, GRANTs faltando (foi o problema de ontem com `products`), e políticas permissivas demais.

---

## Fase 2 — Relatório enxuto (o que você vai ler)

Depois que a página rodar, gero um resumo em 1 tela dividido em 4 blocos:

| Bloco | O que mostra |
|---|---|
| ✅ **Funcionando** | Módulos com dados, sem erro, com uso recente |
| ⚠️ **Precisa melhorar** | Funciona mas com problema de qualidade (ex.: 90% sem foto) |
| ❌ **Quebrado** | Erro em produção, integração falhando, dado inconsistente |
| 🗑️ **Ocupando espaço** | Páginas/tabelas/functions sem uso — candidatas a remover |

Cada item vira uma linha acionável com botão "corrigir" ou "arquivar".

---

## Fase 3 — Limpeza guiada (só depois de você aprovar item por item)

Nada será deletado sem sua confirmação. Ações típicas que vão aparecer:

- **Arquivar em massa** os ~19.500 produtos sem estoque e sem venda (mover para `archived=true`, não deletar).
- **Remover páginas admin não usadas** (ex.: geradores/diagnósticos de setup).
- **Desligar edge functions órfãs**.
- **Consertar SEO faltando** (title/description por página).
- **Fechar buracos de RLS/GRANT** que o linter apontar.

---

## Detalhes técnicos

- Nova página: `src/pages/admin/AdminAudit.tsx` + rota em `AdminLayout`.
- Nova edge function `audit-report` (SECURITY DEFINER) que roda todas as queries pesadas server-side e devolve JSON agregado — assim o admin não bate 20 queries do browser.
- Reaproveita o que já existe em `AdminDataQuality`, `AdminHomeDiagnostics`, `AdminStock` — não duplica lógica, só consolida.
- Não mexe em nada de storefront nesta fase.

---

## Fora do escopo desta primeira entrega

- Refatoração de código (só diagnostica).
- Remoção efetiva de qualquer arquivo/tabela (só lista candidatos).
- Redesign visual.

Se aprovar, começo pela Fase 1 e te entrego a página `/admin/auditoria` já populada com dados reais. Depois vamos item por item nas Fases 2 e 3.
