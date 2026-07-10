## Refatoração do Banner Principal da Home

Escopo isolado: apenas componente do hero, admin de banners e schema da tabela `banners`. Nada de checkout, Mercado Pago, Trier, produtos, estoque, pedidos ou menus.

### 1. Migration segura (aditiva) — tabela `banners`

Adicionar colunas novas sem remover nenhuma existente (banners atuais continuam funcionando). Defaults preenchidos para linhas antigas.

Novas colunas:
- `visual_model` text default `'auto'` — modelos: `oferta-semana`, `genericos`, `mundo-infantil`, `mundo-dermo`, `vitaminas`, `higiene-beleza`, `conveniencia`, `primeiros-socorros`, `campanha-vermelha`, `campanha-azul`, `campanha-verde`, `campanha-rosa`, `campanha-escura`
- `size_variant` text default `'hero-grande'` — `hero-grande`, `hero-medio`, `hero-compacto`, `full-width`, `container`, `banner-categoria`, `mobile-otimizado`
- `desktop_image_url` text (migra de `image_url`/`background_image_url` para nome canônico; mantém os antigos como fallback)
- `tablet_image_url` text
- `image_focus` text default `'center'` — `center`, `left`, `right`, `top`, `bottom`, `product-right`, `text-left`
- `image_alt` text
- `badge` text
- `highlight_price` numeric
- `secondary_image_url` text
- `autoplay_delay` int default 4000
- `transition_type` text default `'slide'` — `slide` | `fade`
- `linked_product_id` uuid (fk products, on delete set null)
- `linked_campaign_id` uuid (fk campaigns, on delete set null)
- `linked_category_id` uuid (fk categories, on delete set null)
- Renomeações lógicas via views/aliases no código: `sort_order` = `position` existente, `starts_at` = `start_date`, `ends_at` = `end_date`, `cta_url` = `link`

`banner_type` passa a aceitar: `auto` (produto/campanha montado no frontend), `image` (imagem pronta), `category`, `institutional`, `offer-price`, `offer-percent`.

RLS existente preservada. GRANTs revalidados.

### 2. Novo componente `HeroPromoCarousel`

Arquivo: `src/components/HeroPromoCarousel.tsx` (substitui uso de `HeroSlider` só em `Index.tsx`; `HeroSlider` fica no repositório mas sem consumidores).

Base técnica:
- `embla-carousel-react` + `embla-carousel-autoplay` (já disponíveis via shadcn carousel; instalar autoplay se faltar)
- Autoplay 4000ms (configurável por banner, usa menor delay entre slides como fallback global)
- Loop infinito, swipe mobile, setas + dots
- Pausa em hover, foco de teclado e enquanto o usuário interage com controles
- Transição slide ou fade (className condicional)
- `aria-label` em setas, dots, "Pausar/Retomar" toggle
- Primeira slide com `loading="eager"` + `fetchpriority="high"`, demais com `loading="lazy"`
- `aspect-ratio` no wrapper conforme `size_variant` para evitar layout shift

Cada slide delega a um sub-renderer:
- `<HeroSlideAuto />` — layout profissional com título, subtítulo, badge, preço/desconto, CTA, imagem do produto/campanha, aplicando `visual_model` (paleta + tipografia + composição) e `text_position` / `product_position`
- `<HeroSlideImage />` — apenas imagem pronta com `object-fit` conforme `image_fit` e `object-position` conforme `image_focus`; usa `mobile_image_url` no mobile, `tablet_image_url` no tablet, `desktop_image_url` no desktop
- `<HeroSlideCategory />` / `<HeroSlideOffer />` — variantes do auto com composições fixas

Responsividade: composições separadas para mobile (produto centralizado, título reduzido, CTA cheio de largura) e desktop; nunca só reduzir escala.

### 3. Modelos visuais (`src/lib/heroVisualModels.ts`)

Tabela declarativa mapeando `visual_model` → tokens: `background`, `accent`, `titleClass`, `subtitleClass`, `buttonClass`, `decor` (shapes SVG discretos). Todos usam design tokens do `index.css` — sem cores hardcoded.

13 modelos listados no pedido, cada um com paleta pronta (vermelho campanha, azul saúde, verde natural, rosa infantil, dark fitness, etc.).

### 4. Tamanhos (`src/lib/heroSizes.ts`)

Mapeia `size_variant` → `{ desktopAspect, minH, maxH, mobileAspect, container }`. Aplicado via classes Tailwind e style inline para `aspect-ratio`.

### 5. Admin — `AdminBanners.tsx`

Reformar o formulário existente adicionando:
- Select "Tipo de banner" (6 opções)
- Select "Modelo visual" (13 opções, com swatch de cor)
- Select "Tamanho do banner" (7 opções, com preview de proporção)
- Upload separado desktop / tablet / mobile (bucket `banners` já existe), com aviso de peso do arquivo (>1.5MB desktop, >800KB mobile)
- Recomendação de dimensões visível ao lado de cada upload
- Select "Encaixe da imagem" e "Foco da imagem"
- Campos de autoplay (delay, transição) por banner
- Datas início/fim, ordem, ativo, publicado (já existem — reorganizar)
- Campos condicionais: modo `image` esconde título/preço/CTA construído; modo `auto` esconde encaixe/foco

Novo `<HeroBannerPreview />`:
- Toggle Desktop / Tablet / Mobile
- Renderiza o mesmo `HeroSlideAuto` / `HeroSlideImage` do frontend com os valores do form em tempo real
- Mostra proporção real do `size_variant` escolhido

### 6. Acessibilidade & performance

- `alt` obrigatório para modo imagem (input `image_alt`)
- Navegação por teclado (setas ←/→, Espaço pausa)
- Botão "Pausar autoplay" visível em foco
- `prefers-reduced-motion` desativa autoplay
- Primeira imagem preload; resto lazy
- Aspect-ratio fixo por `size_variant` evita CLS

### 7. Arquivos afetados

**Criados:**
- `src/components/HeroPromoCarousel.tsx`
- `src/components/hero/HeroSlideAuto.tsx`
- `src/components/hero/HeroSlideImage.tsx`
- `src/components/hero/HeroBannerPreview.tsx`
- `src/lib/heroVisualModels.ts`
- `src/lib/heroSizes.ts`
- `supabase/migrations/<timestamp>_banner_pro_refactor.sql`

**Editados:**
- `src/pages/Index.tsx` (troca `HeroSlider` por `HeroPromoCarousel`)
- `src/pages/admin/AdminBanners.tsx` (novo form + preview)

**Intocados:** checkout, MP, Trier, produtos, estoque, pedidos, menus, header, footer.

### 8. Compatibilidade

Banners existentes carregam com `visual_model='auto'` e `size_variant='hero-grande'` por default; `desktop_image_url` recebe fallback de `image_url`/`background_image_url` via COALESCE no SELECT do componente. Nenhum banner atual quebra.

### Perguntas antes de executar

1. Instalo `embla-carousel-autoplay` (pequena dep, ~2KB) ou implemento autoplay manual com `setInterval` sobre o carousel do shadcn já presente?
2. Aplico defaults nas linhas existentes (todos viram `hero-grande` + `auto`) ou deixo `NULL` e trato no frontend?
3. Mantenho `HeroSlider.tsx` no repo como legado, ou removo já que ninguém mais usa?