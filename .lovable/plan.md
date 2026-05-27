# Melhorias inspiradas em grandes e-commerces farmacêuticos

Vou aplicar apenas as 7 melhorias pedidas, sem refazer site, sem mexer em Trier/auth/admin de produtos/carrinho/receitas.

## 1. MegaMenu no CategoryNav
- Refatorar `src/components/CategoryNav.tsx` adicionando item "Todas as Categorias" com mega menu suspenso (desktop) em colunas por macro-categoria:
  - Medicamentos e Saúde
  - Dermo e Beleza
  - Higiene Pessoal
  - Mamães e Bebês
  - Vitaminas e Suplementos
  - Conveniência
  - Primeiros Socorros
- Subcategorias buscadas da tabela `categories` (públicas, active=true) e agrupadas por mapping local de macro → slugs.
- Mobile: `Sheet` lateral com `Accordion` por macro-categoria.
- Resto da nav (chips horizontais) preservado.

## 2. Evoluir HeroSlider (visual only)
- Adicionar campos opcionais ao tipo `HeroSlide`: `badge_text`, `discount_text`, `price_text`, `product_image_url`, `background_style` (variants: `light`, `soft-pink`, `soft-blue`, `soft-mint`).
- Cada slide:
  - Fundo claro / gradiente suave conforme `background_style`.
  - Selo (badge) topo-esquerda usando vermelho como acento.
  - Bloco de preço grande (price_text) com vermelho só no número, e desconto em pílula amarela/vermelha.
  - Imagem do produto (product_image_url) com pedestal e sombra (igual ao tratamento atual).
- Sem fundo vermelho sólido. Banco não muda — campos extras são opcionais; admin existente continua funcionando, dados extras virão por enquanto via fallbacks/mosaico até o admin ser estendido.

## 3. PromoMosaic dinâmico
- Criar nova tabela `home_mosaic_tiles` (id, position, size: 'lg'|'sm', title, subtitle, badge_text, cta_text, link, image_url, bg_style, active).
- RLS: leitura pública só `active=true`, escrita admin.
- Refatorar `PromoMosaic` para buscar essas tiles via React Query e renderizar 1 grande + 2-4 pequenas.
- Adicionar página admin `AdminMosaic` (CRUD simples) e rota no `AdminLayout`.

## 4. PromoBanner mais leve
- Remover restos de vermelho chapado; usar cards brancos/rosa-claro alternados.
- Garantir imagem do produto visível (não cortada), old_price riscado pequeno, new_price grande, selo vermelho discreto.
- Ajustar grid mobile (scroll horizontal snap, 1.2 cards visíveis).

## 5. Módulo de Campanhas
- Criar tabela `campaigns` (id, name, slug, starts_at, ends_at, banner_image_url, banner_link, cta_text, visual_style, active, published).
- Criar tabela `campaign_products` (campaign_id, product_id, position).
- RLS: leitura pública só `active=true AND published=true AND (starts_at IS NULL OR now() BETWEEN starts_at AND ends_at)`; escrita admin.
- Página admin `AdminCampaigns`: lista + form (nome, slug, período, banner, produtos vinculados via search, ativa, publicada, estilo).
- Home: nova seção `CampaignShelf` que renderiza campanha ativa + prateleira dos produtos vinculados, posicionada logo após HeroSlider/PromoMosaic.

## 6. ProductQuickView — "Aproveite e compre também"
- Melhorar seção de relacionados: query com prioridade
  1. mesma `category_id`,
  2. mesmo `group_code` (Trier) se existir,
  3. mesmo `laboratory`,
  4. `on_sale = true`.
- Limit 8, distintos, excluir produto atual.
- Mostrar preço Pix quando `resolvePixPercentage` > 0 (usar helper existente).
- Manter botão "Peça agora via WhatsApp".

## 7. Benefícios
- Atualizar `BenefitCards` já bate com os 5 itens pedidos. Ajustar para virar `<Link>` clicável (whatsapp, /enviar-receita, /categoria/ofertas, etc.) e visual mais limpo (ícone em círculo accent, sem hover translate forte).

## Detalhes técnicos

- Migrações SQL (1 só): cria `home_mosaic_tiles`, `campaigns`, `campaign_products`, com GRANTs + RLS + policies públicas de leitura para registros ativos/publicados.
- Sem alterações em: `products`, `orders`, `prescriptions`, integrações Trier, auth, `store_settings`.
- React Query `staleTime` global já configurado; novas queries usam `eq("active", true)`.
- Tudo em frontend usa tokens semânticos do design system (sem cores hardcoded fora do que já está em uso).

## Ordem de execução
1. Migração SQL (mosaic + campaigns) — aguardar aprovação.
2. Atualizar types e implementar componentes/páginas em paralelo:
   - `CategoryNav` (mega menu)
   - `HeroSlider` (novos campos visuais)
   - `PromoMosaic` (dinâmico) + `AdminMosaic`
   - `PromoBanner` (ajuste visual)
   - `CampaignShelf` + `AdminCampaigns` + rotas
   - `ProductQuickView` (relacionados melhores + Pix)
   - `BenefitCards` (links)
3. Validação visual rápida na home.
