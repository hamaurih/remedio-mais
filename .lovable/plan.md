# Plano: Ranking manual, relacionados e sugestão de genérico

## 1. Mais vendidos — ordem manual

**Banco:** novo campo `bestseller_rank int` em `products` (null = não aparece na vitrine; quanto menor, mais à frente).

**Admin (`AdminProducts.tsx`):**
- Nova coluna "Vitrine #" com input numérico inline (salva ao sair do campo).
- Novo botão "Organizar Mais Vendidos" que abre um modal com a lista atual ordenada, com drag-and-drop (`@dnd-kit`) — salvar reescreve os `bestseller_rank` em sequência (10, 20, 30…).

**Site (`Index.tsx` shelf "Mais Vendidos"):**
- Passa a buscar `products` com `bestseller_rank not null` ordenado asc (limit 12).
- Fallback antigo (featured/recentes) só usado se ninguém estiver rankeado.

## 2. Produtos relacionados

**Banco:**
- Nova tabela `product_related (product_id, related_product_id, position int)` — PK composta, FKs com cascade.
- Coluna `active_ingredient text` em `products` (também usada pelo item 3).

**Admin (editor do produto em `AdminProducts.tsx`):**
- Nova seção "Produtos Relacionados" com `EntityPicker` permitindo escolher manualmente vários produtos + ordem (drag).

**Site (`Product.tsx`):** novo bloco "Produtos relacionados" abaixo da descrição.

Lógica de seleção (hook `useRelatedProducts`):
1. Se existirem manuais em `product_related` → usa eles na ordem definida.
2. Senão, busca automaticamente até 8 produtos ativos com estoque, priorizando nesta ordem: mesmo `active_ingredient` → mesma `category_id` + mesmo `manufacturer` → mesma `category_id`. Exclui o próprio produto e variantes.

## 3. Aviso de genérico/similar

**Banco em `products`:**
- `is_generic boolean default false` — marca produtos que SÃO genéricos.
- `generic_equivalent_id uuid` — link manual: produto de marca → produto genérico equivalente.
- Reaproveita `active_ingredient` do item 2 para fallback automático.

**Admin:** no editor de produto, dois campos novos:
- Checkbox "Este produto é genérico".
- Selector "Genérico equivalente" (só aparece se não for genérico) — busca produtos com `is_generic = true`.

**Lógica de sugestão (`useGenericSuggestion(product)`):**
1. Se produto já é genérico ou controlado → não sugere nada.
2. Se tem `generic_equivalent_id` → usa ele (manual).
3. Senão, busca automaticamente: produto ativo com estoque, `is_generic = true`, mesmo `active_ingredient`, preço final menor que o atual, ordenado por preço asc → pega o mais barato.
4. Só retorna se a economia for ≥ 5%.

**UI:**
- **Modal ao clicar "Adicionar ao carrinho"** em `ProductCard` e `Product.tsx`: se houver sugestão, abre modal "Existe um genérico equivalente: [nome] por R$X — economia de Y%" com botões "Trocar pelo genérico" / "Continuar com o original".
- **Aviso no carrinho (`Cart.tsx`):** para cada item que tem sugestão, mostra linha discreta "💊 Existe genérico mais barato: R$X (economize Y%)" com botão "Trocar".

## Detalhes técnicos

**Migrações (uma só):**
- `ALTER TABLE products ADD COLUMN bestseller_rank int, active_ingredient text, is_generic boolean default false, generic_equivalent_id uuid REFERENCES products(id) ON DELETE SET NULL;`
- `CREATE INDEX` em `bestseller_rank`, `active_ingredient`, `is_generic`.
- `CREATE TABLE product_related (...)` + GRANT (`SELECT` para anon/authenticated; `ALL` para service_role; admin gerencia via `has_role`) + RLS + policies.

**Arquivos novos:**
- `src/hooks/useRelatedProducts.ts`
- `src/hooks/useGenericSuggestion.ts`
- `src/components/GenericSuggestionDialog.tsx`
- `src/components/admin/BestsellersReorderDialog.tsx`
- `src/components/admin/RelatedProductsPicker.tsx`

**Arquivos editados:**
- `src/pages/admin/AdminProducts.tsx` — coluna rank, botão organizar, campos genérico, picker relacionados
- `src/pages/Index.tsx` — query "Mais Vendidos" usa `bestseller_rank`
- `src/pages/Product.tsx` — bloco relacionados + integração modal genérico
- `src/components/ProductCard.tsx` — interceptar "Adicionar" para checar sugestão
- `src/pages/Cart.tsx` — aviso por item com botão trocar

**Dependência:** `@dnd-kit/core` + `@dnd-kit/sortable` (drag-and-drop dos mais vendidos e relacionados).

Posso prosseguir?