## Escopo

Profissionalizar **Admin > Mosaico Home** e **Admin > Campanhas** para trabalharem com vínculos reais (produto / categoria / campanha) em vez de URL manual. Manter compatibilidade com dados antigos. Não tocar em produtos, carrinho, pedidos, auth, Trier.

---

## Parte 1 — Banco de dados (1 migração)

### Tabela `home_mosaic_tiles` — novos campos
- `link_type` text default `'manual'` — `product` | `category` | `campaign` | `manual`
- `product_id` uuid (nullable)
- `category_id` uuid (nullable)
- `campaign_id` uuid (nullable)
- `image_source` text default `'auto'` — `auto` | `upload` | `manual`
- `custom_image_url` text (nullable) — sobrescreve imagem do item vinculado
- `manual_link` text (nullable)
- `badge_preset` text (nullable) — preset de selo

Campos atuais (`title`, `subtitle`, `badge_text`, `cta_text`, `image_url`, `link`, `size`, `bg_style`, `position`, `active`) ficam como **override manual**.

### Tabela `campaigns` — novos campos
- `banner_mode` text default `'manual_url'` — `auto_products` | `upload` | `manual_url` | `none`
- `banner_destination` text default `'campaign'` — `campaign` | `category` | `product` | `manual`
- `destination_category_id` uuid (nullable)
- `destination_product_id` uuid (nullable)
- `show_on_home` boolean default false

### Tabela `campaign_products` — novo campo
- `featured_slot` smallint (nullable) — 1, 2 ou 3 (produto destaque do banner automático)

GRANTs já cobertos pelas políticas existentes (public read, admin write).

---

## Parte 2 — Admin > Mosaico Home (`AdminMosaic.tsx`)

- Adicionar select **"Tipo de vínculo"** (Produto / Categoria / Campanha / Manual).
- Conforme escolha, mostrar combobox de busca:
  - Produto: busca por nome / sku / barcode / laboratory / category_name.
  - Categoria: busca por nome.
  - Campanha: lista campanhas ativas.
- Ao selecionar, **pré-preencher** title, subtitle, image_url, link, badge (com regras: on_sale→Oferta, requires_prescription→Receita, controlled→Controlado).
- Campos manuais permanecem editáveis (override).
- **Imagem do bloco**: opções Usar do item vinculado / Upload (Supabase Storage bucket `banners`) / URL manual.
- **Selo**: select de presets + opção Personalizado libera input livre.
- **Preview real** ao lado do form usando o mesmo render do `PromoMosaic`.

## Parte 3 — Componente `PromoMosaic.tsx`

- Função `resolveTile(tile)` que aplica regra de prioridade:
  - title: manual ?? item.name
  - image: custom_image_url ?? item.image_url
  - link: manual_link ?? `/produto|categoria|campanha/{slug}`
  - badge: badge_text manual ?? badge_preset ?? auto do produto
- Buscar produtos/categorias/campanhas referenciados via React Query (uma query em lote por tipo).

## Parte 4 — Admin > Campanhas (`AdminCampaigns.tsx`)

- Campo **"Modo do banner"** (Automático com produtos / Upload / URL manual / Sem banner).
- Modo Upload: input file → Supabase Storage `banners` bucket → salva URL em `banner_image_url`.
- Modo URL manual: campo atual `banner_image_url` (marcado como avançado).
- Modo Automático: usa produtos vinculados (até 3 com `featured_slot` ou os 3 primeiros com imagem) e renderiza banner composto no preview e na página pública.
- **Destino do banner**: select (Campanha / Categoria / Produto / Manual) → gera `banner_link` automaticamente conforme escolha.
- Lista de produtos vinculados ganha botões "Destaque 1/2/3" gravando `featured_slot`.
- Checkbox **"Exibir na home"** (`show_on_home`).
- **Preview real** da campanha (banner + texto + CTA).
- Validações: auto sem produtos / upload sem imagem / manual sem link.

## Parte 5 — Página pública `/campanha/:slug`

- Nova rota em `App.tsx` → `src/pages/Campaign.tsx`.
- Renderiza: banner (conforme `banner_mode`), nome, subtítulo, CTA principal, produtos vinculados (`ProductShelf`), botão WhatsApp.
- Componente `CampaignAutoBanner` reutilizável (texto à esquerda + até 3 produtos à direita, gradiente, sombra).

## Parte 6 — Home: CampaignShelf / HeroSlider / Mosaico
- `CampaignShelf` passa a respeitar `banner_mode` (usa auto banner quando aplicável).
- Não mexer no HeroSlider/PromoBanner agora além do necessário para que campanhas com `show_on_home` apareçam no `CampaignShelf` (já é o comportamento atual).

---

## Arquivos

**Novos**
- `supabase/migrations/<timestamp>_mosaic_campaign_links.sql`
- `src/pages/Campaign.tsx`
- `src/components/CampaignAutoBanner.tsx`
- `src/components/admin/EntityPicker.tsx` (combobox reutilizável para produto/categoria/campanha)

**Editados**
- `src/pages/admin/AdminMosaic.tsx`
- `src/pages/admin/AdminCampaigns.tsx`
- `src/components/PromoMosaic.tsx`
- `src/components/CampaignShelf.tsx` (mínimo, para suportar banner automático)
- `src/App.tsx` (registrar rota `/campanha/:slug`)

**Intocados**: PromoBanner, HeroSlider, produtos, carrinho, auth, Trier, pedidos, receitas.

---

## Ordem de execução

1. Rodar migração (pedir aprovação).
2. Implementar `EntityPicker`, `CampaignAutoBanner`, `Campaign.tsx`, rota.
3. Atualizar `PromoMosaic` (resolver vínculos).
4. Refatorar `AdminMosaic` e `AdminCampaigns`.
5. Ajuste mínimo em `CampaignShelf`.

Confirma para eu começar pela migração?
